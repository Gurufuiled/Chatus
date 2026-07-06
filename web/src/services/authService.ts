import { apiRequest } from './apiClient';
import type { AuthResponse, AuthUser } from '@/types/auth';
import type { LoginusProfilePayload } from '@/embed/embedTypes';
import { MOCK_USER, isUiPreviewMode } from '@/dev/uiPreview';

export type RefreshTokenResponse = Pick<
  AuthResponse,
  'access_token' | 'refresh_token' | 'expires_at'
>;

export async function exchangeLoginusInitData(
  initData: string,
  profile?: LoginusProfilePayload,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/loginus/exchange', {
    method: 'POST',
    body: JSON.stringify({
      init_data: initData,
      ...(profile ? { profile } : {}),
    }),
    skipAuth: true,
  });
}

export async function getOAuthLoginUrl(
  platform: 'web' = 'web',
): Promise<{ url: string; redirect_uri: string }> {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const apiBase = base?.replace(/\/$/, '') ?? '';
  const response = await fetch(`${apiBase}/api/auth/login-url?platform=${platform}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Login URL request failed (${response.status})`);
  }
  return response.json() as Promise<{ url: string; redirect_uri: string }>;
}

export async function exchangeOAuthCode(
  code: string,
  redirectUri: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/loginus', {
    method: 'POST',
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
    skipAuth: true,
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const apiBase = base?.replace(/\/$/, '') ?? '';

  const response = await fetch(`${apiBase}/api/auth/refresh`, {
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
        : `Refresh failed (${response.status})`;
    throw new Error(message);
  }

  return data as RefreshTokenResponse;
}

export async function syncLoginusProfile(
  initData: string,
  profile?: LoginusProfilePayload,
): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>('/auth/loginus/sync-profile', {
    method: 'POST',
    body: JSON.stringify({
      init_data: initData,
      ...(profile ? { profile } : {}),
    }),
  });
}

export async function getMe() {
  if (isUiPreviewMode()) return MOCK_USER;
  return apiRequest<AuthResponse['user']>('/users/me');
}
