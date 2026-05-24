import type { Chat } from '../../stores/types';
import type { TelegramDialogRow } from '../../stores/telegramAccountStore';

export type ChatListHeaderItem = { type: 'header'; id: string; title: string };
export type ChatListChatItem = { type: 'chat'; id: string; chat: Chat };
export type ChatListContactItem = { type: 'contact'; id: string; user: import('../../services/AuthService').ApiUser };
export type ChatListChannelItem = { type: 'channel'; id: string; channel: Chat };
export type ChatListTelegramItem = { type: 'telegram'; id: string; row: TelegramDialogRow };

export type ChatListItem =
  | ChatListHeaderItem
  | ChatListChatItem
  | ChatListContactItem
  | ChatListChannelItem
  | ChatListTelegramItem;

function chatusSortTime(chat: Chat): number {
  return chat.last_message_at ?? chat.updated_at ?? 0;
}

export function mergeUnifiedChatList(
  sortedChats: Chat[],
  telegramDialogs: TelegramDialogRow[],
  telegramReady: boolean,
): ChatListItem[] {
  type Entry = { pinned: number; at: number; item: ChatListItem };
  const entries: Entry[] = sortedChats.map((chat) => ({
    pinned: chat.is_pinned === 1 ? 1 : 0,
    at: chatusSortTime(chat),
    item: { type: 'chat', id: `chatus:${chat.id}`, chat },
  }));

  if (telegramReady) {
    for (const row of telegramDialogs) {
      entries.push({
        pinned: row.isPinned ? 1 : 0,
        at: row.lastMessageAt ?? 0,
        item: { type: 'telegram', id: `telegram:${row.id}`, row },
      });
    }
  }

  entries.sort((a, b) => {
    const byPinned = b.pinned - a.pinned;
    if (byPinned !== 0) return byPinned;
    const byTime = b.at - a.at;
    if (byTime !== 0) return byTime;
    return a.item.id.localeCompare(b.item.id);
  });
  return entries.map((e) => e.item);
}
