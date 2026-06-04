/** Pure time formatting (no React Native) — safe for `tsx` unit tests. */

export function formatMessageTimeWithHour12(timestamp: number, hour12: boolean): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  });
}
