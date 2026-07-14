import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { getTelegramBuildCredentials, tdlibClient } from './TdlibClient';
import { throwIfTdError } from './tdlibErrors';
import { logTdlibEvent } from '../clientRemoteLog';

function readAuthStateType(auth: unknown): string {
  return (auth as { '@type'?: string } | null)?.['@type'] ?? '';
}

/** TDLib ждёт POSIX-путь; Expo `documentDirectory` — `file:///…`. */
function fileUriToFilesystemPath(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('file://')) {
    return trimmed.replace(/\/+$/, '');
  }
  const path = decodeURIComponent(trimmed.slice('file://'.length));
  return path.replace(/\/+$/, '') || path;
}

export async function getTdlibDirectories(): Promise<{ databaseDir: string; filesDir: string }> {
  const doc = (FileSystem.documentDirectory ?? '').trim();
  if (!doc) {
    throw new Error('documentDirectory недоступен');
  }
  const baseUri = doc.replace(/\/+$/, '');
  const basePath = fileUriToFilesystemPath(doc);
  const databaseUri = `${baseUri}/tdlib`;
  const filesUri = `${baseUri}/tdlib_files`;
  await FileSystem.makeDirectoryAsync(databaseUri, { intermediates: true }).catch(() => undefined);
  await FileSystem.makeDirectoryAsync(filesUri, { intermediates: true }).catch(() => undefined);
  const databaseDir = `${basePath}/tdlib`.replace(/\/+/g, '/');
  const filesDir = `${basePath}/tdlib_files`.replace(/\/+/g, '/');
  return { databaseDir, filesDir };
}

/**
 * После холодного старта нативный модуль создаёт новый TDLib client_id — нужен ровно один успешный
 * `setTdlibParameters` за жизнь процесса. Повторный вызов даёт «Unexpected setTdlibParameters».
 * Проверка только по `getAuthorizationState` ненадёжна до первого setTdlibParameters.
 */
let tdlibParametersAppliedThisProcess = false;
let applyInFlight: Promise<void> | null = null;
let recoveryInFlight: Promise<boolean> | null = null;
let lastRecoveryFinishedMs = 0;
let backgroundRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let lastNativeVerifyMs = 0;
const NATIVE_VERIFY_MIN_INTERVAL_MS = 12_000;
const RECOVERY_COOLDOWN_MS = 45_000;

/** Set from telegramAccountStore to avoid a circular import with bootstrap. */
let stickySessionProbe: (() => boolean) | null = null;

export function setTdlibStickySessionProbe(probe: (() => boolean) | null): void {
  stickySessionProbe = probe;
}

function hasStickyLocalTelegramSession(): boolean {
  try {
    return stickySessionProbe?.() === true;
  } catch {
    return false;
  }
}

/**
 * Только если нативный клиент TDLib реально пересоздан (новый процесс приложения).
 * Не вызывать при «выходе из Telegram» в JS: нативный `client_id` тот же — повторный
 * `setTdlibParameters` даёт Unexpected setTdlibParameters.
 */
export function resetTdlibParametersLock(): void {
  tdlibParametersAppliedThisProcess = false;
  applyInFlight = null;
}

export function isTdlibRecoveryInFlight(): boolean {
  return recoveryInFlight != null;
}

/** Cancel pending background recreate (e.g. after explicit Settings logout). */
export function cancelBackgroundTdlibRecovery(): void {
  if (backgroundRecoveryTimer) {
    clearTimeout(backgroundRecoveryTimer);
    backgroundRecoveryTimer = null;
  }
}

/**
 * Wait until native recreate finishes (or timeout). Does NOT start a new recreate.
 * Use this when sends fail with "client is being recreated".
 */
export async function waitUntilTdlibNotRecreating(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!recoveryInFlight) return true;
    await recoveryInFlight.catch(() => false);
    if (!recoveryInFlight) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return !recoveryInFlight;
}

/**
 * Recreate native TDLib client and reload the on-disk session (no SMS if DB is valid).
 * Call ONLY when authorizationStateClosed / Closing — never as a reaction to Unauthorized
 * during send (that creates a recreate↔reject loop).
 */
