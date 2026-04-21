import { resolveMediaUrl } from '../config';
import type { Message } from '../stores/types';

/**
 * Prefer HTTP URL from message.content (what the server stores for voice/video/file)
 * over optimistic file:// in media.remote_url after upload confirms.
 */
export function resolveVoiceMessageUri(message: Message): string | null {
  const first = message.media?.[0];
  const rawMedia = first?.remote_url?.trim();
  const content = message.content?.trim() ?? '';

  const resolvedContent =
    /^https?:\/\//i.test(content) ||
    content.startsWith('/uploads/') ||
    content.startsWith('/api/uploads/')
      ? resolveMediaUrl(content) ?? content
      : null;

  const resolvedMedia = rawMedia ? resolveMediaUrl(rawMedia) ?? rawMedia : null;

  if (resolvedContent?.startsWith('http')) return resolvedContent;
  if (resolvedMedia?.startsWith('http')) return resolvedMedia;
  if (resolvedMedia?.startsWith('file://') || resolvedMedia?.startsWith('content://'))
    return resolvedMedia;
  if (
    resolvedContent?.startsWith('file://') ||
    resolvedContent?.startsWith('content://')
  )
    return resolvedContent;
  return resolvedMedia ?? resolvedContent ?? null;
}
