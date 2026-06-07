import type { TdlibUpdate } from '../../services/tdlib/TdlibClient';
import { getNestedRecord } from './tdlibMapping';

/** TDLib refreshes typing about every 5s; keep a small grace window. */
export const TELEGRAM_TYPING_TTL_MS = 6_000;

export const TELEGRAM_TYPING_SEND_INTERVAL_MS = 4_500;

export type TelegramTypingUser = {
  userId: number;
  displayName: string;
  expiresAt: number;
};

export type ParsedUserChatAction = {
  chatId: number;
  userId: number;
  actionType: string;
};

export function parseUpdateUserChatAction(update: TdlibUpdate): ParsedUserChatAction | null {
  if (update['@type'] !== 'updateUserChatAction') return null;
  const chatId = typeof update.chat_id === 'number' ? update.chat_id : null;
  const userId = typeof update.user_id === 'number' ? update.user_id : null;
  const action = getNestedRecord(update.action);
  const actionType = typeof action?.['@type'] === 'string' ? action['@type'] : null;
  if (chatId == null || userId == null || !actionType) return null;
  return { chatId, userId, actionType };
}

export function isTelegramTypingChatAction(actionType: string): boolean {
  return actionType === 'chatActionTyping';
}

export function isTelegramCancelChatAction(actionType: string): boolean {
  return actionType === 'chatActionCancel';
}

export function pruneTelegramTypingUsers(
  users: Map<number, TelegramTypingUser>,
  now = Date.now(),
): void {
  for (const [userId, entry] of users) {
    if (entry.expiresAt <= now) {
      users.delete(userId);
    }
  }
}

export function formatTelegramTypingLabel(
  users: TelegramTypingUser[],
  isGroupChat: boolean,
): string | null {
  if (users.length === 0) return null;
  if (!isGroupChat) return 'печатает';

  const names = users
    .map((user) => user.displayName.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) return 'печатает';
  if (names.length === 1) return `${names[0]} печатает`;
  if (names.length === 2) return `${names[0]} и ${names[1]} печатают`;
  return `${names[0]} и ещё ${names.length - 1} печатают`;
}

export function buildTelegramMemberCountSubtitle(
  memberCount: number | null,
  isChannel: boolean,
): string | null {
  if (memberCount == null || memberCount <= 0) return null;
  return isChannel
    ? `${memberCount.toLocaleString()} подписчиков`
    : `${memberCount.toLocaleString()} участников`;
}