export async function recoverTdlibSession(): Promise<boolean> {
  if (recoveryInFlight) return recoveryInFlight;
  recoveryInFlight = (async () => {
    const sinceLast = Date.now() - lastRecoveryFinishedMs;
    if (sinceLast < RECOVERY_COOLDOWN_MS) {
      // Previous recreate already ran recently — wait briefly for Ready, do not destroy again.
      const { ready } = await waitForTdlibAuthorizationReady(8_000, {
        stickySession: hasStickyLocalTelegramSession(),
      });
      return ready || (await canCallAuthorizedApis());
    }
    // Do not clear the parameters lock before recreate — concurrent sends would hit
    // a Closed client and throw "TDLib client is closed" during the destroy window.
    let didRecreate = false;
    try {
      const recreated = await tdlibClient.recreateClient();
      didRecreate = recreated;
      if (!recreated && __DEV__) {
        console.warn('[tdlib] recreateClient not available on this platform build');
      }
    } catch (e) {
      if (__DEV__) console.warn('[tdlib] recreateClient failed', e);
      logTdlibEvent('recreateClient failed', {
        level: 'error',
        data: { error: e instanceof Error ? e.message : String(e) },
        flushSoon: true,
      });
      lastRecoveryFinishedMs = Date.now();
      return false;
    }
    try {
      // force:true clears the lock only after the new native client exists.
      await applyTdlibParameters({ force: true });
      // Short wait: sticky grace on WaitPhone is ~2.5s inside waitForTdlibAuthorizationReady.
      const { ready } = await waitForTdlibAuthorizationReady(12_000, {
        stickySession: hasStickyLocalTelegramSession(),
      });
      if (didRecreate || ready) {
        lastRecoveryFinishedMs = Date.now();
      }
      const ok = ready || (await canCallAuthorizedApis());
      logTdlibEvent(ok ? 'recoverTdlibSession ok' : 'recoverTdlibSession not ready', {
        level: ok ? 'info' : 'warn',
        data: { didRecreate, ready },
        flushSoon: !ok,
      });
      return ok;
    } catch (e) {
      logTdlibEvent('recoverTdlibSession apply/wait failed', {
        level: 'error',
        data: { error: e instanceof Error ? e.message : String(e), didRecreate },
        flushSoon: true,
      });
      if (didRecreate) {
        lastRecoveryFinishedMs = Date.now();
      }
      return false;
    }
  })().finally(() => {
    recoveryInFlight = null;
  });
  return recoveryInFlight;
}

/**
 * Debounced native client recovery — never downgrade UI to error from transient Closed.
 * Avoids hammering recreateClient while user navigates between Telegram chats.
 */
export function scheduleBackgroundTdlibRecovery(): void {
  if (recoveryInFlight) return;
  const sinceLast = Date.now() - lastRecoveryFinishedMs;
  if (sinceLast < RECOVERY_COOLDOWN_MS) return;
  if (backgroundRecoveryTimer) return;
  backgroundRecoveryTimer = setTimeout(() => {
    backgroundRecoveryTimer = null;
    void recoverTdlibSession().then((ok) => {
      if (ok && __DEV__) {
        console.log('[tdlib] background session recovery succeeded');
      }
    });
  }, 3000);
}

export function applyTdlibParameters(options?: { force?: boolean }): Promise<void> {
  if (options?.force) {
    tdlibParametersAppliedThisProcess = false;
  }
  if (tdlibParametersAppliedThisProcess && !options?.force) {
    return verifyTdlibNativeStillInitialized();
  }
  if (applyInFlight) {
    if (!options?.force) return applyInFlight;
    return applyInFlight
      .catch(() => undefined)
      .then(() => {
        tdlibParametersAppliedThisProcess = false;
        applyInFlight = doApplyTdlibParameters().finally(() => {
          applyInFlight = null;
        });
        return applyInFlight;
      });
  }
  applyInFlight = doApplyTdlibParameters().finally(() => {
    applyInFlight = null;
  });
  return applyInFlight;
}

