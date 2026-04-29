import type { Message } from '../stores/types';

const MAX_PREVIEW_LEN = 100;

/** Текст превью последнего сообщения в списке чатов (RU), без привязки к теме. */
export function buildMessageListPreviewText(msg: Message): string {
  if (msg.msg_type === 'text' && msg.content) {
    const t = msg.content.trim();
    if (!t.length) return 'Пустое сообщение';
    return t.length <= MAX_PREVIEW_LEN ? t : t.slice(0, MAX_PREVIEW_LEN) + '…';
  }
  if (msg.msg_type === 'image') {
    const cap = msg.content?.trim();
    return cap?.length ? `Фото: ${cap}` : 'Фото';
  }
  if (msg.msg_type === 'video') {
    const cap = msg.content?.trim();
    return cap?.length ? `Видео: ${cap}` : 'Видео';
  }
  if (msg.msg_type === 'voice') return 'Голосовое сообщение';
  if (msg.msg_type === 'video_note') return 'Видеосообщение';
  if (msg.msg_type === 'file') return msg.media?.[0]?.file_name?.trim() || 'Файл';
  return 'Сообщение';
}
