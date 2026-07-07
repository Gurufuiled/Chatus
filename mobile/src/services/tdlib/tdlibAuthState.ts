import type { TelegramAuthStatus } from '../../stores/telegramAccountStore';
import { applyTdlibParameters, recoverTdlibSession } from './tdlibBootstrap';
import { throwIfTdError } from './tdlibErrors';
import { readAuthorizationStateType } from '../../screens/telegramAuth/tdlibAuthFlow';
import { tdlibClient } from './TdlibClient';

const TERMINAL_AUTH_STATES = new Set([
  'authorizationStateLoggingOut',
  'authorizationStateClosed',
]);

const AUTH_RECOVERY_POLL_MS = 200;
const AUTH_RECOVERY_TIMEOUT_MS = 12_000;
const OPERATIONAL_RETRY_MS = 1800;

/**
 * Map TDLib authorization state to store status.
 * Unknown / transient states keep the current store status instead of forcing error.
 */
export function mapTdlibAuthStateToStore(
  authType: string | undefined,
  current: TelegramAuthStatus,
): TelegramAuthStatus {
  switch (authType) {
    case 'authorizationStateReady':
      return 'ready';
    case 'authorizationStateWaitPassword':
      return 'waiting_password';
    case 'authorizationStateWaitCode':
    case 'authorizationStateWaitEmailCode':
    case 'authorizationStateWaitOtherDeviceConfirmation':
      return 'waiting_code';
    case 'authorizationStateWaitPhoneNumber':
    case 'authorizationStateWaitEmailAddress':
    case 'authorizationStateWaitRegistration':
      return 'waiting_phone';
    case 'authorizationStateWaitTdlibParameters':
      return current === 'ready' ? current : 'waiting_parameters';
    case 'authorizationStateClosing':
      return current;
    case 'authorizationStateLoggingOut':
    case 'authorizationStateClosed':
      if (current === 'ready') return current;
      return 'error';
  }
  return current;
}

export function isTerminalTdlibAuthState(authType: string | undefined): boolean {
  return authType != null && TERMINAL_AUTH_STATES.has(authType);
}

async function readTdlibAuthorizationStateType(): Promise<string | null> {
  const auth = await tdlibClient.send({ '@type': 'getAuthorizationState' });
  throwIfTdError(auth);
  return readAuthorizationStateType(auth) ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Lightweight check — getMe is cheaper than getChats while TDLib is busy in an open group. */
async function isTdlibSessionOperational(): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const me = (await tdlibClient.send({ '@type': 'getMe' })) as Record<string, unknown>;
      throwIfTdError(me);
      if (me['@type'] === 'user') return true;
    } catch {
      /* TDLib may be momentarily busy */
    }
    if (attempt < 2) {
      await delay(OPERATIONAL_RETRY_MS);
    }
  }
  return false;
}

async function waitForTdlibAuthRecovery(): Promise<{ ready: boolean; state: string | null }> {
  const deadline = Date.now() + AUTH_RECOVERY_TIMEOUT_MS;
  let lastState: string | null = null;
  while (Date.now() < deadline) {
    const state = await readTdlibAuthorizationStateType();
    lastState = state;
    if (state === 'authorizationStateReady') {
      return { ready: true, state };
    }
    await delay(AUTH_RECOVERY_POLL_MS);
  }
  return { ready: false, state: lastState };
}

async function tryRecoverReadySession(current: TelegramAuthStatus): Promise<boolean> {
  if (current !== 'ready' && current !== 'error') return false;
  if (await isTdlibSessionOperational()) return true;
  return recoverTdlibSession();
}

/** Read live TDLib auth and map to store status (does not mutate store). */
export async function probeTdlibAuthStatus(
  current: TelegramAuthStatus,
): Promise<{ status: TelegramAuthStatus; state: string | null }> {
  await applyTdlibParameters();
  let state = await readTdlibAuthorizationStateType();

  if (current === 'error') {
    if (state === 'authorizationStateReady') {
      return { status: 'ready', state };
    }
    if (await tryRecoverReadySession(current)) {
      return { status: 'ready', state: 'authorizationStateReady' };
    }
  }

  const isTransientClose =
    state === 'authorizationStateClosing' ||
    state === 'authorizationStateClosed' ||
    state === 'authorizationStateLoggingOut';

  if (current === 'ready' && isTransientClose) {
    const recovered = await waitForTdlibAuthRecovery();
    if (recovered.ready) {
      return { status: 'ready', state: recovered.state };
    }
    state = recovered.state;
    if (await isTdlibSessionOperational()) {
      return { status: 'ready', state: 'authorizationStateReady' };
    }
    if (await tryRecoverReadySession('ready')) {
      return { status: 'ready', state: 'authorizationStateReady' };
    }
    return { status: 'error', state };
  }

  return {
    status: mapTdlibAuthStateToStore(state ?? undefined, current),
    state,
  };
}