/** Native client may have been recreated while JS still thinks parameters were applied. */
async function verifyTdlibNativeStillInitialized(): Promise<void> {
  const now = Date.now();
  if (now - lastNativeVerifyMs < NATIVE_VERIFY_MIN_INTERVAL_MS) return;
  lastNativeVerifyMs = now;
  if (recoveryInFlight) return;

  try {
    const auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<
      string,
      unknown
    >;
    throwIfTdError(auth);
    const probeType = readAuthStateType(auth);
    if (probeType === 'authorizationStateWaitTdlibParameters') {
      tdlibParametersAppliedThisProcess = false;
      await applyTdlibParameters({ force: true });
      return;
    }
    if (
      probeType === 'authorizationStateClosed' ||
      probeType === 'authorizationStateClosing'
    ) {
      tdlibParametersAppliedThisProcess = false;
      scheduleBackgroundTdlibRecovery();
    }
  } catch {
    /* native unavailable */
  }
}

function isClosedAuthState(probeType: string | null | undefined): boolean {
  return (
    probeType === 'authorizationStateClosed' ||
    probeType === 'authorizationStateClosing'
  );
}

function isTdlibClientClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /client is closed/i.test(message) ||
    /authorization is closing/i.test(message) ||
    /authorizationstateclosed/i.test(message)
  );
}

async function doApplyTdlibParameters(): Promise<void> {
  if (tdlibParametersAppliedThisProcess) {
    return;
  }
  const { apiId, apiHash } = getTelegramBuildCredentials();
  if (apiId == null || !apiHash) {
    throw new Error('Нет TELEGRAM_API_ID / TELEGRAM_API_HASH в сборке');
  }
  const authProbe = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<string, unknown>;
  throwIfTdError(authProbe);
  const probeType = readAuthStateType(authProbe);
  if (!probeType) {
    throw new Error('TDLib: пустой ответ getAuthorizationState');
  }
  if (isClosedAuthState(probeType)) {
    // Closed client cannot accept setTdlibParameters — must recreate first.
    // Do NOT await recoveryInFlight here: recoverTdlibSession itself calls apply({force})
    // and would deadlock. Callers (ensureTdlibAuthorizedForSend) recover before apply.
    tdlibParametersAppliedThisProcess = false;
    throw new Error('TDLib client is closed');
  }
  if (probeType === 'authorizationStateLoggingOut') {
    throw new Error('Telegram выходит из аккаунта');
  }
  if (probeType !== 'authorizationStateWaitTdlibParameters') {
    tdlibParametersAppliedThisProcess = true;
    return;
  }
  const { databaseDir, filesDir } = await getTdlibDirectories();

  if (__DEV__) {
    try {
      await tdlibClient.send({
        '@type': 'setLogVerbosityLevel',
        new_verbosity_level: 2,
      });
      await tdlibClient.send({
        '@type': 'setLogStream',
        log_stream: { '@type': 'logStreamDefault' },
      });
    } catch {
      /* optional */
    }
  }

  const setRes = await tdlibClient.send({
    '@type': 'setTdlibParameters',
    use_test_dc: false,
    database_directory: databaseDir,
    files_directory: filesDir,
    database_encryption_key: '',
    api_id: apiId,
    api_hash: apiHash,
    system_language_code: 'ru',
    device_model: 'Chatus',
    application_version: String(Constants.expoConfig?.version ?? '1.0.0'),
  });
  throwIfTdError(setRes);
  tdlibParametersAppliedThisProcess = true;
}

const AUTH_READY_POLL_MS = 120;
const AUTH_READY_TIMEOUT_MS = 25_000;
/** After recreate, WaitPhone can flash briefly while DB opens — only this short grace. */
const STICKY_WAIT_PHONE_GRACE_MS = 2_500;

const LOGIN_GATE_STATES = new Set([
  'authorizationStateWaitPhoneNumber',
  'authorizationStateWaitCode',
  'authorizationStateWaitPassword',
  'authorizationStateWaitRegistration',
  'authorizationStateWaitEmailAddress',
  'authorizationStateWaitEmailCode',
  'authorizationStateWaitOtherDeviceConfirmation',
]);

/**
 * После `setTdlibParameters` TDLib поднимает сессию из БД асинхронно.
 * stickySession: WaitPhone/WaitCode briefly tolerated (~2.5s) while DB loads after recreate.
 * Never poll WaitPhone for the full timeout — that blocked sends and login for 45s+.
 */
