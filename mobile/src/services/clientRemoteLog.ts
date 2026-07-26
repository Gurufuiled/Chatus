/**
 * Small buffered diagnostic transport. It is deliberately limited to technical
 * TDLib state/error metadata: no message bodies, phone numbers or auth codes.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiPost } from './apiClient';
import { authStore } from '../stores/authStore';
import { sanitizeClientLogText } from './clientRemoteLogSanitize';

type ClientLogLevel = 'info' | 'warn' | 'error';

type ClientLogLine = {
  ts: number;
  level: ClientLogLevel;
  tag: 'tdlib';
  message: string;
  data?: string;
};

const MAX_BUFFER = 80;
const MAX_LINES_PER_FLUSH = 40;
const FLUSH_DELAY_MS = 800;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;
const buffer: ClientLogLine[] = [];

function platform(): 'android' | 'ios' | 'unknown' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'unknown';
}

export function logTdlibEvent(
  message: string,
  options?: { level?: ClientLogLevel; data?: unknown; flushSoon?: boolean },
): void {
  let data: string | undefined;
  if (options?.data !== undefined) {
    try {
      data = sanitizeClientLogText(JSON.stringify(options.data)).slice(0, 2000);
    } catch {
      data = undefined;
    }
  }
  buffer.push({
    ts: Date.now(),
    level: options?.level ?? 'info',
    tag: 'tdlib',
    message: sanitizeClientLogText(message).slice(0, 400),
    data,
  });
  while (buffer.length > MAX_BUFFER) buffer.shift();
  if (options?.flushSoon || options?.level === 'warn' || options?.level === 'error') {
    scheduleFlush();
  }
}

export function scheduleTdlibLogFlush(): void {
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush().catch(() => undefined);
  }, FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  if (flushInFlight || buffer.length === 0 || !authStore.getState().accessToken) return;
  const batch = buffer.splice(0, MAX_LINES_PER_FLUSH);
  flushInFlight = (async () => {
    try {
      const response = await apiPost('/client-logs', {
        platform: platform(),
        appVersion: Constants.expoConfig?.version,
        lines: batch,
      }, { timeoutMs: 12_000 });
      if (!response.ok) buffer.unshift(...batch);
    } catch {
      buffer.unshift(...batch);
    } finally {
      while (buffer.length > MAX_BUFFER) buffer.pop();
      flushInFlight = null;
      if (buffer.length > 0) scheduleFlush();
    }
  })();
  await flushInFlight;
}
