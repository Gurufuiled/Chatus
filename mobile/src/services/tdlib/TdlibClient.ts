import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { withTdlibRequestGate } from './tdlibRequestGate';
import { logTdlibEvent } from '../clientRemoteLog';

export type TdlibUpdate = Record<string, unknown>;

type TdUpdateListener = (update: TdlibUpdate) => void;

const NATIVE_NAME = 'Tdlib';

const DANGEROUS_QUERY_TYPES = new Set(['logOut', 'close', 'destroy']);

function getNativeModule(): {
  sendClientJson: (json: string) => Promise<string>;
  recreateClient?: () => Promise<boolean>;
  getInstanceIdentity?: () => Promise<{ instanceId?: unknown; processId?: unknown }>;
  readTdlibLogTail?: (maxBytes: number) => Promise<string>;
  addListener?: (eventType: string) => void;
  removeListeners?: (count: number) => void;
} | null {
  const m = NativeModules[NATIVE_NAME] as
    | {
        sendClientJson: (json: string) => Promise<string>;
        recreateClient?: () => Promise<boolean>;
        getInstanceIdentity?: () => Promise<{ instanceId?: unknown; processId?: unknown }>;
        readTdlibLogTail?: (maxBytes: number) => Promise<string>;
        addListener?: (eventType: string) => void;
        removeListeners?: (count: number) => void;
      }
    | undefined;
  return m ?? null;
}

