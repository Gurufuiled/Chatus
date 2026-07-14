import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { User } from '@prisma/client';
import type { IngestClientLogsDto } from './dto/ingest-client-logs.dto';

const DEFAULT_LOG_DIR = path.join(process.cwd(), 'logs', 'client');
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const RATE_LIMIT_MS = 3_000;
const RATE_MAP_MAX = 5_000;
const BAK_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ClientLogsService {
  private readonly logger = new Logger(ClientLogsService.name);
  private readonly lastIngestByUser = new Map<string, number>();
  private ensureDirPromise: Promise<void> | null = null;
  private lastCleanupMs = 0;

  private logDir(): string {
    const raw = (process.env.CLIENT_LOGS_DIR ?? '').trim();
    return raw.length > 0 ? raw : DEFAULT_LOG_DIR;
  }

  private async ensureLogDir(): Promise<void> {
    if (!this.ensureDirPromise) {
      this.ensureDirPromise = fs
        .mkdir(this.logDir(), { recursive: true })
        .then(() => undefined)
        .catch((err) => {
          this.ensureDirPromise = null;
          throw err;
        });
    }
    await this.ensureDirPromise;
  }

  private sanitize(text: string): string {
    return text
      .replace(/\+?\d[\d\s\-()]{8,}\d/g, '[phone]')
      .replace(/\b\d{4,8}\b/g, '[code]')
      .replace(/api[_-]?hash["'\s:=]+[a-f0-9]{8,}/gi, 'api_hash=[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
      .slice(0, 2000);
  }

  private noteUserIngest(userId: string, now: number): void {
    this.lastIngestByUser.set(userId, now);
    if (this.lastIngestByUser.size <= RATE_MAP_MAX) return;
    // Drop oldest half when map grows too large (long-lived API process).
    const entries = [...this.lastIngestByUser.entries()].sort((a, b) => a[1] - b[1]);
    const drop = Math.ceil(entries.length / 2);
    for (let i = 0; i < drop; i += 1) {
      this.lastIngestByUser.delete(entries[i]![0]);
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupMs < 60 * 60 * 1000) return;
    this.lastCleanupMs = now;
    try {
      const dir = this.logDir();
      const names = await fs.readdir(dir);
      for (const name of names) {
        if (!name.endsWith('.bak')) continue;
        const full = path.join(dir, name);
        const stat = await fs.stat(full).catch(() => null);
        if (!stat) continue;
        if (now - stat.mtimeMs > BAK_KEEP_MS) {
          await fs.unlink(full).catch(() => undefined);
        }
      }
    } catch {
      /* best-effort */
    }
  }

  private async rotateIfNeeded(filePath: string): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size < MAX_FILE_BYTES) return;
      const rotated = `${filePath}.${Date.now()}.bak`;
      await fs.rename(filePath, rotated);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        this.logger.warn(`client-log rotate failed: ${String(err)}`);
      }
    }
  }

  async ingest(user: User, dto: IngestClientLogsDto): Promise<{ accepted: number; skipped: boolean }> {
    const now = Date.now();
    const last = this.lastIngestByUser.get(user.id) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      return { accepted: 0, skipped: true };
    }
    this.noteUserIngest(user.id, now);

    await this.ensureLogDir();
    void this.cleanupOldBackups();
    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.logDir(), `client-${day}.log`);
    await this.rotateIfNeeded(filePath);

    const chunks: string[] = [];
    for (const line of dto.lines) {
      const payload = {
        ts: new Date(line.ts).toISOString(),
        recvAt: new Date(now).toISOString(),
        userId: user.id,
        handle: user.handle ?? null,
        platform: dto.platform,
        appVersion: dto.appVersion ?? null,
        build: dto.build ?? null,
        deviceModel: dto.deviceModel ?? null,
        level: line.level,
        tag: line.tag.slice(0, 64),
        message: this.sanitize(line.message),
        data: line.data ? this.sanitize(line.data).slice(0, 4000) : undefined,
      };
      chunks.push(`${JSON.stringify(payload)}\n`);

      const summary = `[client/${dto.platform}] u=${user.id} ${line.tag} ${payload.message}`;
      if (line.level === 'error') this.logger.error(summary);
      else if (line.level === 'warn') this.logger.warn(summary);
      else this.logger.log(summary);
    }

    await fs.appendFile(filePath, chunks.join(''), 'utf8');
    return { accepted: dto.lines.length, skipped: false };
  }
}
