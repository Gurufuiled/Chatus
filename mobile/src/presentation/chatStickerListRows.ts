import type { Message } from '../stores/types';

export type ChatListStickerGroupRow = {
  kind: 'sticker_group';
  /** От нового к старому (совпадает с порядком в `messages`). */
  messages: Message[];
};

export type ChatListRow = Message | ChatListStickerGroupRow;

/**
 * Раньше схлопывали подряд идущие чистые стикеры в один ряд — это путало с отдельными отправками.
 * Сейчас каждое сообщение остаётся отдельной строкой; группировка только если сервер/клиент
 * отправит несколько стикеров в одном composite payload.
 */
export function buildStickerGroupedChatRows(
  messages: Message[],
  _currentUserId: string | null,
): ChatListRow[] {
  return messages.map((m) => m);
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
