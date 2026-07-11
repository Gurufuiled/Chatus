import { resolveMediaUrl } from '../config';
import type { Chat } from '../stores/types';
import type { Message } from '../stores/types';
import { isChatusStickerMessage } from '../stickers/chatusStickerCatalog';
import { getCompositeTextBody, tryParseCompositeMessage } from '../stickers/chatusCompositePayload';
import { formatGroupCallDialogPreview } from './groupCallSystemMessage';

const DIALOG_PREVIEW_TEXT_MAX = 80;

export type ChatusDialogPreview = {
  text: string;
  thumbnailUris: string[];
  /** Подпись в стиле Telegram («Фотография», «Видео») — accent-цвет. */
  accentLabel: boolean;
};

function excerptDialogPreviewText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= DIALOG_PREVIEW_TEXT_MAX) return trimmed;
  return `${trimmed.slice(0, DIALOG_PREVIEW_TEXT_MAX - 1).trimEnd()}…`;
}

function sanitizeRawDialogPreview(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  if (isChatusStickerMessage(text)) return 'Стикер';

  // Defensive normalization for transient raw payload/log flashes in chat list.
  if (/messageVoiceNote|voice_note|\"msg_type\"\s*:\s*\"voice\"/i.test(text)) return 'Голосовое';
  if (/messageVideoNote|video_note/i.test(text)) return 'Видеосообщение';
  if (/messageSticker|sticker/i.test(text)) return 'Стикер';
  if (/messagePhoto|\"msg_type\"\s*:\s*\"image\"/i.test(text)) return 'Фотография';
  if (/messageVideo|\"msg_type\"\s*:\s*\"video\"/i.test(text)) return 'Видео';

  // If a backend/transport payload leaks into preview, hide technical text.
  const looksLikePayload =
    text.startsWith('{') ||
    text.startsWith('[') ||
    text.includes('"@type"') ||
    text.includes('"message"') ||
    text.includes('line_sync') ||
    text.includes('transport') ||
    text.includes('payload');
  if (looksLikePayload) return 'Сообщение';

  return excerptDialogPreviewText(text);
}

function resolveStoredMediaUri(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('file://') || trimmed.startsWith('content://')) {
    return trimmed;
  }
  return resolveMediaUrl(trimmed) ?? trimmed;
}

function resolveMediaThumbnailUri(
  media: NonNullable<Message['media']>[number],
  preferRemoteForImage = false,
): string | null {
  const thumbUrl = resolveStoredMediaUri(media.thumbnail_url);
  if (thumbUrl) return thumbUrl;

  const thumbPath = media.thumbnail_path?.trim();
  if (thumbPath) {
    return thumbPath.startsWith('file://') ? thumbPath : `file://${thumbPath}`;
  }

  const localPath = (media as { local_path?: string | null }).local_path?.trim();
  if (localPath) {
    return localPath.startsWith('file://') || localPath.startsWith('content://')
      ? localPath
      : `file://${localPath}`;
  }

  if (preferRemoteForImage) {
    return resolveStoredMediaUri(media.remote_url);
  }

  return null;
}

function isVisualMediaType(mediaType: string | undefined): boolean {
  const t = mediaType?.toLowerCase();
  return t === 'image' || t === 'video';
}

function hasResolvableVisualSource(media: NonNullable<Message['media']>[number]): boolean {
  return Boolean(
    media.remote_url?.trim() ||
      media.thumbnail_url?.trim() ||
      media.thumbnail_path?.trim() ||
      (media as { local_path?: string | null }).local_path?.trim(),
  );
}

function visualMediaItems(msg: Message) {
  return (msg.media ?? []).filter((item) => {
    if (isVisualMediaType(item.media_type)) return hasResolvableVisualSource(item);
    if (msg.msg_type === 'image' || msg.msg_type === 'video') {
      return hasResolvableVisualSource(item);
    }
    return false;
  });
}

function albumPreviewLabel(thumbnailCount: number, hasVideo: boolean): string {
  if (thumbnailCount <= 0) return hasVideo ? 'Медиа' : 'Фотография';
  if (hasVideo) return thumbnailCount > 1 ? `${thumbnailCount} медиа` : 'Видео';
  return thumbnailCount > 1 ? `${thumbnailCount} фото` : 'Фотография';
}

function textPreviewFromContent(msg: Message): ChatusDialogPreview | null {
  if (msg.msg_type !== 'text' || !msg.content?.trim()) return null;
  const raw = msg.content.trim();
  const composite = tryParseCompositeMessage(raw);
  if (composite) {
    const body = getCompositeTextBody(composite).trim();
    if (body.length) {
      return {
        text: excerptDialogPreviewText(body),
        thumbnailUris: [],
        accentLabel: false,
      };
    }
    return { text: 'Стикер', thumbnailUris: [], accentLabel: true };
  }
  if (isChatusStickerMessage(raw)) {
    return { text: 'Стикер', thumbnailUris: [], accentLabel: true };
  }
  return {
    text: excerptDialogPreviewText(raw),
    thumbnailUris: [],
    accentLabel: false,
  };
}

/** Превью последнего сообщения Chatus для строки списка чатов (как Telegram). */
export function buildChatusDialogPreviewFromMessage(
  msg: Message | null | undefined,
): ChatusDialogPreview {
  if (!msg || msg.is_deleted === 1) {
    return { text: '', thumbnailUris: [], accentLabel: false };
  }

  const groupCallPreview = formatGroupCallDialogPreview(msg.content);
  if (groupCallPreview || msg.msg_type === 'system') {
    return {
      text: groupCallPreview ?? 'Системное сообщение',
      thumbnailUris: [],
      accentLabel: true,
    };
  }

  const textOnly = textPreviewFromContent(msg);
  if (textOnly) return textOnly;

  const visual = visualMediaItems(msg);
  if (visual.length > 1) {
    const caption = msg.content?.trim() ?? '';
    const hasVideo = visual.some(
      (item) => item.media_type?.toLowerCase() === 'video' || msg.msg_type === 'video',
    );
    const thumbnailUris = visual
      .slice(0, 3)
      .map((item) =>
        resolveMediaThumbnailUri(item, item.media_type?.toLowerCase() === 'image' || msg.msg_type === 'image'),
      )
      .filter((uri): uri is string => Boolean(uri));
    const hasCaption = caption.length > 0;
    return {
      text: hasCaption
        ? excerptDialogPreviewText(caption)
        : albumPreviewLabel(thumbnailUris.length, hasVideo),
      thumbnailUris,
      accentLabel: !hasCaption,
    };
  }

  const caption = msg.content?.trim() ?? '';

  if (msg.msg_type === 'image') {
    const first = msg.media?.[0];
    const thumb = first ? resolveMediaThumbnailUri(first, true) : null;
    const hasCaption = caption.length > 0;
    return {
      text: hasCaption ? excerptDialogPreviewText(caption) : 'Фотография',
      thumbnailUris: thumb ? [thumb] : [],
      accentLabel: !hasCaption,
    };
  }

  if (msg.msg_type === 'video') {
    const first = msg.media?.[0];
    const thumb = first ? resolveMediaThumbnailUri(first, false) : null;
    const hasCaption = caption.length > 0;
    return {
      text: hasCaption ? excerptDialogPreviewText(caption) : 'Видео',
      thumbnailUris: thumb ? [thumb] : [],
      accentLabel: !hasCaption,
    };
  }

  if (msg.msg_type === 'video_note') {
    const first = msg.media?.[0];
    const thumb = first ? resolveMediaThumbnailUri(first, false) : null;
    return {
      text: 'Видеосообщение',
      thumbnailUris: thumb ? [thumb] : [],
      accentLabel: true,
    };
  }

  if (msg.msg_type === 'voice') {
    return { text: 'Голосовое', thumbnailUris: [], accentLabel: true };
  }

  if (msg.msg_type === 'file') {
    const name = msg.media?.[0]?.file_name?.trim();
    return {
      text: name || 'Файл',
      thumbnailUris: [],
      accentLabel: !name,
    };
  }

  return {
    text: caption ? excerptDialogPreviewText(caption) : 'Сообщение',
    thumbnailUris: [],
    accentLabel: false,
  };
}

export function buildChatusDialogPreviewForChat(
  chat: Chat,
  lastMessage: Message | null | undefined,
): ChatusDialogPreview {
  if (lastMessage) {
    return buildChatusDialogPreviewFromMessage(lastMessage);
  }

  const rawFallback =
    chat.last_message_preview?.trim() ||
    (chat.chat_type === 'channel' ? chat.description?.trim() || 'Канал' : '');
  const fallback = sanitizeRawDialogPreview(rawFallback);

  const groupCallPreview = formatGroupCallDialogPreview(fallback);
  if (groupCallPreview) {
    return {
      text: groupCallPreview,
      thumbnailUris: [],
      accentLabel: true,
    };
  }

  return {
    text: fallback,
    thumbnailUris: [],
    accentLabel: false,
  };
}
