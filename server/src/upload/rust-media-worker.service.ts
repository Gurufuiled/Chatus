import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export interface RustMediaInspectionResult {
  kind: string;
  mime_type: string;
  file_name: string;
  file_size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  thumbnail_path: string | null;
  waveform: number[];
}

type RustMediaWorkerInput = {
  filePath: string;
  mimeType: string;
  originalName: string;
  fileSize: number;
};

@Injectable()
export class RustMediaWorkerService {
  private readonly logger = new Logger(RustMediaWorkerService.name);
  private readonly timeoutMs = this.resolveTimeoutMs();

  async inspectSavedFile(
    input: RustMediaWorkerInput,
  ): Promise<RustMediaInspectionResult | null> {
    if (!this.isEnabled()) {
      return null;
    }
    if (!this.supportsInspection(input.mimeType)) {
      return null;
    }

    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      this.logger.warn(
        'RUST_MEDIA_WORKER_ENABLED is on, but media-worker binary was not found. Falling back to plain upload metadata.',
      );
      return null;
    }

    try {
      return await this.runInspect(binaryPath, input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Rust media worker inspection failed. Falling back to plain upload metadata. Reason: ${message}`,
      );
      return null;
    }
  }

  private isEnabled(): boolean {
    const raw = process.env.RUST_MEDIA_WORKER_ENABLED?.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private supportsInspection(mimeType: string): boolean {
    return (
      mimeType.startsWith('image/') ||
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('video/')
    );
  }

  private resolveBinaryPath(): string | null {
    const explicit = process.env.RUST_MEDIA_WORKER_BIN?.trim();
    if (explicit && existsSync(explicit)) {
      return explicit;
    }

    const exeName =
      process.platform === 'win32' ? 'media-worker.exe' : 'media-worker';
    const candidates = [
      join(process.cwd(), '..', 'rust', 'target', 'release', exeName),
      join(process.cwd(), '..', 'rust', 'target', 'debug', exeName),
      join(process.cwd(), 'rust', 'target', 'release', exeName),
      join(process.cwd(), 'rust', 'target', 'debug', exeName),
    ];

    return candidates.find((value) => existsSync(value)) ?? null;
  }

  private runInspect(
    binaryPath: string,
    input: RustMediaWorkerInput,
  ): Promise<RustMediaInspectionResult> {
    return new Promise((resolve, reject) => {
      const args = [
        'inspect',
        '--file',
        input.filePath,
        '--mime',
        input.mimeType,
        '--name',
        input.originalName,
        '--size',
        String(input.fileSize),
      ];

      const child = spawn(binaryPath, args, {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timeoutId = setTimeout(() => {
        child.kill();
        reject(
          new Error(
            `media-worker timed out after ${this.timeoutMs}ms while inspecting ${input.originalName}`,
          ),
        );
      }, this.timeoutMs);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code !== 0) {
          reject(
            new Error(
              `media-worker exited with code ${code}. stderr: ${stderr.trim() || '(empty)'}`,
            ),
          );
          return;
        }

        try {
          const parsed = JSON.parse(
            stdout,
          ) as Partial<RustMediaInspectionResult>;
          resolve(this.normalizeInspectionResult(parsed, input));
        } catch (err) {
          reject(
            new Error(
              `Failed to parse media-worker JSON. stdout: ${stdout.trim() || '(empty)'}. error: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
        }
      });
    });
  }

  private resolveTimeoutMs(): number {
    const raw = Number(process.env.RUST_MEDIA_WORKER_TIMEOUT_MS ?? '120000');
    if (!Number.isFinite(raw) || raw <= 0) return 120_000;
    return Math.floor(raw);
  }

  private normalizeInspectionResult(
    parsed: Partial<RustMediaInspectionResult>,
    input: RustMediaWorkerInput,
  ): RustMediaInspectionResult {
    const kind =
      typeof parsed.kind === 'string' && parsed.kind.trim()
        ? parsed.kind.trim()
        : this.inferFallbackKind(input.mimeType);
    const mimeType =
      typeof parsed.mime_type === 'string' && parsed.mime_type.trim()
        ? parsed.mime_type.trim()
        : input.mimeType;
    const fileName =
      typeof parsed.file_name === 'string' && parsed.file_name.trim()
        ? parsed.file_name.trim()
        : input.originalName;
    const fileSize =
      typeof parsed.file_size === 'number' && Number.isFinite(parsed.file_size)
        ? parsed.file_size
        : input.fileSize;
    const width =
      typeof parsed.width === 'number' && Number.isFinite(parsed.width)
        ? parsed.width
        : null;
    const height =
      typeof parsed.height === 'number' && Number.isFinite(parsed.height)
        ? parsed.height
        : null;
    const durationMs =
      typeof parsed.duration_ms === 'number' &&
      Number.isFinite(parsed.duration_ms)
        ? parsed.duration_ms
        : null;
    const thumbnailPath =
      typeof parsed.thumbnail_path === 'string' && parsed.thumbnail_path.trim()
        ? parsed.thumbnail_path.trim()
        : null;
    const waveform = Array.isArray(parsed.waveform)
      ? parsed.waveform.filter(
          (value): value is number =>
            typeof value === 'number' && Number.isFinite(value),
        )
      : [];

    return {
      kind,
      mime_type: mimeType,
      file_name: fileName,
      file_size: fileSize,
      width,
      height,
      duration_ms: durationMs,
      thumbnail_path: thumbnailPath,
      waveform,
    };
  }

  private inferFallbackKind(mimetype: string): string {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('audio/')) return 'voice';
    if (mimetype.startsWith('video/')) return 'video';
    return 'file';
  }
}