export async function waitForTdlibAuthorizationReady(
  timeoutMs = AUTH_READY_TIMEOUT_MS,
  options?: { stickySession?: boolean },
): Promise<{ ready: boolean; state: string | null }> {
  const sticky = options?.stickySession === true;
  const deadline = Date.now() + timeoutMs;
  let lastState: string | null = null;
  let appliedParameters = false;
  let loginGateSeenAt: number | null = null;
  while (Date.now() < deadline) {
    const auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<string, unknown>;
    throwIfTdError(auth);
    const t = (auth['@type'] as string) ?? null;
    lastState = t;
    if (t === 'authorizationStateReady') {
      return { ready: true, state: t };
    }
    if (t === 'authorizationStateWaitTdlibParameters') {
      loginGateSeenAt = null;
      if (!appliedParameters) {
        appliedParameters = true;
        tdlibParametersAppliedThisProcess = false;
        await applyTdlibParameters({ force: true }).catch(() => undefined);
      }
      await new Promise((r) => setTimeout(r, AUTH_READY_POLL_MS));
      continue;
    }
    if (LOGIN_GATE_STATES.has(t ?? '')) {
      if (t === 'authorizationStateWaitPassword') {
        return { ready: false, state: t };
      }
      if (sticky) {
        if (loginGateSeenAt == null) loginGateSeenAt = Date.now();
        if (Date.now() - loginGateSeenAt < STICKY_WAIT_PHONE_GRACE_MS) {
          await new Promise((r) => setTimeout(r, AUTH_READY_POLL_MS));
          continue;
        }
      }
      return { ready: false, state: t };
    }
    loginGateSeenAt = null;
    await new Promise((r) => setTimeout(r, AUTH_READY_POLL_MS));
  }
  return { ready: false, state: lastState };
}

async function readLiveAuthState(): Promise<string | null> {
  const auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<string, unknown>;
  throwIfTdError(auth);
  return readAuthStateType(auth) || null;
}

async function canCallAuthorizedApis(): Promise<boolean> {
  try {
    const me = (await tdlibClient.send({ '@type': 'getMe' })) as Record<string, unknown>;
    throwIfTdError(me);
    return me['@type'] === 'user';
  } catch {
    return false;
  }
}

/**
 * Fast gate for send/openChat. Prefer a quick Ready/getMe check — never block 45s on WaitPhone.
 */
