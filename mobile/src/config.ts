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
  | 'EXPO_PUBLIC_LOGINUS_CLIENT_ID'
  /** Plain hostname or IPv4 — physical iPhone cannot reach Mac `localhost`; set LAN IP when using http://localhost in EXPO_PUBLIC_API_URL. */
  | 'EXPO_PUBLIC_IOS_DEV_HOST'
  /** JSON манифест (например raw.githubusercontent.com/Gurufuiled/Chatus/main/config/client-update-manifest.json). Пусто — проверка отключена. */
  | 'EXPO_PUBLIC_CLIENT_UPDATE_MANIFEST_URL'
  /** `true` — не вызывать проверку обновлений даже при заданном URL. */
  | 'EXPO_PUBLIC_CLIENT_UPDATE_DISABLED'
  /** `true` — в __DEV__ тоже запрашивать манифест (по умолчанию в dev проверка пропускается). */
  | 'EXPO_PUBLIC_CLIENT_UPDATE_CHECK_IN_DEV'
  | 'EXPO_PUBLIC_CLIENT_RELEASE_TAG'
  /** Если задан — кнопка «Обновить» открывает этот URL вместо android.apkUrl из манифеста (удобно для Google Drive без коммита id в репо). */
  | 'EXPO_PUBLIC_CLIENT_UPDATE_APK_URL';

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
 * Physical iPhone: localhost/127.0.0.1 points at the phone, not your dev machine.
 * Set EXPO_PUBLIC_IOS_DEV_HOST to your Mac/PC LAN IP or hostname when testing on device.
 */
function rewriteIosPhysicalDeviceApiUrl(urlString: string): string {
  if (Platform.OS !== 'ios') return urlString;
  if (!Constants.isDevice) return urlString;

  const devHost = readExpoPublic('EXPO_PUBLIC_IOS_DEV_HOST')?.trim();
  if (!devHost) return urlString;

  try {
    const url = new URL(urlString);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return urlString;
    }
    url.hostname = devHost;
    return url.toString();
  } catch {
    return urlString;
  }
}

/**
 * Resolve API URL for Android:
 * - Реальный прод/девайс с IP/доменом: всегда как в .env (extra).
 * - Только при явном EXPO_PUBLIC_USE_EMULATOR=true: localhost/192.168.x → 10.0.2.2 для AVD.
 * Раньше localhost + (!Constants.isDevice) давал 10.0.2.2 на части телефонов при пустом process.env.
 */
function resolveApiUrl(): string {
  let resolved = envApiUrl;

  if (Platform.OS === 'android') {
    try {
      const url = new URL(envApiUrl);
      if (!forceDevice && forceEmulator) {
        if (
          url.hostname === '127.0.0.1' ||
          url.hostname === 'localhost' ||
          url.hostname.startsWith('192.168.')
        ) {
          url.hostname = '10.0.2.2';
          resolved = url.toString();
        }
      }
    } catch {
      resolved = envApiUrl;
    }
  }

  return rewriteIosPhysicalDeviceApiUrl(resolved);
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

/** URL JSON-манифеста клиентских обновлений (Android APK до Play). */
export const CLIENT_UPDATE_MANIFEST_URL = readExpoPublic('EXPO_PUBLIC_CLIENT_UPDATE_MANIFEST_URL') || '';

export const CLIENT_UPDATE_DISABLED =
  readExpoPublic('EXPO_PUBLIC_CLIENT_UPDATE_DISABLED') === 'true';

export const CLIENT_UPDATE_CHECK_IN_DEV =
  readExpoPublic('EXPO_PUBLIC_CLIENT_UPDATE_CHECK_IN_DEV') === 'true';

/**
 * Метка релиза APK, вшитая при сборке. Должна совпадать с `android.releaseTag` в client-update-manifest.json
 * (не обязана совпадать с versionCode). Смена метки в манифесте = предложение обновить без поднятия versionCode.
 */
export const CLIENT_RELEASE_TAG = (readExpoPublic('EXPO_PUBLIC_CLIENT_RELEASE_TAG') || '').trim();

/** Не пусто — переопределить ссылку на APK из манифеста (https, например прямая ссылка Google Drive). */
export const CLIENT_UPDATE_APK_URL_OVERRIDE = (
  readExpoPublic('EXPO_PUBLIC_CLIENT_UPDATE_APK_URL') || ''
).trim();

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

    const rebasedUploadsPath = (pathname: string, search: string, hash: string): string | null => {
      let p = pathname;
      // Legacy wrong prefix from some clients / proxies: `/api/uploads/...` → static is `/uploads/...`
      if (p.startsWith('/api/uploads/')) {
        p = p.replace(/^\/api(?=\/uploads\/)/, '');
      }
      if (p.startsWith('/uploads/')) {
        return `${api.origin}${p}${search}${hash}`;
      }
      return null;
    };

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const u = new URL(trimmed);
      const rebased = rebasedUploadsPath(u.pathname, u.search, u.hash);
      if (rebased) return rebased;
      return trimmed;
    }

    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/uploads/')) {
      const pathOnly = trimmed.startsWith('/api/')
        ? trimmed.replace(/^\/api(?=\/uploads\/)/, '')
        : trimmed;
      return `${api.origin}${pathOnly}`;
    }

    if (trimmed.startsWith('uploads/')) {
      return `${api.origin}/${trimmed}`;
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}
