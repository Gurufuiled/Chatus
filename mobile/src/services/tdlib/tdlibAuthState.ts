import type { TelegramAuthStatus } from '../../stores/telegramAccountStore';
import {
  applyTdlibParameters,
  scheduleBackgroundTdlibRecovery,
} from './tdlibBootstrap';
import { throwIfTdError } from './tdlibErrors';
import { readAuthorizationStateType } from '../../screens/telegramAuth/tdlibAuthFlow';
import { tdlibClient } from './TdlibClient';
import { mapTdlibAuthStateToStore } from './tdlibAuthStateMapping';

export { mapTdlibAuthStateToStore, isTerminalTdlibAuthState } from './tdlibAuthStateMapping';

const AUTH_RECOVERY_POLL_MS = 200;
const AUTH_RECOVERY_TIMEOUT_MS = 6_000;
const AUTH_RECOVERY_LOGIN_GRACE_MS = 1_500;
const OPERATIONAL_RETRY_MS = 400;

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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const me = (await tdlibClient.send({ '@type': 'getMe' })) as Record<string, unknown>;
      throwIfTdError(me);
      if (me['@type'] === 'user') return true;
    } catch {
      /* TDLib may be busy opening a chat */
    }
    if (attempt < 1) {
      await delay(OPERATIONAL_RETRY_MS);
    }
  }
  return false;
}

async function waitForTdlibAuthRecovery(): Promise<{ ready: boolean; state: string | null }> {
  const deadline = Date.now() + AUTH_RECOVERY_TIMEOUT_MS;
  let lastState: string | null = null;
  let loginGateSeenAt: number | null = null;
  while (Date.now() < deadline) {
    const state = await readTdlibAuthorizationStateType();
    lastState = state;
    if (state === 'authorizationStateReady') {
      return { ready: true, state };
    }
    if (state === 'authorizationStateWaitPassword') {
      return { ready: false, state };
    }
    if (isExplicitReauthState(state)) {
      if (loginGateSeenAt == null) loginGateSeenAt = Date.now();
      // After logout / real reauth, surface WaitPhone quickly — do not spin 15s.
      if (Date.now() - loginGateSeenAt >= AUTH_RECOVERY_LOGIN_GRACE_MS) {
        return { ready: false, state };
      }
    } else {
      loginGateSeenAt = null;
    }
    await delay(AUTH_RECOVERY_POLL_MS);
  }
  return { ready: false, state: lastState };
}

/**
 * Read live TDLib auth and map to store status (does not mutate store).
 * When UI already shows a session (`ready` / persisted user id), do not flip to
 * waiting_* on a single transient probe — recover first.
 */
export async function probeTdlibAuthStatus(
  current: TelegramAuthStatus,
): Promise<{ status: TelegramAuthStatus; state: string | null }> {
  await applyTdlibParameters();
  let state = await readTdlibAuthorizationStateType();

  const protectReadySession = current === 'ready' || current === 'error';

  if (isExplicitReauthState(state) && protectReadySession) {
    // Transient Closed→recreate can briefly surface WaitPhoneNumber before DB loads.
    const waited = await waitForTdlibAuthRecovery();
    if (waited.ready || (await isTdlibSessionOperational())) {
      return { status: 'ready', state: 'authorizationStateReady' };
    }
    state = waited.state ?? (await readTdlibAuthorizationStateType());
    if (state === 'authorizationStateReady') {
      return { status: 'ready', state };
    }
    if (isExplicitReauthState(state)) {
      // Keep UI/session sticky — never flip Ready → waiting_phone from a probe glitch.
      scheduleBackgroundTdlibRecovery();
      return { status: 'ready', state: 'authorizationStateReady' };
    }
  }

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
      scheduleBackgroundTdlibRecovery();
      // Sticky Ready: do not surface waiting_phone while a local session exists.
      return { status: 'ready', state };
    }
    if (await isTdlibSessionOperational()) {
      return { status: 'ready', state: 'authorizationStateReady' };
    }
    scheduleBackgroundTdlibRecovery();
    return { status: 'ready', state };
  }

  // Cold start / idle: still report Ready if TDLib DB restored the session.
  if (
    (current === 'idle' || current === 'waiting_parameters') &&
    state === 'authorizationStateReady'
  ) {
    return { status: 'ready', state };
  }

  if (
    (current === 'idle' || current === 'waiting_parameters') &&
    (isTransientClose || state === 'authorizationStateWaitTdlibParameters')
  ) {
    const recovered = await waitForTdlibAuthRecovery();
    if (recovered.ready) {
      return { status: 'ready', state: recovered.state };
    }
    if (await isTdlibSessionOperational()) {
      return { status: 'ready', state: 'authorizationStateReady' };
    }
  }

  const mapped = mapTdlibAuthStateToStore(state ?? undefined, current);
  if (current === 'ready' && mapped !== 'ready') {
    scheduleBackgroundTdlibRecovery();
    return { status: 'ready', state };
  }

  return { status: mapped, state };
}
