import type { AuthUser } from '@/types/auth';

export const CHATUS_WEB_SESSION_KEY = 'chatus_web_session';

export interface StoredWebSession {
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
  /** Set after OAuth callback so the app can boot without an extra refresh round-trip. */
  access_token?: string;
}

export function loadWebSession(): StoredWebSession | null {
  try {
    const raw = sessionStorage.getItem(CHATUS_WEB_SESSION_KEY);
    if (!raw) return null;
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

export function saveWebSession(session: StoredWebSession): void {
  try {
    sessionStorage.setItem(CHATUS_WEB_SESSION_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage may be unavailable in private mode
  }
}

export function clearWebSession(): void {
  try {
    sessionStorage.removeItem(CHATUS_WEB_SESSION_KEY);
  } catch {
    // ignore
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
