/**
 * Восстановление клиента TDLib после выхода из аккаунта. Чистая логика (зависимости передаются снаружи) —
 * покрыта тестами в `tdlibSessionRecovery.test.ts`.
 *
 * Проблема: после `logOut` (или когда сервер завершил сессию) TDLib проходит LoggingOut → Closing → Closed, и
 * этот клиент больше не работает — войти заново в том же клиенте нельзя. Раньше приложение это не обрабатывало:
 * экран входа показывал «Не удалось начать вход (состояние: authorizationStateLoggingOut). Закройте экран и
 * откройте снова», что не помогало. Хуже того, если серверы Telegram недоступны (блокировка провайдером), выход
 * на сервере не завершается: TDLib хранит «выход не закончен» в базе и после каждого запуска снова ждёт сервер —
 * вход невозможен вообще, даже после перезапуска приложения.
 *
 * Решение: дождаться `authorizationStateClosed`; если не дожидаемся (нет связи) — `destroy` (удалить локальные
 * данные без обращения к серверу), затем создать нового клиента и заново передать параметры.
 */

export const DEAD_AUTH_STATES: ReadonlySet<string> = new Set([
  'authorizationStateLoggingOut',
  'authorizationStateClosing',
  'authorizationStateClosed',
]);

export const AUTH_STATE_CLOSED = 'authorizationStateClosed';

export function isDeadAuthState(state: string | null | undefined): boolean {
  return state != null && DEAD_AUTH_STATES.has(state);
}

export type SessionRecoveryDeps = {
  /**
   * Текущее состояние авторизации. `null` — клиент не отвечает (закрытый клиент TDLib на запросы молчит), это
   * считается «клиент мёртв».
   */
  readState: () => Promise<string | null>;
  /** Ждёт `authorizationStateClosed` не дольше `timeoutMs`. `true` — дождались. */
  waitClosed: (timeoutMs: number) => Promise<boolean>;
  /** `destroy`: удалить локальные данные без выхода на сервере. Ответа от TDLib может не быть — это нормально. */
  destroy: () => Promise<void>;
  /** Создать нового клиента вместо закрытого. */
  restartClient: () => Promise<void>;
  /** Сбросить «параметры уже переданы» и передать их новому клиенту. */
  reinitialize: () => Promise<void>;
};

export type SessionRecoveryOptions = {
  /** Сколько ждём, что TDLib сам закончит выход, прежде чем сделать `destroy`. */
  graceMs?: number;
  /** Сколько ждём закрытия после `destroy`. */
  destroyWaitMs?: number;
  /** Считать клиента в этом состоянии, даже если `readState` ещё показывает старое (сразу после `logOut`). */
  assumeState?: string;
};

export type SessionRecoveryResult = {
  /** `none` — клиент жив, ничего не делали; `restarted` — дождались закрытия и пересоздали; `destroyed` — выход
   *  не завершался, локальные данные удалены `destroy`, клиент пересоздан. */
  action: 'none' | 'restarted' | 'destroyed';
  stateBefore: string | null;
  stateAfter: string | null;
};

export class SessionRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionRecoveryError';
  }
}

export const DEFAULT_GRACE_MS = 8000;
export const DEFAULT_DESTROY_WAIT_MS = 8000;

export async function recoverTdlibSession(
  deps: SessionRecoveryDeps,
  options: SessionRecoveryOptions = {},
): Promise<SessionRecoveryResult> {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const destroyWaitMs = options.destroyWaitMs ?? DEFAULT_DESTROY_WAIT_MS;

  const observed = await deps.readState();
  const before = options.assumeState && !isDeadAuthState(observed) ? options.assumeState : observed;

  // `null` — клиент молчит (закрыт); живое состояние — ничего не трогаем
  if (before !== null && !isDeadAuthState(before)) {
    return { action: 'none', stateBefore: before, stateAfter: before };
  }

  let action: 'restarted' | 'destroyed' = 'restarted';
  const alreadyClosed = before === null || before === AUTH_STATE_CLOSED;
  if (!alreadyClosed) {
    if (!(await deps.waitClosed(graceMs))) {
      action = 'destroyed';
      await deps.destroy().catch(() => undefined);
      if (!(await deps.waitClosed(destroyWaitMs))) {
        throw new SessionRecoveryError(
          'Telegram не завершил выход. Закройте приложение полностью (смахните из недавних) и откройте снова.',
        );
      }
    }
  }

  await deps.restartClient();
  await deps.reinitialize();
  const after = await deps.readState();
  return { action, stateBefore: before, stateAfter: after };
}
