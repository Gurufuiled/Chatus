/** Whether a message timestamp is safe for day grouping / labels. */
export function isValidChatTimestamp(timestampMs: number): boolean {
  return Number.isFinite(timestampMs) && timestampMs > 0;
}

/** Calendar day key for grouping messages (local timezone). */
export function getChatDayKey(timestampMs: number): string {
  if (!isValidChatTimestamp(timestampMs)) return '';
  const date = new Date(timestampMs);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Telegram-style day pill label, e.g. "Сегодня", "7 июня" (ru-RU). */
export function formatChatDayLabel(timestampMs: number, nowMs = Date.now()): string {
  if (!isValidChatTimestamp(timestampMs)) return '';

  const itemDayKey = getChatDayKey(timestampMs);
  const todayKey = getChatDayKey(nowMs);
  if (itemDayKey === todayKey) return 'Сегодня';

  const today = new Date(nowMs);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (itemDayKey === getChatDayKey(yesterday.getTime())) return 'Вчера';

  const date = new Date(timestampMs);
  const now = new Date(nowMs);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
