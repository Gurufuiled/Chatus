import type { TelegramDialogRow } from '../../stores/telegramAccountStore';

/**
 * When `getChat` / enrichment fails for a dialog row, keep the last known
 * metadata from the store so channel badges and avatars do not disappear.
 */
export function buildChatRowLoadFailure(
  chatId: number,
  previous?: TelegramDialogRow | null,
): TelegramDialogRow {
  const idStr = String(chatId);
  const title = previous?.title?.trim() || `Чат ${chatId}`;
  return {
    id: idStr,
    chatId: idStr,
    title,
    lastMessagePreview: previous?.lastMessagePreview ?? '',
    avatarUri: previous?.avatarUri ?? null,
    lastMessageAt: previous?.lastMessageAt ?? null,
    unreadCount: typeof previous?.unreadCount === 'number' ? previous.unreadCount : 0,
    chatType: previous?.chatType,
    memberCount: previous?.memberCount,
  };
}
