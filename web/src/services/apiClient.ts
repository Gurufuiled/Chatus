import {
  clearEmbedSession,
  loadEmbedSession,
  updateStoredTokens,
} from '@/embed/authSessionStorage';
import { useAuthUiStore } from '@/stores/authUiStore';
import type { RefreshTokenResponse } from '@/services/authService';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return base?.replace(/\/$/, '') ?? '';
}

export interface ApiRequestOptions extends RequestInit {
  skipAuth?: boolean;
  /** @internal skip refresh retry loop */
  _authRetried?: boolean;
}

async function refreshAccessTokenDirect(refreshToken: string): Promise<RefreshTokenResponse> {
  const response = await fetch(`${getApiBase()}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data as RefreshTokenResponse;
}

async function tryRefreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const stored = loadEmbedSession();
    if (!stored?.refresh_token) {
      throw new ApiError('No refresh token', 401);
    }

    const tokens = await refreshAccessTokenDirect(stored.refresh_token);
    setAccessToken(tokens.access_token);
    useAuthUiStore.getState().setAccessToken(tokens.access_token);
    if (tokens.refresh_token) {
      updateStoredTokens(tokens.expires_at, tokens.refresh_token);
    }
    return tokens.access_token;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { skipAuth = false, _authRetried = false, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (!skipAuth && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${getApiBase()}/api${path}`, {
    ...fetchOptions,
    headers,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (response.status === 401 && !skipAuth && !_authRetried) {
    try {
      await tryRefreshAccessToken();
      return apiRequest<T>(path, { ...options, _authRetried: true });
    } catch {
      clearEmbedSession();
      setAccessToken(null);
      useAuthUiStore.getState().setAccessToken(null);
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}
