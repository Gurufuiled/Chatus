import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import {
  downloadTdlibFile,
  getNestedRecord,
} from './tdlibMapping';

/** Одна строка в списке диалогов — как в Telegram. */
const DIALOG_PREVIEW_TEXT_MAX = 80;

export type TelegramDialogPreview = {
  text: string;
  thumbnailUris: string[];
  /** Подпись в стиле Telegram («Фотография», «Видео») — accent-цвет. */
  accentLabel: boolean;
};

function getFormattedText(value: unknown): string {
  const text = getNestedRecord(value);
  return typeof text?.text === 'string' ? text.text.trim() : '';
}

function getCaption(content: Record<string, unknown> | null): string {
  if (!content) return '';
  return getFormattedText(content.caption);
}

function excerptDialogPreviewText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= DIALOG_PREVIEW_TEXT_MAX) return trimmed;
  return `${trimmed.slice(0, DIALOG_PREVIEW_TEXT_MAX - 1).trimEnd()}…`;
}

function isMediaMessageKind(kind: string | undefined): boolean {
  return (
    kind === 'messagePhoto' ||
    kind === 'messageAlbum' ||
    kind === 'messageVideo' ||
    kind === 'messageVideoNote'
  );
}

function minithumbnailDataUri(photo: Record<string, unknown> | null): string | null {
  const mini = getNestedRecord(photo?.minithumbnail);
  const data = mini?.data;
  if (typeof data === 'string' && data.length > 8) {
    return `data:image/jpeg;base64,${data}`;
  }
  return null;
}

async function fetchFullLastMessage(
  chatId: number,
  last: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const msgId = typeof last.id === 'number' ? last.id : Number(last.id);
  if (!Number.isFinite(msgId) || msgId <= 0) return last;
  try {
    const full = (await tdlibClient.send({
      '@type': 'getMessage',
      chat_id: chatId,
      message_id: msgId,
    })) as Record<string, unknown>;
    throwIfTdError(full);
    return full;
  } catch {
    return last;
  }
}

