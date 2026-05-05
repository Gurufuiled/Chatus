import type { Message } from '../../stores/types';
import { CHAT_MSG_GROUP_TIME_GAP_MS } from '../../presentation/telegramChatUi';
import type { TelegramMessageRow } from './types';

export function optimisticOutgoingMessage(
  text: string,
  tempId = -Date.now(),
  replyToMessageId?: number | null,
): TelegramMessageRow {
  return {
    id: `temp-${Math.abs(tempId)}`,
    messageId: tempId,
    kind: 'service',
    text,
    outgoing: true,
    dateMs: Date.now(),
    status: 'sending',
    replyToMessageId,
  };
}

export function getTelegramReplyPreviewText(row: TelegramMessageRow): string {
  if (row.kind === 'text') return row.text.trim() || 'Пустое сообщение';
  if (row.kind === 'image') return row.text.trim() ? `Фото: ${row.text.trim()}` : 'Фото';
  if (row.kind === 'video') return row.text.trim() ? `Видео: ${row.text.trim()}` : 'Видео';
  if (row.kind === 'voice') return 'Голосовое сообщение';
  if (row.kind === 'file') return row.fileName?.trim() || 'Файл';
  return row.text.trim() || 'Сообщение';
}

export function getTelegramReplyThumbnailUri(row: TelegramMessageRow | null | undefined): string | null {
  if (!row) return null;
  if (row.kind === 'image') return row.mediaUri?.trim() || null;
  if (row.kind === 'video') return row.thumbnailUri?.trim() || null;
  return null;
}

export function telegramRowToInputReplyMessage(row: TelegramMessageRow, chatId: number): Message {
  let media: Message['media'] | undefined;
  if (row.kind === 'image' || row.kind === 'video' || row.kind === 'file') {
    media = [
      {
        media_type: row.kind,
        remote_url: row.mediaUri ?? undefined,
        thumbnail_url: row.thumbnailUri ?? undefined,
        width: row.width,
        height: row.height,
        duration_ms: row.durationMs,
        file_name: row.fileName,
        file_size: row.fileSize,
      },
    ];
  } else if (row.kind === 'voice') {
    media = [
      {
        media_type: 'voice',
        remote_url: row.voiceUri ?? undefined,
        duration_ms: row.durationMs,
        waveform: row.waveform,
      },
    ];
  }

  return {
    id: String(row.messageId),
    chat_id: String(chatId),
    sender_id: row.outgoing ? 'telegram:self' : 'telegram:peer',
    msg_type:
      row.kind === 'image' || row.kind === 'video' || row.kind === 'file' || row.kind === 'voice'
        ? row.kind
        : 'text',
    content: row.kind === 'text' ? row.text : row.text || null,
    reply_to_id: row.replyToMessageId != null ? String(row.replyToMessageId) : null,
    is_edited: 0,
    is_deleted: 0,
    status: row.status,
    transport: 'telegram',
    server_id: null,
    created_at: row.dateMs,
    updated_at: row.dateMs,
    media,
  };
}

/**
 * Returns true when two adjacent messages belong to the same visual group chain.
 * Groups by send direction (outgoing vs incoming) — not by actual sender identity —
 * which is correct for 1-to-1 chats; group chats with multiple senders need a
 * sender-id comparison on top of this.
 */
export function isSameGroup(
  a: TelegramMessageRow | undefined,
  b: TelegramMessageRow,
): boolean {
  return (
    a != null &&
    a.outgoing === b.outgoing &&
    Math.abs(a.dateMs - b.dateMs) <= CHAT_MSG_GROUP_TIME_GAP_MS
  );
}

export function upsertMessage(
  rows: TelegramMessageRow[],
  next: TelegramMessageRow,
  oldMessageId?: number | null,
): TelegramMessageRow[] {
  const withoutSame = rows.filter(
    (item) =>
      item.id !== next.id &&
      item.messageId !== next.messageId &&
      (oldMessageId == null || item.messageId !== oldMessageId),
  );
  return [next, ...withoutSame].sort((a, b) => b.messageId - a.messageId);
}

export function applyReadOutboxStatus(
  rows: TelegramMessageRow[],
  lastReadOutboxMessageId: number,
): TelegramMessageRow[] {
  return rows.map((item) => {
    if (
      !item.outgoing ||
      item.messageId <= 0 ||
      item.messageId > lastReadOutboxMessageId ||
      item.status === 'sending' ||
      item.status === 'failed' ||
      item.status === 'read'
    ) {
      return item;
    }
    return { ...item, status: 'read' };
  });
}

export function markMessageFailed(rows: TelegramMessageRow[], messageId: number): TelegramMessageRow[] {
  return rows.map((item) => (item.messageId === messageId ? { ...item, status: 'failed' } : item));
}
