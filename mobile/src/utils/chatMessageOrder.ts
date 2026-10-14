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

/**
 * Отправляемое сообщение (ещё не подтверждено сервером) всегда ложится в самый конец чата.
 *
 * Время у такого сообщения берётся с часов телефона, а у остальных — с сервера. Если часы телефона отстают, новое
 * сообщение получало время меньше последнего серверного и рисовалось ПОСРЕДИ переписки; после подтверждения сервер
 * присваивал настоящее время, и оно «перепрыгивало» вниз (так было у кружков и голосовых). Поэтому время
 * отправляемого сообщения не может быть меньше времени самого свежего сообщения чата.
 */
export function placeOptimisticAtEnd(existingNewestFirst: readonly Message[], message: Message): Message {
  if (message.status !== 'sending') return message;
  const newest = existingNewestFirst[0];
  if (!newest || message.created_at > newest.created_at) return message;
  const createdAt = newest.created_at + 1;
  return { ...message, created_at: createdAt, updated_at: Math.max(message.updated_at, createdAt) };
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
