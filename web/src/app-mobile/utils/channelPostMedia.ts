import type { MappedMedia, MappedMessage } from '@/types/message';

/** Mirrors mobile `getVisualMediaKind`. */
export function getVisualMediaKind(
  message: Pick<MappedMessage, 'msg_type'>,
  media: MappedMedia,
): 'image' | 'video' {
  const mediaType = media.media_type?.toLowerCase();
  if (mediaType === 'video') return 'video';
  if (mediaType === 'image') return 'image';
  return message.msg_type === 'video' ? 'video' : 'image';
}

export function getChannelPostAlbumMedia(message: MappedMessage): MappedMedia[] {
  return (message.media ?? []).filter((entry) => entry.remote_url?.trim()).slice(0, 10);
}

export function isChannelAlbumPost(message: MappedMessage): boolean {
  if (message.msg_type !== 'image' && message.msg_type !== 'video') return false;
  return getChannelPostAlbumMedia(message).length > 1;
}

export function formatChannelMediaDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Mirrors mobile ChannelFeedScreen media clamp constants. */
export function getChannelMediaLimits(viewportWidth: number, viewportHeight: number) {
  return {
    maxWidth: Math.min(viewportWidth * 0.72, 320),
    maxHeight: Math.min(viewportHeight * 0.5, 380),
    minPortraitWidth: 154,
  };
}

/** Mirrors mobile `computeChannelMediaWidth` + height from aspect ratio. */
export function computeChannelMediaDisplaySize(
  rawWidth: number | null | undefined,
  rawHeight: number | null | undefined,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 390,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 844,
): { width: number; height: number } {
  const { maxWidth, maxHeight, minPortraitWidth } = getChannelMediaLimits(
    viewportWidth,
    viewportHeight,
  );
  const fallback = Math.min(maxWidth, 240);

  if (!rawWidth || !rawHeight || rawWidth <= 0 || rawHeight <= 0) {
    return { width: fallback, height: fallback };
  }

  const baseScale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight, 1);
  let width = Math.round(rawWidth * baseScale);
  let height = Math.round(rawHeight * baseScale);

  const isPortrait = rawHeight / rawWidth > 1.28;
  if (isPortrait && width < minPortraitWidth) {
    const minWidthScale = minPortraitWidth / rawWidth;
    const safeScale = Math.min(
      Math.max(baseScale, minWidthScale),
      maxHeight / rawHeight,
      1,
    );
    width = Math.round(rawWidth * safeScale);
    height = Math.round(rawHeight * safeScale);
  }

  width = Math.min(Math.max(width, 120), maxWidth);
  height = Math.round((rawHeight / rawWidth) * width);
  height = Math.min(height, maxHeight);

  return { width, height };
}
