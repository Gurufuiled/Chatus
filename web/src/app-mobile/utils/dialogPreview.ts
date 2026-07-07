import { resolveMediaUrl } from '@/services/mediaService';
import { groupCallSystemPreviewText } from '@/utils/groupCallSystemMessage';
import { isChatusStickerMessage } from '@/utils/stickerPayload';
import type { ChatSummary } from '@/types/chat';
import type { MappedMessage, MappedMedia } from '@/types/message';

const PREVIEW_TEXT_MAX = 80;

export interface DialogPreview {
  text: string;
  thumbnailUrls: string[];
  accentLabel: boolean;
}

function excerpt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PREVIEW_TEXT_MAX) return trimmed;
  return `${trimmed.slice(0, PREVIEW_TEXT_MAX - 1).trimEnd()}…`;
}

function resolveThumbnail(media: MappedMedia, preferRemoteForImage = false): string | null {
  const thumb = media.thumbnail_url?.trim();
  if (thumb) return resolveMediaUrl(thumb);

  if (preferRemoteForImage && media.remote_url?.trim()) {
    return resolveMediaUrl(media.remote_url);
  }

  return null;
}

function isVisualMedia(media: MappedMedia, msgType: string): boolean {
  const t = media.media_type?.toLowerCase();
  if (t === 'image' || t === 'video') return Boolean(media.remote_url?.trim() || media.thumbnail_url?.trim());
  return (msgType === 'image' || msgType === 'video') && Boolean(media.remote_url?.trim() || media.thumbnail_url?.trim());
}

function visualMediaItems(msg: MappedMessage): MappedMedia[] {
  return (msg.media ?? []).filter((item) => isVisualMedia(item, msg.msg_type));
}

function albumLabel(thumbnailCount: number, hasVideo: boolean): string {
  if (thumbnailCount <= 0) return hasVideo ? 'Медиа' : 'Фотография';
  if (hasVideo) return thumbnailCount > 1 ? `${thumbnailCount} медиа` : 'Видео';
  return thumbnailCount > 1 ? `${thumbnailCount} фото` : 'Фотография';
}

export function buildDialogPreviewFromMessage(msg: MappedMessage | null | undefined): DialogPreview {
  if (!msg || msg.is_deleted) {
    return { text: '', thumbnailUrls: [], accentLabel: false };
  }

  const groupCallText = groupCallSystemPreviewText(msg.content);
  if (groupCallText) {
    return { text: excerpt(groupCallText), thumbnailUrls: [], accentLabel: true };
  }

  if (msg.msg_type === 'text' && msg.content?.trim()) {
    const raw = msg.content.trim();
    if (isChatusStickerMessage(raw)) {
      return { text: 'Стикер', thumbnailUrls: [], accentLabel: true };
    }
    return { text: excerpt(raw), thumbnailUrls: [], accentLabel: false };
  }

  if (msg.msg_type === 'system') {
    return {
      text: excerpt(msg.content?.trim() || 'Системное сообщение'),
      thumbnailUrls: [],
      accentLabel: true,
    };
  }

  const visual = visualMediaItems(msg);
  const caption = msg.content?.trim() ?? '';

  if (visual.length > 1) {
    const hasVideo = visual.some(
      (item) => item.media_type?.toLowerCase() === 'video' || msg.msg_type === 'video',
    );
    const thumbnailUrls = visual
      .slice(0, 3)
      .map((item) =>
        resolveThumbnail(
          item,
          item.media_type?.toLowerCase() === 'image' || msg.msg_type === 'image',
        ),
      )
      .filter((url): url is string => Boolean(url));
    const hasCaption = caption.length > 0;
    return {
      text: hasCaption ? excerpt(caption) : albumLabel(thumbnailUrls.length, hasVideo),
      thumbnailUrls,
      accentLabel: !hasCaption,
    };
  }

  if (msg.msg_type === 'image') {
    const first = msg.media?.[0];
    const thumb = first ? resolveThumbnail(first, true) : null;
    const hasCaption = caption.length > 0;
    return {
      text: hasCaption ? excerpt(caption) : 'Фотография',
      thumbnailUrls: thumb ? [thumb] : [],
      accentLabel: !hasCaption,
    };
  }

  if (msg.msg_type === 'video' || msg.msg_type === 'video_note') {
    const first = msg.media?.[0];
    const thumb = first ? resolveThumbnail(first, false) : null;
    const hasCaption = caption.length > 0;
    const label = msg.msg_type === 'video_note' ? 'Видеосообщение' : hasCaption ? excerpt(caption) : 'Видео';
    return {
      text: label,
      thumbnailUrls: thumb ? [thumb] : [],
      accentLabel: !hasCaption,
    };
  }

  if (msg.msg_type === 'voice') {
    return { text: 'Голосовое', thumbnailUrls: [], accentLabel: true };
  }

  if (msg.msg_type === 'file') {
    const name = msg.media?.[0]?.file_name?.trim();
    return { text: name || 'Файл', thumbnailUrls: [], accentLabel: !name };
  }

  if (msg.msg_type === 'sticker') {
    return { text: 'Стикер', thumbnailUrls: [], accentLabel: true };
  }

  return {
    text: caption ? excerpt(caption) : 'Сообщение',
    thumbnailUrls: [],
    accentLabel: false,
  };
}

export function buildDialogPreviewForChat(chat: ChatSummary): DialogPreview {
  if (chat.last_message) {
    return buildDialogPreviewFromMessage(chat.last_message);
  }

  const fallback = chat.last_message_preview?.trim() || '';
  const groupCallText = groupCallSystemPreviewText(fallback);
  if (groupCallText) {
    return { text: excerpt(groupCallText), thumbnailUrls: [], accentLabel: true };
  }

  return { text: fallback, thumbnailUrls: [], accentLabel: false };
}
