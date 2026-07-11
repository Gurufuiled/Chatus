const BLOCKED_USER_IDS_KEY = 'mobile-app.blockedUserIds';

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(BLOCKED_USER_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(BLOCKED_USER_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getBlockedUserIds(): string[] {
  return readIds();
}

export function isUserBlocked(userId: string): boolean {
  return readIds().includes(userId);
}

export function setUserBlocked(userId: string, blocked: boolean): void {
  const current = new Set(readIds());
  if (blocked) {
    current.add(userId);
  } else {
    current.delete(userId);
  }
  writeIds([...current]);
}
