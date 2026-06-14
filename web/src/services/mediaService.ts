import { getAccessToken } from './apiClient';
import type { MessageType } from '@/types/message';

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export interface UploadResult {
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
}

function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return base?.replace(/\/$/, '') ?? '';
}

export function resolveMediaUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = getApiBase().replace(/\/api\/?$/, '') || window.location.origin;
  return `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export async function uploadFile(file: File | Blob, fileName?: string): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`);
  }

  const formData = new FormData();
  const name =
    fileName ??
    (file instanceof File ? file.name : 'recording.webm');
  formData.append('file', file, name);

  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${getApiBase()}/api/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `Upload failed (${response.status})`;
    throw new Error(message);
  }

  return data as UploadResult;
}

const VOICE_MIME_CANDIDATES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export async function uploadVoiceBlob(blob: Blob): Promise<UploadResult> {
  let lastError: unknown = null;
  for (const mime of VOICE_MIME_CANDIDATES) {
    try {
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      return await uploadFile(new File([blob], `voice.${ext}`, { type: mime }));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Voice upload failed');
}

export function inferMsgTypeFromUpload(
  file: File,
  upload: UploadResult,
): MessageType {
  const kind = upload.media_kind?.toLowerCase();
  if (kind === 'voice') return 'voice';
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'file';
  return 'file';
}

export function buildMediaPayload(upload: UploadResult) {
  return {
    url: resolveMediaUrl(upload.url),
    mime_type: upload.mime_type,
    file_name: upload.file_name,
    file_size: upload.file_size,
    sha256: upload.sha256,
    width: upload.width ?? undefined,
    height: upload.height ?? undefined,
    duration_ms: upload.duration_ms ?? undefined,
    thumbnail_url: upload.thumbnail_path
      ? resolveMediaUrl(upload.thumbnail_path)
      : undefined,
    waveform: upload.waveform?.length ? upload.waveform : undefined,
  };
}
