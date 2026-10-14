import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

export type TdlibUpdate = Record<string, unknown>;

type TdUpdateListener = (update: TdlibUpdate) => void;

const NATIVE_NAME = 'Tdlib';

type NativeTdlibModule = {
  sendClientJson: (json: string) => Promise<string>;
  /** Создаёт нового клиента TDLib вместо закрытого. Есть не во всех сборках — см. `restartClient`. */
  restartClient?: () => Promise<number>;
  addListener?: (eventType: string) => void;
  removeListeners?: (count: number) => void;
};

function getNativeModule(): NativeTdlibModule | null {
  const m = NativeModules[NATIVE_NAME] as NativeTdlibModule | undefined;
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
  private authorizationState: string | null = null;

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
    if (parsed['@type'] === 'updateAuthorizationState') {
      const state = (parsed.authorization_state as { '@type'?: string } | undefined)?.['@type'];
      if (state) this.authorizationState = state;
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

  /**
   * Последнее состояние авторизации из `updateAuthorizationState` (`null` — ещё не приходило).
   * Нужно, потому что закрытый клиент TDLib на запросы не отвечает: `getAuthorizationState` повисает
   * до таймаута, и узнать про `authorizationStateClosed` можно только из апдейтов.
   */
  getLastAuthorizationState(): string | null {
    return this.authorizationState;
  }

  /**
   * Заменяет закрытого клиента TDLib новым (после выхода из аккаунта или `destroy`), без перезапуска процесса.
   * Бросает, если нативная часть такой метод не поддерживает (старая сборка).
   */
  async restartClient(): Promise<void> {
    const mod = getNativeModule();
    if (typeof mod?.restartClient !== 'function') {
      throw new Error('Эта сборка не умеет перезапускать Telegram. Закройте приложение полностью и откройте снова.');
    }
    await mod.restartClient();
    this.authorizationState = null;
  }

  subscribe(listener: TdUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async send(query: object): Promise<unknown> {
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
