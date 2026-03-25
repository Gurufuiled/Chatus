/**
 * API client - adds Bearer token to requests, retries on 401 after refresh.
 * Use for all authenticated API calls (chats, messages, etc.).
 * Auth endpoints (login, refresh, logout) use fetch directly in AuthService.
 * When USE_MOCKS=true, returns mock data for chats/messages/users.
 */

import { API_BASE_URL, USE_MOCKS } from '../config';
import { authStore } from '../stores/authStore';
import { authService } from './AuthService';
import { mockApiGet, mockApiPost, mockApiPatch } from './apiMocks';

const FETCH_TIMEOUT_MS = 15000;

export interface ApiFetchOptions extends RequestInit {
  /** If true, skip adding Authorization header (for public endpoints). */
  skipAuth?: boolean;
}

/**
 * Fetch with Bearer token, 15s timeout. On 401, attempts token refresh and retries once.
 * If refresh fails, clears session (logout).
 */
export async function apiFetch(
  path: string,
  init?: ApiFetchOptions
): Promise<Response> {
  const { skipAuth, ...rest } = init ?? {};
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const getHeaders = (): HeadersInit => {
    const headers = new Headers(rest.headers);
    if (!skipAuth) {
      const token = authStore.getState().accessToken;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
    return headers;
  };

  async function doFetch(): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...rest,
        headers: getHeaders(),
        signal: controller.signal,
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? `Сервер не отвечает. Проверьте, что телефон и ПК в одной сети, API: ${API_BASE_URL}`
          : err instanceof Error
            ? err.message
            : String(err);
      throw new Error(msg);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let res = await doFetch();

  if (res.status === 401 && !skipAuth) {
    try {
      await authService.refreshToken();
      await authStore.getState().restoreSession();
      return doFetch();
    } catch {
      authStore.getState().clearSession();
      try {
        await authService.logout();
      } catch {
        // Ignore - local session already cleared
      }
      return res;
    }
  }

  return res;
}

/**
 * GET request with auth. Use for authenticated endpoints.
 * When USE_MOCKS=true, returns mock data for /chats, /chats/:id/messages, /users/search.
 */
export async function apiGet(path: string, init?: ApiFetchOptions): Promise<Response> {
  if (USE_MOCKS) {
    return mockApiGet(path);
  }
  return apiFetch(path, { ...init, method: 'GET' });
}

/**
 * POST request with auth. Use for authenticated endpoints.
 * When USE_MOCKS=true, returns mock data for POST /chats.
 */
export async function apiPost(
  path: string,
  body?: unknown,
  init?: ApiFetchOptions
): Promise<Response> {
  if (USE_MOCKS) {
    return mockApiPost(path, body);
  }
  return apiFetch(path, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH request with auth. Use for updating resources.
 */
export async function apiPatch(
  path: string,
  body?: unknown,
  init?: ApiFetchOptions
): Promise<Response> {
  if (USE_MOCKS) {
    return mockApiPatch(path, body);
  }
  return apiFetch(path, {
    ...init,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export interface ApiUploadResult {
  url: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  media_kind?: string;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  thumbnail_path?: string | null;
  waveform?: number[];
}

/**
 * Upload file via multipart/form-data POST to /upload.
 * Returns { url, file_name, mime_type, file_size }.
 */
export async function apiUpload(file: {
  uri: string;
  name?: string;
  type?: string;
}): Promise<ApiUploadResult> {
  const formData = new FormData();
  // React Native FormData accepts { uri, name, type } for file uploads
  formData.append(
    'file',
    {
      uri: file.uri,
      name: file.name ?? 'voice.m4a',
      type: file.type ?? 'audio/mp4',
    } as unknown as Blob
  );

  const res = await apiFetch('/upload', {
    method: 'POST',
    headers: {},
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed: ${res.status}`);
  }

  return res.json() as Promise<ApiUploadResult>;
}
