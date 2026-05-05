/**
 * Module-level cache: TDLib user_id → resolved display name + downloaded avatar URI.
 * Shared between TelegramChatScreen instances; call `clearUserNameCache()`
 * on logout / session reset to prevent stale names from a previous account
 * leaking into a new one.
 */
const cache = new Map<number, string>();
/** Set when loaded; value null means user has no photo. */
const avatarUriCache = new Map<number, string | null>();

export function getCachedUserName(userId: number): string | undefined {
  return cache.get(userId);
}

export function setCachedUserName(userId: number, name: string): void {
  cache.set(userId, name);
}

/** Undefined = not loaded yet; null = no avatar. */
export function getCachedUserAvatarUri(userId: number): string | null | undefined {
  if (!avatarUriCache.has(userId)) return undefined;
  return avatarUriCache.get(userId) ?? null;
}

export function setCachedUserAvatarUri(userId: number, uri: string | null): void {
  avatarUriCache.set(userId, uri);
}

export function clearUserNameCache(): void {
  cache.clear();
  avatarUriCache.clear();
}
