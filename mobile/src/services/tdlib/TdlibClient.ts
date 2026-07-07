import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { withTdlibRequestGate } from './tdlibRequestGate';

export type TdlibUpdate = Record<string, unknown>;

type TdUpdateListener = (update: TdlibUpdate) => void;

const NATIVE_NAME = 'Tdlib';

function getNativeModule(): {
  sendClientJson: (json: string) => Promise<string>;
  recreateClient?: () => Promise<boolean>;
  addListener?: (eventType: string) => void;
  removeListeners?: (count: number) => void;
} | null {
  const m = NativeModules[NATIVE_NAME] as
    | {
        sendClientJson: (json: string) => Promise<string>;
        recreateClient?: () => Promise<boolean>;
        addListener?: (eventType: string) => void;
        removeListeners?: (count: number) => void;
      }
    | undefined;
  return m ?? null;
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

  constructor() {
    const mod = getNativeModule();
    if (mod && typeof mod.addListener === 'function') {
      this.emitter = new NativeEventEmitter(mod as never);
      this.emitter.addListener('td_json_update', (payload: { json?: string }) => {
        if (payload?.json) this.enqueue(payload.json);
      });
    }
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
    const mod = getNativeModule();
    if (!mod?.recreateClient) return false;
    await mod.recreateClient();
    return true;
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
