import { exchangeLoginusInitData, refreshAccessToken } from '@/services/authService';
import { ApiError, setAccessToken, setAuthFailureHandler } from '@/services/apiClient';
import { useAuthUiStore } from '@/stores/authUiStore';
import { activateUiPreview } from '@/dev/uiPreview';
import type { AuthResponse, AuthUser } from '@/types/auth';
import {
  clearEmbedSession,
  loadEmbedSession,
  saveEmbedSession,
} from './authSessionStorage';
import { postToLoginusParent, requestLoginusInit } from './loginusBridge';

const EXCHANGE_MAX_ATTEMPTS = 3;
const EXCHANGE_RETRY_DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableExchangeError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 408 || err.status === 429;
  }
  if (err instanceof TypeError) return true;
  return false;
}

function mapAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Сессия истекла. Обновите раздел «Чаты» в Loginus.';
    }
    if (err.status >= 500) {
      return 'Сервер временно недоступен. Попробуйте позже.';
    }
  }
  if (err instanceof TypeError) {
    return 'Нет соединения с сервером. Проверьте интернет и повторите попытку.';
  }
  return 'Не удалось войти в ChatUs. Обновите раздел «Чаты» в Loginus.';
}

function applyAuthSession(
  tokens: Pick<AuthResponse, 'access_token' | 'refresh_token' | 'expires_at'>,
  user: AuthUser,
): void {
  setAccessToken(tokens.access_token);
  const store = useAuthUiStore.getState();
  store.setAccessToken(tokens.access_token);
  store.setUser(user);
  if (tokens.refresh_token) {
    saveEmbedSession({
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      user,
    });
  }
}

export async function runEmbedAuthExchange(initData: string): Promise<void> {
  const store = useAuthUiStore.getState();
  store.setEmbedStatus('exchanging');
  store.setAuthError(null);

  let lastError: unknown;

  for (let attempt = 1; attempt <= EXCHANGE_MAX_ATTEMPTS; attempt++) {
    try {
      const session = await exchangeLoginusInitData(initData);
      applyAuthSession(session, session.user);
      store.setEmbedStatus('ready');
      postToLoginusParent({ type: 'loginus:ready' });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < EXCHANGE_MAX_ATTEMPTS && isRetryableExchangeError(err)) {
        await delay(EXCHANGE_RETRY_DELAY_MS * attempt);
        continue;
      }
      break;
    }
  }

  const message = mapAuthError(lastError);
  store.setEmbedStatus('error');
  store.setAuthError(message);
  postToLoginusParent({ type: 'loginus:error', message });
  throw lastError;
}

export async function tryRestoreStoredSession(): Promise<boolean> {
  const stored = loadEmbedSession();
  if (!stored?.refresh_token) return false;

  const store = useAuthUiStore.getState();
  store.setEmbedStatus('exchanging');
  store.setAuthError(null);

  try {
    const tokens = await refreshAccessToken(stored.refresh_token);
    applyAuthSession(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? stored.refresh_token,
        expires_at: tokens.expires_at,
      },
      stored.user,
    );
    store.setEmbedStatus('ready');
    postToLoginusParent({ type: 'loginus:ready' });
    return true;
  } catch {
    clearEmbedSession();
    setAccessToken(null);
    store.setAccessToken(null);
    store.setUser(null);
    return false;
  }
}

export async function bootEmbedAuth(): Promise<void> {
  const store = useAuthUiStore.getState();
  if (store.embedStatus === 'ready') return;

  const restored = await tryRestoreStoredSession();
  if (restored) return;

  store.setEmbedStatus('waiting_init');
  requestLoginusInit();
}

export function handleAuthFailure(): void {
  const store = useAuthUiStore.getState();
  if (store.embedStatus !== 'ready') return;

  clearEmbedSession();
  setAccessToken(null);
  store.setAccessToken(null);
  store.setUser(null);
  store.setAuthError(null);
  store.setEmbedStatus('waiting_init');
  requestLoginusInit();
}

setAuthFailureHandler(handleAuthFailure);

export function activateDevAuthBypass(): void {
  if (import.meta.env.VITE_DEV_UI_PREVIEW === 'true') {
    activateUiPreview();
    return;
  }

  const token = import.meta.env.VITE_DEV_ACCESS_TOKEN as string | undefined;
  if (!token?.trim()) {
    useAuthUiStore.getState().setEmbedStatus('error');
    useAuthUiStore
      .getState()
      .setAuthError('VITE_DEV_ACCESS_TOKEN is required when VITE_DEV_SKIP_EMBED_AUTH=true');
    return;
  }

  setAccessToken(token.trim());
  useAuthUiStore.getState().setAccessToken(token.trim());
  useAuthUiStore.getState().setEmbedStatus('ready');
}
