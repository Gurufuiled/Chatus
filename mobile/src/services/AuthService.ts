/**
 * AuthService - API client for auth endpoints and session persistence in SQLite.
 * Exchanges OAuth code with backend, saves session via AuthSessionDao,
 * provides restore/refresh/logout.
 */

import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';
import { initDatabase } from './DatabaseService';
import { AuthSessionDao } from '../db/dao/AuthSessionDao';
import { SyncQueueDao } from '../db/dao/SyncQueueDao';
import { UserDao } from '../db/dao/UserDao';
import type { UserRow } from '../db/types';

const ID_TOKEN_KEY = 'loginus_id_token';

/** User shape from backend API (snake_case). */
export interface ApiUser {
  id: string;
  loginus_id: string | null;
  username: string | null;
  handle: string | null;
  display_name: string | null;
  last_name?: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio?: string | null;
  birthday?: number | null;
  is_online: boolean;
  last_seen: number | null;
  created_at: number;
  updated_at: number;
}

export interface AuthSession {
  user: ApiUser;
  accessToken: string;
}

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 min

export function apiUserToUserRow(u: ApiUser): UserRow {
  return {
    id: u.id,
    username: u.username ?? '',
    handle: u.handle ?? null,
    display_name: u.display_name,
    last_name: u.last_name ?? null,
    bio: u.bio ?? null,
    birthday: u.birthday ?? null,
    avatar_url: u.avatar_url,
    avatar_local_path: null,
    phone: u.phone,
    is_online: u.is_online ? 1 : 0,
    last_seen: u.last_seen,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

function userRowToApiUser(r: UserRow): ApiUser {
  return {
    id: r.id,
    loginus_id: null,
    username: r.username,
    handle: r.handle ?? null,
    display_name: r.display_name,
    last_name: r.last_name ?? null,
    avatar_url: r.avatar_url,
    phone: r.phone,
    bio: r.bio ?? null,
    birthday: r.birthday ?? null,
    is_online: r.is_online !== 0,
    last_seen: r.last_seen,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export class AuthService {
  private readonly authSessionDao = new AuthSessionDao();
  private readonly syncQueueDao = new SyncQueueDao();
  private readonly userDao = new UserDao();

  /** Returns { url, redirect_uri } for Loginus. redirect_uri must be HTTP(S) callback с сервера (не messenger://). */
  async getLoginUrl(): Promise<{ url: string; redirect_uri: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      console.log('[Auth] getLoginUrl: fetching', API_BASE_URL + '/auth/login-url');
      const res = await fetch(`${API_BASE_URL}/auth/login-url`, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Сервер ответил ${res.status}`);
      }
      const data = (await res.json()) as { url?: string; redirect_uri?: string };
      if (!data.url) {
        throw new Error('Пустой ответ login-url');
      }
      const redirect_uri = (data.redirect_uri ?? '').trim();
      if (!redirect_uri.startsWith('http://') && !redirect_uri.startsWith('https://')) {
        throw new Error(
          'Некорректный redirect_uri с сервера. Проверьте LOGINUS_REDIRECT_URI на VPS (должен быть http://…/api/auth/callback).',
        );
      }
      console.log('[Auth] getLoginUrl: OK', { redirect_uri });
      return { url: data.url, redirect_uri };
    } catch (e) {
      const msg =
        e instanceof Error && e.name === 'AbortError'
          ? 'Сервер не ответил за 30 с'
          : e instanceof Error
            ? e.message
            : String(e);
      throw new Error(
        `${msg}. Без API Chatus форма Loginus в приложении не откроется — проверьте ${API_BASE_URL}/auth/login-url`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Exchange OAuth code for tokens, save session, return user + tokens. */
  async loginWithCode(code: string, redirectUri: string): Promise<AuthSession> {
    console.log('[Auth] loginWithCode: exchanging', { codeLen: code?.length, redirect_uri: redirectUri });
    await initDatabase();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${API_BASE_URL}/auth/loginus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      console.error('[Auth] loginWithCode: failed', res.status, err);
      const msg = Array.isArray(err.message)
        ? err.message.join(', ')
        : err.message;
      throw new Error(msg || `Login failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_at: number;
      user: ApiUser;
      id_token?: string;
    };

    const now = Date.now();
    await this.saveUserToLocal(data.user);
    if (data.id_token) {
      try {
        await SecureStore.setItemAsync(ID_TOKEN_KEY, data.id_token);
      } catch (e) {
        console.warn('Failed to store id_token for SLO:', e);
      }
    }
    await this.authSessionDao.insert({
      user_id: data.user.id,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? null,
      expires_at: data.expires_at,
      created_at: now,
    });

    console.log('[Auth] loginWithCode: success', { userId: data.user?.id });
    return {
      user: data.user,
      accessToken: data.access_token,
    };
  }

  /** Save or update user from API response (e.g. after profile update). */
  async saveUserToLocal(user: ApiUser): Promise<void> {
    const row = apiUserToUserRow(user);
    const existing = await this.userDao.getById(user.id);
    if (existing) {
      await this.userDao.update({ ...row, id: user.id });
    } else {
      await this.userDao.insert(row);
    }
  }

  /** Refresh tokens using stored refresh_token. Updates auth_session on success. */
  async refreshToken(): Promise<string> {
    const session = await this.authSessionDao.get();
    if (!session?.refresh_token) {
      throw new Error('No refresh token');
    }

    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_at: number;
    };

    await this.authSessionDao.update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? session.refresh_token,
      expires_at: data.expires_at,
    });

    return data.access_token;
  }

  /** Clear local session and notify backend. Returns slo_url when SLO is needed. */
  async logout(): Promise<{ slo_url?: string }> {
    const session = await this.authSessionDao.get();
    const accessToken = session?.access_token;
    const userId = session?.user_id ?? null;
    const idToken = await SecureStore.getItemAsync(ID_TOKEN_KEY);

    await this.authSessionDao.clear();
    if (userId) {
      try {
        await initDatabase();
        await this.syncQueueDao.deleteForUser(userId);
      } catch (e) {
        console.warn('[Auth] Failed to clear sync queue on logout:', e);
      }
    }
    try {
      await SecureStore.deleteItemAsync(ID_TOKEN_KEY);
    } catch {
      // Ignore
    }

    if (!accessToken) {
      return {};
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(idToken ? { id_token: idToken } : {}),
      });
      if (res.ok) {
        try {
          const data = (await res.json()) as { ok?: boolean; slo_url?: string };
          return {
            slo_url:
              typeof data.slo_url === 'string' ? data.slo_url : undefined,
          };
        } catch {
          // Malformed response; still logged out locally
        }
      }
    } catch {
      // Ignore - local session already cleared
    }
    return {};
  }

  /** Restore session from DB. Refreshes if expired (within 5 min buffer). Returns null if no/invalid session. */
  async restoreSession(): Promise<AuthSession | null> {
    const session = await this.authSessionDao.get();
    if (!session?.access_token || !session.user_id) return null;

    const now = Date.now();
    const expiresAt = session.expires_at ?? 0;
    const needsRefresh = expiresAt - now < TOKEN_EXPIRY_BUFFER_MS;

    if (needsRefresh && session.refresh_token) {
      try {
        const newToken = await this.refreshToken();
        const updated = await this.authSessionDao.get();
        if (!updated?.access_token || !updated.user_id) return null;
        const user = await this.getUserFromLocal(updated.user_id);
        if (!user) return null;
        return { user, accessToken: newToken };
      } catch {
        await this.authSessionDao.clear();
        return null;
      }
    }

    if (needsRefresh && !session.refresh_token) {
      await this.authSessionDao.clear();
      return null;
    }

    const user = await this.getUserFromLocal(session.user_id);
    if (!user) return null;
    return { user, accessToken: session.access_token };
  }

  private async getUserFromLocal(userId: string): Promise<ApiUser | null> {
    const row = await this.userDao.getById(userId);
    return row ? userRowToApiUser(row) : null;
  }
}

export const authService = new AuthService();