function getTdFileLocalUri(file: Record<string, unknown> | null): string | null {
  const local = getNestedRecord(file?.local);
  const path = typeof local?.path === 'string' ? local.path.trim() : '';
  return path ? `file://${path}` : null;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getPhotoSizeForThumbnail(photo: Record<string, unknown> | null): Record<string, unknown> | null {
  const sizes = Array.isArray(photo?.sizes) ? photo.sizes : [];
  const byPreference = ['s', 'm', 'x', 'y', 'w', 'a'];
  for (const type of byPreference) {
    const match = sizes
      .map((item) => getNestedRecord(item))
      .find((size) => size?.type === type && getNestedRecord(size.photo));
    if (match) return match;
  }

  let smallest: Record<string, unknown> | null = null;
  let smallestArea = Number.POSITIVE_INFINITY;
  for (const item of sizes) {
    const size = getNestedRecord(item);
    const file = getNestedRecord(size?.photo);
    if (!size || !file) continue;
    const width = getNumber(size.width) ?? 0;
    const height = getNumber(size.height) ?? 0;
    const area = width * height;
    if (area > 0 && area < smallestArea) {
      smallest = size;
      smallestArea = area;
    }
  }
  return smallest;
}

async function resolvePhotoThumbnailUri(photo: Record<string, unknown> | null): Promise<string | null> {
  const miniUri = minithumbnailDataUri(photo);
  if (miniUri) return miniUri;

  const size = getPhotoSizeForThumbnail(photo);
  const file = getNestedRecord(size?.photo);
  if (!file) return null;
  const localUri = getTdFileLocalUri(file);
  if (localUri) return localUri;
  const fileId = typeof file.id === 'number' ? file.id : null;
  return fileId != null ? downloadTdlibFile(fileId).catch(() => null) : null;
}

async function resolveVideoThumbnailUri(
  container: Record<string, unknown> | null,
): Promise<string | null> {
  const thumbnail = getNestedRecord(container?.thumbnail);
  const thumbnailFile = getNestedRecord(thumbnail?.file);
  if (!thumbnailFile) return null;
  const localUri = getTdFileLocalUri(thumbnailFile);
  if (localUri) return localUri;
  const fileId = typeof thumbnailFile.id === 'number' ? thumbnailFile.id : null;
  return fileId != null ? downloadTdlibFile(fileId).catch(() => null) : null;
}

function mediaLabel(text: string, accent = true): TelegramDialogPreview {
  return { text, thumbnailUris: [], accentLabel: accent };
}

/**
 * Строит превью последнего сообщения для строки списка диалогов (как в Telegram).
 */
function photoMediaPreview(caption: string, thumb: string | null): TelegramDialogPreview {
  const hasCaption = caption.length > 0;
  return {
    text: hasCaption ? excerptDialogPreviewText(caption) : 'Фотография',
    thumbnailUris: thumb ? [thumb] : [],
    accentLabel: !hasCaption,
  };
}

export async function buildDialogPreviewFromChat(
  chat: Record<string, unknown>,
  chatId?: number,
): Promise<TelegramDialogPreview> {
  let last = getNestedRecord(chat.last_message);
  if (!last) {
    return { text: '', thumbnailUris: [], accentLabel: false };
  }

  let content = getNestedRecord(last.content);
  if (!content) {
    return { text: '', thumbnailUris: [], accentLabel: false };
  }

  let kind = content['@type'] as string | undefined;
  if (chatId != null && Number.isFinite(chatId) && isMediaMessageKind(kind)) {
    last = await fetchFullLastMessage(chatId, last);
    content = getNestedRecord(last.content) ?? content;
    kind = content['@type'] as string | undefined;
  }

  const caption = getCaption(content);

  if (kind === 'messageText') {
    return {
      text: excerptDialogPreviewText(getFormattedText(content.text)),
      thumbnailUris: [],
      accentLabel: false,
    };
  }

  if (kind === 'messagePhoto') {
    const photo = getNestedRecord(content.photo);
    const thumb = await resolvePhotoThumbnailUri(photo);
    return photoMediaPreview(caption, thumb);
  }

  if (kind === 'messageAlbum') {
    const rawPhotos = Array.isArray(content.photos) ? content.photos : [];
    const thumbResults = await Promise.all(
      rawPhotos.slice(0, 3).map(async (item) => {
        const photo = getNestedRecord(item);
        if (!photo) return null;
        return resolvePhotoThumbnailUri(photo);
      }),
    );
    const thumbnailUris = thumbResults.filter((uri): uri is string => Boolean(uri));
    const hasCaption = caption.length > 0;
    const text = hasCaption
      ? excerptDialogPreviewText(caption)
      : thumbnailUris.length > 1
        ? `${thumbnailUris.length} фото`
        : 'Фотография';
    return {
      text,
      thumbnailUris,
      accentLabel: !hasCaption,
    };
  }

  if (kind === 'messageVideo') {
    const thumb = await resolveVideoThumbnailUri(getNestedRecord(content.video));
    const hasCaption = caption.length > 0;
    return {
      text: hasCaption ? excerptDialogPreviewText(caption) : 'Видео',
      thumbnailUris: thumb ? [thumb] : [],
      accentLabel: !hasCaption,
    };
  }

  if (kind === 'messageVideoNote') {
    const thumb = await resolveVideoThumbnailUri(getNestedRecord(content.video_note));
    return {
      text: 'Видеосообщение',
      thumbnailUris: thumb ? [thumb] : [],
      accentLabel: true,
    };
  }

  if (kind === 'messageVoiceNote') {
    return mediaLabel('Голосовое');
  }

  if (kind === 'messageDocument') {
    const document = getNestedRecord(content.document);
    const name = typeof document?.file_name === 'string' ? document.file_name.trim() : '';
    return mediaLabel(name || 'Файл', !name);
  }

  if (kind === 'messageSticker') {
    return mediaLabel('Стикер');
  }

  if (kind === 'messageAnimation') {
    return mediaLabel('GIF');
  }

  return { text: caption, thumbnailUris: [], accentLabel: false };
}

/** Синхронный fallback без миниатюр (для поиска / быстрого отображения). */
export function previewTextFromChat(chat: Record<string, unknown>): string {
  const last = getNestedRecord(chat.last_message);
  const content = getNestedRecord(last?.content);
  if (!content) return '';
  const kind = content['@type'] as string | undefined;
  const caption = getCaption(content);
  if (kind === 'messageText') return getFormattedText(content.text);
  if (kind === 'messagePhoto') return caption || 'Фотография';
  if (kind === 'messageAlbum') return caption || 'Фотография';
  if (kind === 'messageVideo') return caption || 'Видео';
  if (kind === 'messageVideoNote') return 'Видеосообщение';
  if (kind === 'messageVoiceNote') return 'Голосовое';
  if (kind === 'messageDocument') {
    const document = getNestedRecord(content.document);
    return typeof document?.file_name === 'string' ? document.file_name.trim() || 'Файл' : 'Файл';
  }
  if (kind === 'messageSticker') return 'Стикер';
  if (kind === 'messageAnimation') return 'GIF';
  return caption;
}
