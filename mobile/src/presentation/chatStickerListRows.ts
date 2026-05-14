import type { Message } from '../stores/types';
import { CHAT_MSG_GROUP_TIME_GAP_MS } from './telegramChatUi';
import { isChatusStickerMessage } from '../stickers/chatusStickerCatalog';

export type ChatListStickerGroupRow = {
  kind: 'sticker_group';
  /** От нового к старому (совпадает с порядком в `messages`). */
  messages: Message[];
};

export type ChatListRow = Message | ChatListStickerGroupRow;

function isPureStickerMessage(m: Message): boolean {
  return m.msg_type === 'text' && m.is_deleted !== 1 && isChatusStickerMessage(m.content);
}

function canChainStickerPair(older: Message, newer: Message): boolean {
  if (!isPureStickerMessage(older) || !isPureStickerMessage(newer)) return false;
  if (older.sender_id !== newer.sender_id) return false;
  if (Math.abs(older.created_at - newer.created_at) > CHAT_MSG_GROUP_TIME_GAP_MS) return false;
  if ((older.reply_to_id ?? null) !== (newer.reply_to_id ?? null)) return false;
  if (older.forwarded_from_message_id || newer.forwarded_from_message_id) return false;
  return true;
}

/**
 * Схлопывает подряд идущие (в порядке newest-first) чистые стикеры одного автора в один ряд.
 * Индексы в `messages`: 0 — самое новое сообщение.
 */
export function buildStickerGroupedChatRows(
  messages: Message[],
  currentUserId: string | null,
): ChatListRow[] {
  const out: ChatListRow[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (!isPureStickerMessage(m)) {
      out.push(m);
      i += 1;
      continue;
    }
    const run: Message[] = [m];
    let j = i + 1;
    while (j < messages.length) {
      const older = messages[j];
      const newer = messages[j - 1];
      if (!canChainStickerPair(older, newer)) break;
      run.push(older);
      j += 1;
    }
    if (run.length >= 2) {
      out.push({ kind: 'sticker_group', messages: run });
      i = j;
    } else {
      out.push(m);
      i += 1;
    }
  }
  return out;
}

/** Индекс строки в `buildStickerGroupedChatRows` для любого `messageId` из исходного списка. */
export function getChatListRowIndexForMessageId(
  messages: Message[],
  currentUserId: string | null,
  messageId: string,
): number {
  const rows = buildStickerGroupedChatRows(messages, currentUserId);
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if ('kind' in row && row.kind === 'sticker_group') {
      if (row.messages.some((x) => x.id === messageId)) return r;
    } else if (row.id === messageId) {
      return r;
    }
  }
  return -1;
}
