import type { AuthUser } from '@/types/auth';

export const CHATUS_WEB_SESSION_KEY = 'chatus_web_session';

const isStandalonePwa = import.meta.env.VITE_APP_MODE === 'standalone';

export interface StoredWebSession {
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
  /** Set after OAuth callback so the app can boot without an extra refresh round-trip. */
  access_token?: string;
}

function readRaw(key: 'local' | 'session'): string | null {
  try {
    const storage = key === 'local' ? localStorage : sessionStorage;
    return storage.getItem(CHATUS_WEB_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeRaw(storage: Storage, session: StoredWebSession): void {
  storage.setItem(CHATUS_WEB_SESSION_KEY, JSON.stringify(session));
}

function removeRaw(storage: Storage): void {
  storage.removeItem(CHATUS_WEB_SESSION_KEY);
}

function parseStored(raw: string | null): StoredWebSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredWebSession;
    if (
      typeof parsed.refresh_token !== 'string' ||
      !parsed.refresh_token.trim() ||
      typeof parsed.expires_at !== 'number' ||
      !parsed.user?.id
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Standalone PWA uses localStorage so sessions survive app restarts; embed keeps sessionStorage. */
function primaryStorage(): Storage | null {
  try {
    return isStandalonePwa ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

export function loadWebSession(): StoredWebSession | null {
  const primary = primaryStorage();
  if (primary) {
    const fromPrimary = parseStored(primary.getItem(CHATUS_WEB_SESSION_KEY));
    if (fromPrimary) return fromPrimary;
  }

  // Migrate legacy sessionStorage entries into localStorage for standalone PWAs.
  if (isStandalonePwa) {
    const legacy = parseStored(readRaw('session'));
    if (legacy) {
      try {
        localStorage.setItem(CHATUS_WEB_SESSION_KEY, JSON.stringify(legacy));
        sessionStorage.removeItem(CHATUS_WEB_SESSION_KEY);
      } catch {
        // still return legacy session for this boot
      }
      return legacy;
    }
  }

  return null;
}

export function saveWebSession(session: StoredWebSession): void {
  const primary = primaryStorage();
  if (!primary) return;
  try {
    writeRaw(primary, session);
    // Drop stale copy from the other storage bucket.
    if (isStandalonePwa) {
      try {
        sessionStorage.removeItem(CHATUS_WEB_SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  } catch {
    // storage may be unavailable in private mode
  }
}

export function clearWebSession(): void {
  try {
    removeRaw(localStorage);
  } catch {
    /* ignore */
  }
  try {
    removeRaw(sessionStorage);
  } catch {
    /* ignore */
  }
}

export function updateWebStoredTokens(
  accessTokenExpiresAt: number,
  refreshToken: string,
  accessToken?: string,
): void {
  const stored = loadWebSession();
  if (!stored) return;
  saveWebSession({
    ...stored,
    refresh_token: refreshToken,
    expires_at: accessTokenExpiresAt,
    ...(accessToken ? { access_token: accessToken } : {}),
  });
}
