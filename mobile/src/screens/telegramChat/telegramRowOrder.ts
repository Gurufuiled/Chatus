import type { TelegramMessageRow } from './types';

/**
 * TDLib assigns negative local IDs while an outgoing message is being sent.
 * They are newer than all confirmed history rows and must stay at index 0 of
 * an inverted list until updateMessageSendSucceeded replaces them.
 */
export function compareTelegramRowsNewestFirst(
  a: TelegramMessageRow,
  b: TelegramMessageRow,
): number {
  const aPending = a.messageId <= 0;
  const bPending = b.messageId <= 0;
  if (aPending !== bPending) return aPending ? -1 : 1;
  if (aPending && bPending) return b.dateMs - a.dateMs;
  return b.messageId - a.messageId;
}
