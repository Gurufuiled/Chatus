import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MAX_FILE_SIZE, MAX_REMOTE_AVATAR_BYTES } from './upload.constants';
import { RustMediaWorkerService } from './rust-media-worker.service';
import { isAllowedAvatarDownloadUrl } from '../auth/loginus-profile.util';

const UPLOAD_DIR = 'uploads';
const ALLOWED_MIME_REGEX = /^(image\/(?!svg)|audio\/|video\/|application\/pdf)/;
const REMOTE_AVATAR_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif|heic|heif)(;.*)?$/i;

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
   * Download a remote image (Loginus allowlisted hosts only) into local uploads.
   * Filename is content-addressed by source URL so repeated syncs reuse the file.
   * Returns `/uploads/avatar-<hash>.<ext>` or null on failure / disallowed host.
   */
  async cacheRemoteAvatar(sourceUrl: string): Promise<string | null> {
    const trimmed = sourceUrl?.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
    if (!isAllowedAvatarDownloadUrl(trimmed)) {
      this.logger.warn(`Remote avatar host not allowlisted: ${trimmed}`);
      return null;
    }

    const urlHash = createHash('sha256').update(trimmed).digest('hex').slice(0, 32);
    const existing = this.findExistingCachedAvatar(urlHash);
    if (existing) return existing;

    try {
      const response = await axios.get<ArrayBuffer>(trimmed, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxRedirects: 0,
        maxContentLength: MAX_REMOTE_AVATAR_BYTES,
        maxBodyLength: MAX_REMOTE_AVATAR_BYTES,
        validateStatus: (status) => status >= 200 && status < 300,
        headers: { Accept: 'image/*,*/*;q=0.8' },
      });

      const buf = Buffer.from(response.data);
      if (buf.length === 0 || buf.length > MAX_REMOTE_AVATAR_BYTES) {
        this.logger.warn(`Remote avatar rejected by size: ${trimmed} (${buf.length}b)`);
        return null;
      }

      const contentTypeRaw = String(
        response.headers['content-type'] ?? '',
      ).split(';')[0]?.trim() || '';
      let mime = contentTypeRaw.toLowerCase();
      if (!REMOTE_AVATAR_MIME_RE.test(mime)) {
        mime = this.guessImageMimeFromUrl(trimmed) ?? '';
      }
      if (!REMOTE_AVATAR_MIME_RE.test(mime)) {
        this.logger.warn(`Remote avatar rejected by mime: ${trimmed} (${contentTypeRaw})`);
        return null;
      }

      const ext = this.extForImageMime(mime);
      const filename = `avatar-${urlHash}${ext}`;
      const filepath = join(this.uploadPath, filename);
      const fs = await import('fs/promises');
      await fs.writeFile(filepath, buf);
      return `/uploads/${filename}`;
    } catch (err) {
      this.logger.warn(
        `Failed to cache remote avatar ${trimmed}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private findExistingCachedAvatar(urlHash: string): string | null {
    const exts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'];
    for (const ext of exts) {
      const filename = `avatar-${urlHash}${ext}`;
      if (existsSync(join(this.uploadPath, filename))) {
        return `/uploads/${filename}`;
      }
    }
    return null;
  }

  private guessImageMimeFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      if (pathname.endsWith('.png')) return 'image/png';
      if (pathname.endsWith('.webp')) return 'image/webp';
      if (pathname.endsWith('.gif')) return 'image/gif';
      if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
      if (pathname.endsWith('.heic')) return 'image/heic';
      if (pathname.endsWith('.heif')) return 'image/heif';
    } catch {
      /* ignore */
    }
    return null;
  }

  private extForImageMime(mime: string): string {
    const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
    if (base === 'image/png') return '.png';
    if (base === 'image/webp') return '.webp';
    if (base === 'image/gif') return '.gif';
    if (base === 'image/heic') return '.heic';
    if (base === 'image/heif') return '.heif';
    return '.jpg';
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
