import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MAX_FILE_SIZE } from './upload.constants';
import { RustMediaWorkerService } from './rust-media-worker.service';

const UPLOAD_DIR = 'uploads';
const ALLOWED_MIME_REGEX = /^(image\/(?!svg)|audio\/|video\/|application\/pdf)/;

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadPath: string;

  constructor(private readonly rustMediaWorkerService: RustMediaWorkerService) {
    this.uploadPath = join(process.cwd(), UPLOAD_DIR);
    if (!existsSync(this.uploadPath)) {
      mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async saveFile(file: { originalname: string; mimetype: string; size: number; path?: string; buffer?: Buffer }): Promise<{
    url: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    sha256: string;
    media_kind: string;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
    thumbnail_path: string | null;
    waveform: number[];
  }> {
    if (!file || !file.originalname) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      );
    }
    if (file.mimetype === 'image/svg+xml') {
      throw new BadRequestException('SVG uploads are not allowed');
    }
    if (!ALLOWED_MIME_REGEX.test(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed: images, audio, video, PDF',
      );
    }

    const extMatch = file.originalname.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? '.' + extMatch[1].toLowerCase() : '';
    const filename = `${randomUUID()}${ext}`;
    const filepath = join(this.uploadPath, filename);

    const fs = await import('fs/promises');
    const buf = file.buffer;
    if (!buf) throw new BadRequestException('File buffer is empty');
    const sha256 = createHash('sha256').update(buf).digest('hex');
    try {
      await fs.writeFile(filepath, buf);
    } catch (err) {
      this.logger.error(
        `Failed to write upload to ${filepath}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to save file');
    }

    const inspected = await this.rustMediaWorkerService.inspectSavedFile({
      filePath: filepath,
      mimeType: file.mimetype,
      originalName: file.originalname,
      fileSize: file.size,
    });

    return {
      url: `/uploads/${filename}`,
      file_name: inspected?.file_name ?? file.originalname,
      mime_type: inspected?.mime_type ?? file.mimetype,
      file_size: inspected?.file_size ?? file.size,
      sha256,
      media_kind: inspected?.kind ?? this.inferFallbackKind(file.mimetype),
      width: inspected?.width ?? null,
      height: inspected?.height ?? null,
      duration_ms: inspected?.duration_ms ?? null,
      thumbnail_path: inspected?.thumbnail_path ?? null,
      waveform: inspected?.waveform ?? [],
    };
  }

  private inferFallbackKind(mimetype: string): string {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('audio/')) return 'voice';
    if (mimetype.startsWith('video/')) return 'video';
    return 'file';
  }

  /**
   * Best-effort delete of a file under local `uploads/` (mailbox trim / ack).
   * Accepts `/uploads/<file>` or full URL containing that path.
   */
  async tryDeleteServerStoredUpload(remoteUrlOrPath: string | null | undefined): Promise<void> {
    if (!remoteUrlOrPath || typeof remoteUrlOrPath !== 'string') return;
    const trimmed = remoteUrlOrPath.trim();
    const m = trimmed.match(/\/uploads\/([^?#]+)/);
    if (!m?.[1]) return;
    const safeName = m[1].replace(/\\/g, '/').split('/').pop();
    if (!safeName || safeName.includes('..')) return;

    const filepath = join(this.uploadPath, safeName);
    const fs = await import('fs/promises');
    await fs.unlink(filepath).catch(() => undefined);
  }
}
