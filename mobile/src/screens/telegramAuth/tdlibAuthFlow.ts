import { tdlibClient, type TdlibUpdate } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';

export type AuthorizationStateType = string | undefined;

export function readAuthorizationStateType(auth: unknown): AuthorizationStateType {
  return (auth as { '@type'?: string } | null)?.['@type'];
}

/**
 * Ждём смену authorization state после auth-запроса (push часто приходит раньше ответа send).
 */
export function waitForAuthorizationTransition(
  options: {
    acceptStates: Set<string>;
    rejectStates?: Set<string>;
    timeoutMs: number;
    timeoutMessage: string;
    onSlow?: () => void;
    slowAfterMs?: number;
    abortSignal?: AbortSignal;
  },
  runQuery: () => Promise<unknown>,
): Promise<AuthorizationStateType> {
  const {
    acceptStates,
    rejectStates = new Set([
      'authorizationStateLoggingOut',
      'authorizationStateClosing',
      'authorizationStateClosed',
    ]),
    timeoutMs,
    timeoutMessage,
    onSlow,
    slowAfterMs = 30_000,
    abortSignal,
  } = options;

  return new Promise((resolve, reject) => {
    let settled = false;
    let abortListener: (() => void) | null = null;

    const finish = (state: AuthorizationStateType, err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      clearTimeout(slowTimer);
      if (abortListener) {
        abortSignal?.removeEventListener('abort', abortListener);
        abortListener = null;
      }
      unsub();
      if (err) {
        reject(err);
      } else {
        resolve(state);
      }
    };

    const totalTimer = setTimeout(() => {
      finish(undefined, new Error(timeoutMessage));
    }, timeoutMs);

    const slowTimer = setTimeout(() => {
      onSlow?.();
    }, slowAfterMs);

    const onUpdate = (update: TdlibUpdate) => {
      if (update['@type'] !== 'updateAuthorizationState') return;
      const authState = update.authorization_state as Record<string, unknown> | undefined;
      const stateType = authState?.['@type'] as string | undefined;
      if (!stateType) return;
      if (acceptStates.has(stateType)) {
        finish(stateType);
        return;
      }
      if (rejectStates.has(stateType)) {
        finish(
          stateType,
          new Error(`TDLib перешёл в состояние ${stateType} — сессия прервана.`),
        );
      }
    };

    const unsub = tdlibClient.subscribe(onUpdate);

    if (abortSignal) {
      if (abortSignal.aborted) {
        finish(undefined, new Error('AUTH_FLOW_ABORTED'));
        return;
      }
      abortListener = () => {
        finish(undefined, new Error('AUTH_FLOW_ABORTED'));
      };
      abortSignal.addEventListener('abort', abortListener, { once: true });
    }

    void runQuery().then(
      async (res) => {
        if (settled) return;
        try {
          throwIfTdError(res);
        } catch (e) {
          finish(undefined, e instanceof Error ? e : new Error(String(e)));
          return;
        }
        try {
          const auth = await tdlibClient.send({ '@type': 'getAuthorizationState' });
          throwIfTdError(auth);
          const stateType = readAuthorizationStateType(auth);
          if (stateType && acceptStates.has(stateType)) {
            finish(stateType);
          }
        } catch (e) {
          finish(undefined, e instanceof Error ? e : new Error(String(e)));
        }
      },
      (err: unknown) => {
        if (settled) return;
        const errCode = (err as { code?: string })?.code ?? '';
        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          errCode === 'E_TD_TIMEOUT' ||
          errMsg.includes('нет ответа за') ||
          errMsg.includes('Another authorization query')
        ) {
          onSlow?.();
          return;
        }
        finish(undefined, err instanceof Error ? err : new Error(errMsg));
      },
    );
  });
}
