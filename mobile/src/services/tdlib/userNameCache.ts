/**
 * Module-level cache: TDLib user_id → resolved display name.
 * Shared between TelegramChatScreen instances; call `clearUserNameCache()`
 * on logout / session reset to prevent stale names from a previous account
 * leaking into a new one.
 */
const cache = new Map<number, string>();

export function getCachedUserName(userId: number): string | undefined {
  return cache.get(userId);
}

export function setCachedUserName(userId: number, name: string): void {
  cache.set(userId, name);
}

export function clearUserNameCache(): void {
  cache.clear();
}
