import {
  clearEmbedSession,
  loadEmbedSession,
  updateStoredTokens,
  type StoredEmbedSession,
} from '@/embed/authSessionStorage';
import {
  clearWebSession,
  loadWebSession,
  updateWebStoredTokens,
  type StoredWebSession,
} from './webSessionStorage';

const isStandalone = import.meta.env.VITE_APP_MODE === 'standalone';

export type StoredAuthSession = StoredEmbedSession | StoredWebSession;

export function loadStoredSession(): StoredAuthSession | null {
  return isStandalone ? loadWebSession() : loadEmbedSession();
}

export function clearStoredSession(): void {
  if (isStandalone) {
    clearWebSession();
  } else {
    clearEmbedSession();
  }
}

export function updateStoredSessionTokens(
  accessTokenExpiresAt: number,
  refreshToken: string,
  accessToken?: string,
): void {
  if (isStandalone) {
    updateWebStoredTokens(accessTokenExpiresAt, refreshToken, accessToken);
  } else {
    updateStoredTokens(accessTokenExpiresAt, refreshToken);
  }
}
