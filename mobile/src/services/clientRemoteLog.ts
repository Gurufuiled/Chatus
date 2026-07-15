/**
 * Ring-buffer of client diagnostics (esp. TDLib / Telegram) flushed to POST /client-logs.
 * Never store message bodies, phone numbers, or auth codes — only state / error strings.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiPost } from './apiClient';
import { authStore } from '../stores/authStore';
import { sanitizeClientLogText } from './clientRemoteLogSanitize';

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ClientLogLine = {
  ts: number;
  level: ClientLogLevel;
  tag: string;
  message: string;
  data?: string;
};

const MAX_BUFFER = 120;
const FLUSH_DEBOUNCE_MS = 1_800;
const MIN_FLUSH_INTERVAL_MS = 4_000;
const MAX_LINES_PER_FLUSH = 80;
const RATE_RETRY_MS = 3_500;

const buffer: ClientLogLine[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<number> | null = null;
let lastFlushMs = 0;

function platformLabel(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

function appMeta(): { appVersion?: string; build?: string; deviceModel?: string } {
  const version = Constants.expoConfig?.version ?? undefined;
  const iosBuild = Constants.expoConfig?.ios?.buildNumber;
  const androidCode = Constants.expoConfig?.android?.versionCode;
  const build =
    Platform.OS === 'ios'
      ? iosBuild != null
        ? String(iosBuild)
        : undefined
      : androidCode != null
        ? String(androidCode)
        : undefined;
  const deviceModel =
    typeof Constants.deviceName === 'string' && Constants.deviceName.trim()
      ? Constants.deviceName.trim().slice(0, 128)
      : undefined;
  return { appVersion: version, build, deviceModel };
}

export function logClientEvent(
  tag: string,
  message: string,
  options?: { level?: ClientLogLevel; data?: unknown; flushSoon?: boolean },
): void {
  const level = options?.level ?? 'info';
  let data: string | undefined;
  if (options?.data !== undefined) {
    try {
      data = sanitizeClientLogText(
        typeof options.data === 'string' ? options.data : JSON.stringify(options.data),
      ).slice(0, 4000);
    } catch {
      data = undefined;
    }
  }
  buffer.push({
    ts: Date.now(),
    level,
    tag: tag.slice(0, 64),
    message: sanitizeClientLogText(message),
    data,
  });
  while (buffer.length > MAX_BUFFER) buffer.shift();

  if (__DEV__) {
    const prefix = `[remote-log/${tag}]`;
    if (level === 'error') console.error(prefix, message, options?.data ?? '');
    else if (level === 'warn') console.warn(prefix, message, options?.data ?? '');
    else console.log(prefix, message, options?.data ?? '');
  }

  const shouldFlush =
    options?.flushSoon === true || level === 'error' || level === 'warn';
  if (shouldFlush) scheduleClientLogFlush();
}

export function logTdlibEvent(
  message: string,
  options?: { level?: ClientLogLevel; data?: unknown; flushSoon?: boolean },
): void {
  logClientEvent('tdlib', message, options);
}

export function scheduleClientLogFlush(delayMs = FLUSH_DEBOUNCE_MS): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushClientLogs().catch(() => undefined);
  }, delayMs);
}

/** Returns number of lines accepted by the server (0 if skipped / empty / offline). */
export async function flushClientLogs(options?: { force?: boolean }): Promise<number> {
  if (flushInFlight) return flushInFlight;
  if (buffer.length === 0) return 0;
  if (!authStore.getState().accessToken) return 0;

  const force = options?.force === true;
  const since = Date.now() - lastFlushMs;
  if (!force && since < MIN_FLUSH_INTERVAL_MS && lastFlushMs > 0) {
    scheduleClientLogFlush(MIN_FLUSH_INTERVAL_MS - since + 50);
    return 0;
  }

  flushInFlight = (async () => {
    const batch = buffer.splice(0, Math.min(buffer.length, MAX_LINES_PER_FLUSH));
    if (batch.length === 0) return 0;
    try {
      const meta = appMeta();
      const res = await apiPost(
        '/client-logs',
        {
          platform: platformLabel(),
          ...meta,
          lines: batch,
        },
        { timeoutMs: 12_000 },
      );
      if (!res.ok) {
        // Put lines back (best-effort) so a later flush can retry.
        buffer.unshift(...batch);
        while (buffer.length > MAX_BUFFER) buffer.pop();
        return 0;
      }
      const body = (await res.json().catch(() => null)) as
        | { accepted?: number; skipped?: boolean }
        | null;
      lastFlushMs = Date.now();
      if (body?.skipped) {
        buffer.unshift(...batch);
        while (buffer.length > MAX_BUFFER) buffer.pop();
        scheduleClientLogFlush(RATE_RETRY_MS);
        return 0;
      }
      return typeof body?.accepted === 'number' ? body.accepted : batch.length;
    } catch {
      buffer.unshift(...batch);
      while (buffer.length > MAX_BUFFER) buffer.pop();
      return 0;
    } finally {
      flushInFlight = null;
      if (buffer.length > 0) scheduleClientLogFlush(MIN_FLUSH_INTERVAL_MS);
    }
  })();

  return flushInFlight;
}

export function pendingClientLogCount(): number {
  return buffer.length;
}
