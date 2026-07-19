import { refreshAccessToken, getOAuthLoginUrl, getMe, type RefreshTokenResponse } from '@/services/authService';
import { ApiError, setAccessToken, setAuthFailureHandler } from '@/services/apiClient';
import { useAuthUiStore } from '@/stores/authUiStore';
import { activateUiPreview } from '@/dev/uiPreview';
import type { AuthResponse, AuthUser } from '@/types/auth';
import {
  clearWebSession,
  loadWebSession,
  saveWebSession,
} from './webSessionStorage';

const RESTORE_REFRESH_TIMEOUT_MS = 10_000;
const ACCESS_TOKEN_SKEW_MS = 60_000;

let bootSessionGeneration = 0;
let devBypassGeneration = 0;

function nextBootGeneration(): number {
  bootSessionGeneration += 1;
  return bootSessionGeneration;
}

async function refreshWithTimeout(refreshToken: string): Promise<RefreshTokenResponse> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Refresh timed out')),
      RESTORE_REFRESH_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([refreshAccessToken(refreshToken), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function mapAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Сессия истекла. Войдите снова через Loginus.';
    }
    if (err.status >= 500) {
      return 'Сервер временно недоступен. Попробуйте позже.';
    }
  }
  if (err instanceof TypeError) {
    return 'Нет соединения с сервером. Проверьте интернет и повторите попытку.';
  }
  return 'Не удалось войти в ChatUs. Попробуйте снова.';
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
    saveWebSession({
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      user,
      access_token: tokens.access_token,
    });
  }
}

export interface BootPublicAuthOptions {
  preserveAuthError?: boolean;
}

export async function tryRestoreWebSession(): Promise<'none' | 'restored' | 'failed'> {
  const stored = loadWebSession();
  if (!stored?.refresh_token) return 'none';

  const generation = nextBootGeneration();
  const store = useAuthUiStore.getState();
  store.setEmbedStatus('exchanging');
  store.setAuthError(null);

  if (stored.access_token && stored.expires_at > Date.now() + ACCESS_TOKEN_SKEW_MS) {
    applyAuthSession(
      {
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
        expires_at: stored.expires_at,
      },
      stored.user,
    );
    store.setEmbedStatus('ready');
    return 'restored';
  }

  try {
    const tokens = await refreshWithTimeout(stored.refresh_token);
    if (generation !== bootSessionGeneration) return 'failed';

    applyAuthSession(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? stored.refresh_token,
        expires_at: tokens.expires_at,
      },
      stored.user,
    );
    store.setEmbedStatus('ready');
    return 'restored';
  } catch (err) {
    if (generation !== bootSessionGeneration) return 'failed';

    const isAuthError =
      err instanceof ApiError
        ? err.status === 401 || err.status === 403
        : err instanceof Error &&
          /401|403|invalid|expired|refresh/i.test(err.message);

    console.warn('[app] session restore failed', err);

    if (isAuthError) {
      clearWebSession();
      setAccessToken(null);
      store.setAccessToken(null);
      store.setUser(null);
    } else {
      store.setEmbedStatus('error');
      store.setAuthError(mapAuthError(err));
      return 'failed';
    }
    return 'failed';
  }
}

export async function bootPublicAuth(options?: BootPublicAuthOptions): Promise<void> {
  const store = useAuthUiStore.getState();
  if (store.embedStatus === 'ready') return;

  const result = await tryRestoreWebSession();
  if (result === 'restored') return;

  if (useAuthUiStore.getState().embedStatus === 'error') return;

  store.setEmbedStatus('needs_login');
  if (!options?.preserveAuthError) {
    store.setAuthError(null);
  }
}

export function logoutPublicAuth(): void {
  nextBootGeneration();
  clearWebSession();
  setAccessToken(null);
  const store = useAuthUiStore.getState();
  store.setAccessToken(null);
  store.setUser(null);
  store.setAuthError(null);
  store.setEmbedStatus('needs_login');
}

export async function startOAuthLogin(): Promise<void> {
  const store = useAuthUiStore.getState();
  store.setEmbedStatus('exchanging');
  store.setAuthError(null);

  try {
    const { url } = await getOAuthLoginUrl('web');
    window.location.assign(url);
  } catch (err) {
    store.setEmbedStatus('needs_login');
    store.setAuthError(mapAuthError(err));
  }
}

export function handlePublicAuthFailure(): void {
  const store = useAuthUiStore.getState();
  if (store.embedStatus !== 'ready') return;

  clearWebSession();
  setAccessToken(null);
  store.setAccessToken(null);
  store.setUser(null);
  store.setAuthError(null);
  store.setEmbedStatus('needs_login');
}

export function activateDevPublicAuthBypass(): void {
  if (import.meta.env.VITE_DEV_UI_PREVIEW === 'true') {
    activateUiPreview();
    return;
  }

  let override: string | null = null;
  try {
    override = sessionStorage.getItem('chatus_dev_access_token');
  } catch {
    // ignore
  }
  const token = (override?.trim() ||
    (import.meta.env.VITE_DEV_ACCESS_TOKEN as string | undefined))?.trim();
  if (!token) {
    useAuthUiStore.getState().setEmbedStatus('error');
    useAuthUiStore
      .getState()
      .setAuthError('VITE_DEV_ACCESS_TOKEN is required when VITE_DEV_SKIP_EMBED_AUTH=true');
    return;
  }

  setAccessToken(token);
  const store = useAuthUiStore.getState();
  store.setAccessToken(token);
  store.setAuthError(null);
  store.setEmbedStatus('exchanging');

  const generation = ++devBypassGeneration;

  void (async () => {
    try {
      const user = await getMe();
      if (generation !== devBypassGeneration) return;
      const current = useAuthUiStore.getState();
      if (current.accessToken !== token) return;
      current.setUser(user);
      current.setEmbedStatus('ready');
    } catch (err) {
      if (generation !== devBypassGeneration) return;
      const current = useAuthUiStore.getState();
      if (current.accessToken !== token) return;
      if (current.embedStatus !== 'exchanging') return;
      current.setUser(null);
      current.setEmbedStatus('error');
      current.setAuthError(mapAuthError(err));
    }
  })();
}

export function applyOAuthExchangeFromUrl(authError: string | null): void {
  if (!authError) return;
  const store = useAuthUiStore.getState();
  store.setEmbedStatus('needs_login');
  try {
    store.setAuthError(decodeURIComponent(authError));
  } catch {
    store.setAuthError(authError);
  }
}

setAuthFailureHandler(handlePublicAuthFailure);