export async function ensureTdlibAuthorizedForSend(options?: {
  allowSessionReload?: boolean;
}): Promise<void> {
  const allowSessionReload = options?.allowSessionReload !== false;
  const sticky = hasStickyLocalTelegramSession();
  await waitUntilTdlibNotRecreating(8_000);

  // Probe Closed BEFORE applyTdlibParameters — otherwise doApply throws
  // "TDLib client is closed" and never reaches recoverTdlibSession below.
  let live = await readLiveAuthState().catch((error) => {
    if (isTdlibClientClosedError(error)) return 'authorizationStateClosed';
    return null;
  });

  if (isClosedAuthState(live)) {
    if (!allowSessionReload) {
      logTdlibEvent('ensureAuthorized: Closed, reload not allowed', {
        level: 'error',
        flushSoon: true,
      });
      throw new Error('TDLib client is closed');
    }
    const recovered = await recoverTdlibSession().catch(() => false);
    if (recovered || (await canCallAuthorizedApis())) return;
    scheduleBackgroundTdlibRecovery();
    logTdlibEvent('ensureAuthorized: Closed, recovery pending', {
      level: 'warn',
      flushSoon: true,
    });
    throw new Error('Telegram переподключается. Подождите пару секунд и попробуйте снова.');
  }

  try {
    await applyTdlibParameters();
  } catch (error) {
    if (allowSessionReload && isTdlibClientClosedError(error)) {
      const recovered = await recoverTdlibSession().catch(() => false);
      if (recovered || (await canCallAuthorizedApis())) return;
      scheduleBackgroundTdlibRecovery();
      logTdlibEvent('ensureAuthorized: apply hit Closed', {
        level: 'warn',
        data: { error: error instanceof Error ? error.message : String(error) },
        flushSoon: true,
      });
      throw new Error('Telegram переподключается. Подождите пару секунд и попробуйте снова.');
    }
    throw error;
  }

  live = await readLiveAuthState().catch((error) => {
    if (isTdlibClientClosedError(error)) return 'authorizationStateClosed';
    return null;
  });
  if (live === 'authorizationStateReady' || (await canCallAuthorizedApis())) return;

  if (live === 'authorizationStateWaitPassword') {
    throw new Error('Нужен облачный пароль 2FA Telegram. Откройте Настройки → Telegram.');
  }

  if (live === 'authorizationStateLoggingOut') {
    throw new Error('Telegram выходит из аккаунта. Подождите и попробуйте снова.');
  }

  const isClosed = isClosedAuthState(live);
  const needsParams = live === 'authorizationStateWaitTdlibParameters' || live == null;

  if (needsParams || isClosed) {
    const { ready, state } = await waitForTdlibAuthorizationReady(8_000, {
      stickySession: sticky,
    });
    live = state;
    if (ready || (await canCallAuthorizedApis())) return;
  } else if (sticky && LOGIN_GATE_STATES.has(live ?? '')) {
    // Brief DB-load grace only — do not hang the send button.
    const { ready, state } = await waitForTdlibAuthorizationReady(STICKY_WAIT_PHONE_GRACE_MS + 500, {
      stickySession: true,
    });
    live = state;
    if (ready || (await canCallAuthorizedApis())) return;
  }

  if (
    allowSessionReload &&
    (isClosed || needsParams || (sticky && LOGIN_GATE_STATES.has(live ?? '')))
  ) {
    const recovered = await recoverTdlibSession().catch(() => false);
    if (recovered || (await canCallAuthorizedApis())) return;
    live = await readLiveAuthState().catch(() => live);
  }

  if (live === 'authorizationStateWaitPassword') {
    throw new Error('Нужен облачный пароль 2FA Telegram. Откройте Настройки → Telegram.');
  }

  if (sticky) {
    scheduleBackgroundTdlibRecovery();
    throw new Error('Telegram переподключается. Подождите пару секунд и попробуйте снова.');
  }

  if (
    live === 'authorizationStateWaitPhoneNumber' ||
    live === 'authorizationStateWaitCode' ||
    live === 'authorizationStateWaitRegistration'
  ) {
    throw new Error('Сессия Telegram истекла. Откройте Настройки → Telegram и войдите снова.');
  }
  throw new Error(`Сессия Telegram не готова (${live ?? 'таймаут'}). Попробуйте ещё раз.`);
}

const PHONE_LOGIN_OK_STATES = new Set([
  'authorizationStateReady',
  'authorizationStateWaitPhoneNumber',
  'authorizationStateWaitEmailAddress',
  'authorizationStateWaitRegistration',
  'authorizationStateWaitCode',
  'authorizationStateWaitEmailCode',
  'authorizationStateWaitOtherDeviceConfirmation',
  'authorizationStateWaitPassword',
]);

/**
 * After logOut the native client stays Closed until recreated + setTdlibParameters.
 * Brings TDLib to WaitPhoneNumber (or Ready/WaitCode/…) so the auth form can proceed.
 */
export async function ensureTdlibReadyForPhoneLogin(): Promise<string> {
  cancelBackgroundTdlibRecovery();
  await waitUntilTdlibNotRecreating(8_000);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let state = await readLiveAuthState().catch(() => null);
    if (state != null && PHONE_LOGIN_OK_STATES.has(state)) {
      return state;
    }

    resetTdlibParametersLock();
    try {
      await tdlibClient.recreateClient();
    } catch (e) {
      if (__DEV__) console.warn('[tdlib] recreate for phone login failed', e);
    }

    try {
      await applyTdlibParameters({ force: true });
    } catch (e) {
      if (__DEV__) console.warn('[tdlib] apply params for phone login failed', e);
      // Closed mid-apply — loop and recreate again.
      continue;
    }

    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
      state = await readLiveAuthState().catch(() => null);
      if (state != null && PHONE_LOGIN_OK_STATES.has(state)) {
        return state;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const finalState = await readLiveAuthState().catch(() => null);
  throw new Error(
    `Не удалось подготовить вход Telegram (${finalState ?? 'unknown'}). Перезапустите приложение.`,
  );
}