function stackHint(): string {
  try {
    const stack = new Error().stack ?? '';
    return stack
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.includes('TdlibClient'))
      .slice(0, 6)
      .join(' | ')
      .slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Thin client over native TDLib JSON bridge.
 * Android: {@link com.anonymous.mobile.TdlibModule} + libtdjson (see TDLIB.md).
 * iOS: same module name when Tdlib.swift is linked; until then — in-memory stub.
 *
 * Апдейты парсятся один раз и батчатся в rAF, чтобы не блокировать ввод с клавиатуры.
 */
class TdlibClientImpl {
  private emitter: NativeEventEmitter | null = null;
  private listeners = new Set<TdUpdateListener>();
  private pendingUpdates: TdlibUpdate[] = [];
  private flushScheduled = false;
  private nativeInstanceId: string | null = null;
  private appStateSubscription: { remove: () => void } | null = null;

  constructor() {
    const mod = getNativeModule();
    if (mod && typeof mod.addListener === 'function') {
      this.emitter = new NativeEventEmitter(mod as never);
      this.emitter.addListener('td_json_update', (payload: { json?: string }) => {
        if (payload?.json) this.enqueue(payload.json);
      });
      this.emitter.addListener(
        'td_json_diagnostic',
        (payload: {
          event?: unknown;
          instanceId?: unknown;
          processId?: unknown;
          data?: unknown;
        }) => {
          this.recordNativeLifecycle(payload);
        },
      );
      if (mod.getInstanceIdentity) {
        void mod
          .getInstanceIdentity()
          .then((payload) => this.recordNativeLifecycle({ ...payload, event: 'identity' }))
          .catch(() => undefined);
      }
    }
    let previousState = AppState.currentState;
    this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
      logTdlibEvent(`app lifecycle ${nextState}`, {
        level: nextState === 'background' || nextState === 'inactive' ? 'warn' : 'info',
        data: { previousState, nextState },
        flushSoon: true,
      });
      previousState = nextState;
    });
  }

  private recordNativeLifecycle(payload: {
    event?: unknown;
    instanceId?: unknown;
    processId?: unknown;
    data?: unknown;
  }): void {
    const event =
      typeof payload?.event === 'string'
        ? payload.event.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64)
        : 'unknown';
    const instanceId =
      typeof payload?.instanceId === 'string' &&
      /^[A-Fa-f0-9-]{8,64}$/.test(payload.instanceId)
        ? payload.instanceId
        : null;
    if (instanceId) this.nativeInstanceId = instanceId;
    const payloadData =
      payload.data && typeof payload.data === 'object'
        ? payload.data
        : undefined;
    logTdlibEvent(`native lifecycle ${event}`, {
      level:
        event.includes('destroy') ||
        event.includes('invalidate') ||
        event.includes('deinit') ||
        event.includes('superseded')
          ? 'warn'
          : 'info',
      data: {
        ...(instanceId ? { instanceId } : {}),
        ...(typeof payload.processId === 'number' ? { processId: payload.processId } : {}),
        ...(payloadData && !Array.isArray(payloadData) ? payloadData : {}),
      },
      flushSoon:
        event.includes('destroy') ||
        event.includes('invalidate') ||
        event.includes('deinit') ||
        event.includes('superseded') ||
        event === 'listeners_started',
    });
  }

  private enqueue(json: string) {
    let parsed: TdlibUpdate;
    try {
      parsed = JSON.parse(json) as TdlibUpdate;
    } catch {
      return;
    }
    this.pendingUpdates.push(parsed);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      const batch = this.pendingUpdates;
      this.pendingUpdates = [];
      for (const update of batch) {
        for (const listener of this.listeners) {
          try {
            listener(update);
          } catch {
            /* ignore */
          }
        }
      }
    });
  }

  subscribe(listener: TdUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async send(query: object): Promise<unknown> {
    return withTdlibRequestGate(async () => {
      const type =
        typeof (query as { '@type'?: unknown })['@type'] === 'string'
          ? String((query as { '@type': string })['@type'])
          : 'unknown';
      if (DANGEROUS_QUERY_TYPES.has(type)) {
        logTdlibEvent(`OUTBOUND ${type}`, {
          level: 'warn',
          data: { stack: stackHint() },
          flushSoon: true,
        });
      }
      const payload = JSON.stringify(query);
      const mod = getNativeModule();
      if (mod?.sendClientJson) {
        const raw = await mod.sendClientJson(payload);
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return raw;
        }
      }
      if (Platform.OS === 'ios') {
        return this.iosStub(query);
      }
      return { '@type': 'error', message: 'Tdlib native module not linked' };
    });
  }

  /** Destroy native TDLib client and create a fresh one (reload session from on-disk database). */
  async recreateClient(): Promise<boolean> {
    logTdlibEvent('OUTBOUND recreateClient', {
      level: 'warn',
      data: { stack: stackHint() },
      flushSoon: true,
    });
    logTdlibEvent('native recreate requested', {
      level: 'warn',
      data: { nativeInstanceId: this.nativeInstanceId },
      flushSoon: true,
    });
    const mod = getNativeModule();
    if (!mod?.recreateClient) return false;
    await mod.recreateClient();
    return true;
  }

  async readTdlibLogTail(maxBytes = 128 * 1024): Promise<string | null> {
    const mod = getNativeModule();
    if (!mod?.readTdlibLogTail) return null;
    return mod.readTdlibLogTail(Math.max(1, Math.min(128 * 1024, maxBytes)));
  }

  getNativeInstanceIdentity(): { nativeInstanceId: string | null } {
    return { nativeInstanceId: this.nativeInstanceId };
  }

  /** Dev fallback when iOS native is not yet compiled into the target. */
  private iosStub(query: object): unknown {
    const t = (query as { '@type'?: string })['@type'];
    if (t === 'getAuthorizationState') {
      return { '@type': 'authorizationStateWaitTdlibParameters' };
    }
    return { '@type': 'ok' };
  }
}

export const tdlibClient = new TdlibClientImpl();

export function getTelegramBuildCredentials(): { apiId: number | null; apiHash: string | null } {
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const idRaw = extra?.TELEGRAM_API_ID ?? process.env.TELEGRAM_API_ID;
  const hash = (extra?.TELEGRAM_API_HASH ?? process.env.TELEGRAM_API_HASH)?.trim() || null;
  const apiId = idRaw != null && String(idRaw).trim() !== '' ? Number.parseInt(String(idRaw), 10) : NaN;
  return {
    apiId: Number.isFinite(apiId) ? apiId : null,
    apiHash: hash,
  };
}
