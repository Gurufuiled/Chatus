/**
 * Подпись под именем в списках контактов / шапке (как в Telegram).
 */
export function formatContactPresenceSubtitle(
  isOnline: boolean,
  lastSeen?: number | null
): string {
  if (isOnline) return 'в сети';
  if (lastSeen != null && typeof lastSeen === 'number' && lastSeen > 0) {
    const diffMs = Date.now() - lastSeen;
    if (diffMs < 60_000) return 'был(а) только что';
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `был(а) ${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `был(а) ${hours} ч назад`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'был(а) вчера';
    if (days < 7) return `был(а) ${days} дн. назад`;
  }
  return 'был(а) недавно';
}
