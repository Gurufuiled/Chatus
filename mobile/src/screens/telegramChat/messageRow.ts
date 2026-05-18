import type { Message } from '../../stores/types';
import { CHAT_MSG_GROUP_TIME_GAP_MS } from '../../presentation/telegramChatUi';
import type { TelegramMessageRow } from './types';

export function optimisticOutgoingMessage(
  text: string,
  tempId = -Date.now(),
  replyToMessageId?: number | null,
  kind: TelegramMessageRow['kind'] = 'text',
  extras?: Partial<Pick<TelegramMessageRow, 'mediaUri' | 'voiceUri' | 'fileName' | 'fileSize'>>,
): TelegramMessageRow {
  return {
    id: `temp-${Math.abs(tempId)}`,
    messageId: tempId,
    kind,
    text,
    outgoing: true,
    dateMs: Date.now(),
    status: 'sending',
    replyToMessageId,
    ...extras,
  };
}

export function getTelegramCopyableContent(row: TelegramMessageRow): string {
  if (row.kind === 'text') return row.text.trim();
  if (row.kind === 'image' || row.kind === 'video') return row.text.trim();
  if (row.kind === 'file') return row.fileName?.trim() || row.text.trim();
  return '';
}

export function canTelegramSwipeReply(row: TelegramMessageRow): boolean {
  if (row.messageId <= 0) return false;
  return (
    row.kind === 'text' ||
    row.kind === 'voice' ||
    row.kind === 'video_note' ||
    row.kind === 'image' ||
    row.kind === 'video' ||
    row.kind === 'file'
  );
}

export function getTelegramReplyPreviewText(row: TelegramMessageRow): string {
  if (row.kind === 'text') return row.text.trim() || 'Пустое сообщение';
  if (row.kind === 'image') return row.text.trim() ? `Фото: ${row.text.trim()}` : 'Фото';
  if (row.kind === 'video') return row.text.trim() ? `Видео: ${row.text.trim()}` : 'Видео';
  if (row.kind === 'video_note') return 'Видеосообщение';
  if (row.kind === 'voice') return 'Голосовое сообщение';
  if (row.kind === 'file') return row.fileName?.trim() || 'Файл';
  return row.text.trim() || 'Сообщение';
}

export function getTelegramReplyThumbnailUri(row: TelegramMessageRow | null | undefined): string | null {
  if (!row) return null;
  if (row.kind === 'image') return row.mediaUri?.trim() || null;
  if (row.kind === 'video') return row.thumbnailUri?.trim() || null;
  if (row.kind === 'video_note')
    return row.thumbnailUri?.trim() || row.mediaUri?.trim() || null;
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
  } else if (row.kind === 'video_note') {
    media = [
      {
        media_type: 'video_note',
        remote_url: row.mediaUri ?? undefined,
        thumbnail_url: row.thumbnailUri ?? undefined,
        width: row.width,
        height: row.height,
        duration_ms: row.durationMs,
        is_round: true,
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
      row.kind === 'image' ||
      row.kind === 'video' ||
      row.kind === 'file' ||
      row.kind === 'voice' ||
      row.kind === 'video_note'
        ? row.kind
        : 'text',
    content: row.kind === 'text' ? row.text : row.text || null,
    reply_to_id: row.replyToMessageId != null ? String(row.replyToMessageId) : null,
    is_edited: 0,
    is_deleted: 0,
    status: row.status,
    transport: 'websocket',
    server_id: null,
    created_at: row.dateMs,
    updated_at: row.dateMs,
    media,
  };
}

/**
 * Same-time bubble chaining as {@link isSameGroup}; when `splitIncomingBySender` is true,
 * incoming rows only chain if TDLib `senderUserId` matches (group chats with multiple people).
 */
export function isSameTelegramChain(
  olderAdjacent: TelegramMessageRow | undefined,
  newerMsg: TelegramMessageRow,
  splitIncomingBySender: boolean,
): boolean {
  if (olderAdjacent == null) return false;
  if (olderAdjacent.outgoing !== newerMsg.outgoing) return false;
  if (Math.abs(olderAdjacent.dateMs - newerMsg.dateMs) > CHAT_MSG_GROUP_TIME_GAP_MS) return false;
  if (splitIncomingBySender && !newerMsg.outgoing) {
    const a = olderAdjacent.senderUserId ?? -1;
    const b = newerMsg.senderUserId ?? -1;
    return a === b;
  }
  return true;
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
