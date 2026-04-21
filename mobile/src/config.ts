/**
 * App configuration - API base URL, OAuth settings.
 * Use env vars in production (e.g. EXPO_PUBLIC_API_URL).
 * Android emulator uses 10.0.2.2 to reach host's localhost.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

type PublicEnvKey =
  | 'EXPO_PUBLIC_API_URL'
  | 'EXPO_PUBLIC_USE_EMULATOR'
  | 'EXPO_PUBLIC_USE_MOCKS'
  | 'EXPO_PUBLIC_LOGINUS_CLIENT_ID';

function readExpoPublic(key: PublicEnvKey): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  const fromExtra = extra?.[key];
  if (fromExtra !== undefined && fromExtra !== '') return fromExtra;
  if (typeof process !== 'undefined') {
    const fromProcess = (process as { env?: Record<string, string> }).env?.[key];
    if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
  }
  return undefined;
}

const envApiUrl = readExpoPublic('EXPO_PUBLIC_API_URL') || 'http://localhost:4000/api';

const forceEmulator = readExpoPublic('EXPO_PUBLIC_USE_EMULATOR') === 'true';
const forceDevice = readExpoPublic('EXPO_PUBLIC_USE_EMULATOR') === 'false';

/**
 * Resolve API URL for Android:
 * - Реальный прод/девайс с IP/доменом: всегда как в .env (extra).
 * - Только при явном EXPO_PUBLIC_USE_EMULATOR=true: localhost/192.168.x → 10.0.2.2 для AVD.
 * Раньше localhost + (!Constants.isDevice) давал 10.0.2.2 на части телефонов при пустом process.env.
 */
function resolveApiUrl(): string {
  if (Platform.OS !== 'android') return envApiUrl;
  try {
    const url = new URL(envApiUrl);
    if (forceDevice) return envApiUrl;
    if (forceEmulator) {
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname.startsWith('192.168.')) {
        url.hostname = '10.0.2.2';
        return url.toString();
      }
      return envApiUrl;
    }
    return envApiUrl;
  } catch {
    return envApiUrl;
  }
}

export const API_BASE_URL = resolveApiUrl();

export const USE_MOCKS = readExpoPublic('EXPO_PUBLIC_USE_MOCKS') === 'true';

/** WebSocket URL derived from API: http://host:4000/api -> ws://host:4001 */
export function getWebSocketUrl(): string {
  try {
    const url = new URL(API_BASE_URL);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.hostname}:4001`;
  } catch {
    return 'ws://localhost:4001';
  }
}

/** WebSocket URL сигналинга WebRTC (звонки): http://host:4000/api -> ws://host:4002 */
export function getSignalingUrl(): string {
  try {
    const url = new URL(API_BASE_URL);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.hostname}:4002`;
  } catch {
    return 'ws://localhost:4002';
  }
}

export const LOGINUS_CLIENT_ID = readExpoPublic('EXPO_PUBLIC_LOGINUS_CLIENT_ID') || '';

export const OAUTH_REDIRECT_URI = 'messenger://auth/callback';

/** Схема ссылок на каналы (slug / invite). OAuth остаётся на `messenger://`. */
export const CHANNEL_LINK_SCHEME = 'chatus';

/**
 * Публичная ссылка: chatus://c/{slug}
 * Приглашение: chatus://join/{invite_token}
 */
export function buildChannelSlugDeepLink(slug: string): string {
  const s = slug.trim().toLowerCase();
  return `${CHANNEL_LINK_SCHEME}://c/${encodeURIComponent(s)}`;
}

export function buildChannelInviteDeepLink(inviteToken: string): string {
  return `${CHANNEL_LINK_SCHEME}://join/${encodeURIComponent(inviteToken.trim())}`;
}

/**
 * Avatars and static media live under `/uploads/` on the API host (see server `main.ts`).
 * Prefer resolving via {@link resolveMediaUrl} so LAN/legacy absolute URLs in DB are rebased to `API_BASE_URL`.
 */
export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  return resolveMediaUrl(avatarUrl);
}

/**
 * Turn stored media paths into the URL this build can fetch:
 * - `/uploads/…` or `uploads/…` → current API origin + path
 * - `http(s)://any-host/uploads/…` → same path/query on **current** API origin (fixes subscribers when DB has another host/port)
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const api = new URL(API_BASE_URL);

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const u = new URL(trimmed);
      if (u.pathname.startsWith('/uploads/')) {
        return `${api.origin}${u.pathname}${u.search}${u.hash}`;
      }
      return trimmed;
    }

    if (trimmed.startsWith('/uploads/')) {
      return `${api.origin}${trimmed}`;
    }

    if (trimmed.startsWith('uploads/')) {
      return `${api.origin}/${trimmed}`;
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}
