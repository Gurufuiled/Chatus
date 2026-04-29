import { Platform } from 'react-native';
import Constants from 'expo-constants';

const MANIFEST_FETCH_TIMEOUT_MS = 12_000;
const SUPPORTED_SCHEMA = 1;

export type ClientUpdateAndroid = {
  minVersionCode: number;
  latestVersionCode: number;
  apkUrl: string;
  /** Совпадает с EXPO_PUBLIC_CLIENT_RELEASE_TAG во встраиваемом APK — смена только её предлагает обновление без поднятия versionCode. */
  releaseTag?: string;
};

export type ClientUpdateManifest = {
  schemaVersion: number;
  android?: ClientUpdateAndroid;
  _readme?: string;
};

export type AndroidUpdateDecision = 'none' | 'soft' | 'force';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parsePositiveInt(x: unknown): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const n = Math.trunc(x);
  if (n < 0) return null;
  return n;
}

function parseHttpsUrl(x: unknown): string | null {
  if (typeof x !== 'string' || !x.trim()) return null;
  try {
    const u = new URL(x.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return x.trim();
  } catch {
    return null;
  }
}

/** Разбор тела манифеста (после JSON.parse). Возвращает null при невалидных данных. */
export function parseClientUpdateManifest(data: unknown): ClientUpdateManifest | null {
  if (!isRecord(data)) return null;
  const schemaVersion = parsePositiveInt(data.schemaVersion);
  if (schemaVersion !== SUPPORTED_SCHEMA) return null;

  let android: ClientUpdateAndroid | undefined;
  if (data.android !== undefined) {
    if (!isRecord(data.android)) return null;
    const minVersionCode = parsePositiveInt(data.android.minVersionCode);
    const latestVersionCode = parsePositiveInt(data.android.latestVersionCode);
    const apkUrl = parseHttpsUrl(data.android.apkUrl);
    if (minVersionCode === null || latestVersionCode === null || !apkUrl) return null;
    if (minVersionCode > latestVersionCode) return null;

    let releaseTag: string | undefined;
    if (data.android.releaseTag !== undefined) {
      if (typeof data.android.releaseTag !== 'string') return null;
      const raw = data.android.releaseTag.trim();
      if (raw.length > 0) {
        releaseTag = raw.length > 128 ? raw.slice(0, 128) : raw;
      }
    }

    android = {
      minVersionCode,
      latestVersionCode,
      apkUrl,
      ...(releaseTag ? { releaseTag } : {}),
    };
  }

  return {
    schemaVersion,
    android,
    _readme: typeof data._readme === 'string' ? data._readme : undefined,
  };
}

export async function fetchClientUpdateManifest(url: string): Promise<ClientUpdateManifest | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), MANIFEST_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[clientUpdate] manifest HTTP',
          res.status,
          res.statusText,
          '—',
          url,
        );
      }
      return null;
    }
    const json: unknown = await res.json();
    const parsed = parseClientUpdateManifest(json);
    if (!parsed && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[clientUpdate] manifest JSON invalid or schema mismatch', url);
    }
    return parsed;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[clientUpdate] manifest fetch failed', url, e);
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Текущий versionCode встроенного Android-бинарника (не в Expo Go).
 * @see Constants.platform.android.versionCode
 */
export function getCurrentAndroidVersionCode(): number | null {
  if (Platform.OS !== 'android') return null;
  const fromPlatform = Constants.platform?.android?.versionCode;
  if (typeof fromPlatform === 'number' && Number.isFinite(fromPlatform)) {
    return Math.trunc(fromPlatform);
  }
  const fromConfig = Constants.expoConfig?.android;
  const vc =
    fromConfig && typeof fromConfig === 'object' && 'versionCode' in fromConfig
      ? (fromConfig as { versionCode?: unknown }).versionCode
      : undefined;
  if (typeof vc === 'number' && Number.isFinite(vc)) return Math.trunc(vc);
  return null;
}

export function evaluateAndroidUpdate(
  manifest: ClientUpdateManifest,
  currentVersionCode: number,
  embeddedReleaseTag: string
): { decision: AndroidUpdateDecision; apkUrl: string | null } {
  const a = manifest.android;
  if (!a) return { decision: 'none', apkUrl: null };

  if (currentVersionCode < a.minVersionCode) {
    return { decision: 'force', apkUrl: a.apkUrl };
  }

  /** Уже на актуальном или новее номере билда — не крутим «есть обновление» из‑за только releaseTag. */
  if (currentVersionCode >= a.latestVersionCode) {
    return { decision: 'none', apkUrl: null };
  }

  const manifestTag = a.releaseTag?.trim();
  if (manifestTag) {
    const embedded = embeddedReleaseTag.trim();
    if (embedded !== manifestTag) {
      return { decision: 'soft', apkUrl: a.apkUrl };
    }
  }

  if (currentVersionCode < a.latestVersionCode) {
    return { decision: 'soft', apkUrl: a.apkUrl };
  }
  return { decision: 'none', apkUrl: null };
}
