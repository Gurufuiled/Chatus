/**
 * Channel discussion posts comments via HTTP with media URLs.
 * Local file URIs must be uploaded first (same as TransportService for normal chats).
 */

import { API_BASE_URL } from '../config';
import { apiUpload, apiUploadVoice } from './apiClient';
import type { Message } from '../stores/types';

export function getUploadBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/?$/, '') || API_BASE_URL;
}

export type DiscussionMediaPayload = {
  url?: string;
  waveform?: number[];
  duration_ms?: number;
  thumbnail_url?: string;
  is_round?: boolean;
  width?: number;
  height?: number;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
};

function fullUploadUrl(pathOrUrl: string): string {
  return `${getUploadBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function isRemoteOrUploaded(url: string | undefined): boolean {
  if (!url) return true;
  return /^https?:\/\//i.test(url) || url.startsWith('/uploads/');
}

/**
 * Upload local media if needed; returns payload safe to send in discussion POST body.
 */
export async function ensureDiscussionMediaUploaded(
  msgType: Message['msg_type'],
  media: DiscussionMediaPayload,
): Promise<DiscussionMediaPayload> {
  const raw = media.url ?? '';
  if (!raw || isRemoteOrUploaded(raw)) {
    return media;
  }

  if (msgType === 'voice') {
    const r = await apiUploadVoice({ uri: raw, name: 'voice.m4a' });
    const fullUrl = fullUploadUrl(r.url);
    return {
      ...media,
      url: fullUrl,
      duration_ms: r.duration_ms ?? media.duration_ms ?? undefined,
      mime_type: r.mime_type ?? media.mime_type,
      file_name: r.file_name ?? media.file_name,
      file_size: r.file_size ?? media.file_size,
      waveform:
        media.waveform && media.waveform.length > 0
          ? media.waveform
          : r.waveform && r.waveform.length > 0
            ? r.waveform
            : undefined,
    };
  }

  if (msgType === 'video_note') {
    const r = await apiUpload({
      uri: raw,
      name: 'video_note.mp4',
      type: 'video/mp4',
    });
    const fullUrl = fullUploadUrl(r.url);
    const thumbnailUrl = r.thumbnail_path ? fullUploadUrl(r.thumbnail_path) : media.thumbnail_url;
    return {
      ...media,
      url: fullUrl,
      thumbnail_url: thumbnailUrl,
      duration_ms: r.duration_ms ?? media.duration_ms ?? undefined,
      mime_type: r.mime_type ?? media.mime_type,
      file_name: r.file_name ?? media.file_name,
      file_size: r.file_size ?? media.file_size,
      width: r.width ?? media.width ?? undefined,
      height: r.height ?? media.height ?? undefined,
    };
  }

  if (msgType === 'image') {
    const imageMime =
      media.mime_type ??
      ((media.file_name?.toLowerCase() ?? '').endsWith('.png') ? 'image/png' : 'image/jpeg');
    const imageName =
      media.file_name ?? (imageMime === 'image/png' ? 'image.png' : 'image.jpg');
    const r = await apiUpload({
      uri: raw,
      name: imageName,
      type: imageMime,
    });
    const fullUrl = fullUploadUrl(r.url);
    const thumb = r.thumbnail_path ? fullUploadUrl(r.thumbnail_path) : media.thumbnail_url;
    return {
      ...media,
      url: fullUrl,
      thumbnail_url: thumb,
      width: r.width ?? media.width ?? undefined,
      height: r.height ?? media.height ?? undefined,
      mime_type: r.mime_type ?? media.mime_type,
      file_name: r.file_name ?? media.file_name,
      file_size: r.file_size ?? media.file_size,
    };
  }

  if (msgType === 'video') {
    const r = await apiUpload({
      uri: raw,
      name: media.file_name ?? 'video.mp4',
      type: media.mime_type ?? 'video/mp4',
    });
    const fullUrl = fullUploadUrl(r.url);
    const thumb = r.thumbnail_path ? fullUploadUrl(r.thumbnail_path) : media.thumbnail_url;
    return {
      ...media,
      url: fullUrl,
      thumbnail_url: thumb,
      duration_ms: r.duration_ms ?? media.duration_ms ?? undefined,
      width: r.width ?? media.width ?? undefined,
      height: r.height ?? media.height ?? undefined,
      mime_type: r.mime_type ?? media.mime_type,
      file_name: r.file_name ?? media.file_name,
      file_size: r.file_size ?? media.file_size,
    };
  }

  if (msgType === 'file') {
    const r = await apiUpload({
      uri: raw,
      name: media.file_name ?? 'file.bin',
      type: media.mime_type ?? 'application/octet-stream',
    });
    return {
      ...media,
      url: fullUploadUrl(r.url),
      mime_type: r.mime_type ?? media.mime_type,
      file_name: r.file_name ?? media.file_name,
      file_size: r.file_size ?? media.file_size,
    };
  }

  return media;
}
