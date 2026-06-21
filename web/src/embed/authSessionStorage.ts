import type { AuthUser } from '@/types/auth';

const STORAGE_KEY = 'chatus_embed_session';

export interface StoredEmbedSession {
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
}

export function loadEmbedSession(): StoredEmbedSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEmbedSession;
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

export function saveEmbedSession(session: StoredEmbedSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage may be unavailable in some embed contexts
  }
}

export function clearEmbedSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function updateStoredTokens(accessTokenExpiresAt: number, refreshToken: string): void {
  const stored = loadEmbedSession();
  if (!stored) return;
  saveEmbedSession({
    ...stored,
    refresh_token: refreshToken,
    expires_at: accessTokenExpiresAt,
  });
}
