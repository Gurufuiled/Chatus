import type { Message } from '../stores/types';

/** Newest-first ordering for inverted chat lists. */
export function compareChatMessagesNewestFirst(a: Message, b: Message): number {
  const aTs = a.created_at;
  const bTs = b.created_at;
  if (aTs !== bTs) return bTs - aTs;
  if (a.id === b.id) return 0;
  // Stable tiebreaker when timestamps collide (not strict send-order fidelity).
  return a.id < b.id ? 1 : -1;
}

export function sortChatMessagesNewestFirst(messages: Message[]): Message[] {
  return [...messages].sort(compareChatMessagesNewestFirst);
}

/** Insert without duplicates; keeps newest-first order by `created_at`. */
export function insertChatMessageNewestFirst(
  messages: Message[],
  message: Message,
): Message[] {
  if (messages.some((m) => m.id === message.id)) return messages;
  let insertAt = 0;
  for (; insertAt < messages.length; insertAt += 1) {
    if (compareChatMessagesNewestFirst(message, messages[insertAt]!) < 0) break;
  }
  const next = [...messages];
  next.splice(insertAt, 0, message);
  return next;
}
