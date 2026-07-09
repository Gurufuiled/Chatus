import type { TelegramAuthStatus } from '../../stores/telegramAccountStore';
import { applyTdlibParameters, scheduleBackgroundTdlibRecovery } from './tdlibBootstrap';
import { throwIfTdError } from './tdlibErrors';
import { readAuthorizationStateType } from '../../screens/telegramAuth/tdlibAuthFlow';
import { tdlibClient } from './TdlibClient';
import { mapTdlibAuthStateToStore } from './tdlibAuthStateMapping';

export { mapTdlibAuthStateToStore, isTerminalTdlibAuthState } from './tdlibAuthStateMapping';

const AUTH_RECOVERY_POLL_MS = 200;
const AUTH_RECOVERY_TIMEOUT_MS = 15_000;
const OPERATIONAL_RETRY_MS = 2000;

const EXPLICIT_REAUTH_STATES = new Set([
  'authorizationStateWaitPhoneNumber',
  'authorizationStateWaitEmailAddress',
  'authorizationStateWaitRegistration',
  'authorizationStateWaitCode',
  'authorizationStateWaitEmailCode',
  'authorizationStateWaitOtherDeviceConfirmation',
  'authorizationStateWaitPassword',
]);

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isExplicitReauthState(state: string | null | undefined): boolean {
  return state != null && EXPLICIT_REAUTH_STATES.has(state);
}

async function readTdlibAuthorizationStateType(): Promise<string | null> {
  const auth = await tdlibClient.send({ '@type': 'getAuthorizationState' });
  throwIfTdError(auth);
  return readAuthorizationStateType(auth) ?? null;
}

async function isTdlibSessionOperational(): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const me = (await tdlibClient.send({ '@type': 'getMe' })) as Record<string, unknown>;
      throwIfTdError(me);
      if (me['@type'] === 'user') return true;
    } catch {
      /* TDLib may be busy opening a chat */
    }
    if (attempt < 3) {
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
    if (isExplicitReauthState(state)) {
      return { ready: false, state };
    }
    await delay(AUTH_RECOVERY_POLL_MS);
  }
  return { ready: false, state: lastState };
}

/** Read live TDLib auth and map to store status (does not mutate store). */
export async function probeTdlibAuthStatus(
  current: TelegramAuthStatus,
): Promise<{ status: TelegramAuthStatus; state: string | null }> {
  await applyTdlibParameters();
  let state = await readTdlibAuthorizationStateType();

  if (isExplicitReauthState(state)) {
    return {
      status: mapTdlibAuthStateToStore(state ?? undefined, current),
      state,
    };
  }

  if (current === 'error') {
    if (state === 'authorizationStateReady' || (await isTdlibSessionOperational())) {
      return { status: 'ready', state: state ?? 'authorizationStateReady' };
    }
    scheduleBackgroundTdlibRecovery();
    return { status: 'error', state };
  }

  const isTransientClose =
    state === 'authorizationStateClosing' ||
    state === 'authorizationStateClosed' ||
    state === 'authorizationStateLoggingOut';

  if (current === 'ready' && (isTransientClose || state === 'authorizationStateWaitTdlibParameters')) {
    const recovered = await waitForTdlibAuthRecovery();
    if (recovered.ready) {
      return { status: 'ready', state: recovered.state };
    }
    state = recovered.state;
    if (isExplicitReauthState(state)) {
      return {
        status: mapTdlibAuthStateToStore(state, current),
        state,
      };
    }
    if (await isTdlibSessionOperational()) {
      return { status: 'ready', state: 'authorizationStateReady' };
    }
    scheduleBackgroundTdlibRecovery();
    return { status: 'ready', state };
  }

  const mapped = mapTdlibAuthStateToStore(state ?? undefined, current);
  if (current === 'ready' && mapped !== 'ready') {
    scheduleBackgroundTdlibRecovery();
    return { status: 'ready', state };
  }

  return { status: mapped, state };
}
