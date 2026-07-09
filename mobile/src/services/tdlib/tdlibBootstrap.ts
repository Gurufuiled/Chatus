import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { getTelegramBuildCredentials, tdlibClient } from './TdlibClient';
import { throwIfTdError } from './tdlibErrors';

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

/**
 * Только если нативный клиент TDLib реально пересоздан (новый процесс приложения).
 * Не вызывать при «выходе из Telegram» в JS: нативный `client_id` тот же — повторный
 * `setTdlibParameters` даёт Unexpected setTdlibParameters.
 */
export function resetTdlibParametersLock(): void {
  tdlibParametersAppliedThisProcess = false;
  applyInFlight = null;
}

/**
 * Recreate native TDLib client and reload the on-disk session (no SMS if DB is valid).
 * Call when authorizationStateClosed but the user should still be logged in.
 */
export async function recoverTdlibSession(): Promise<boolean> {
  if (recoveryInFlight) return recoveryInFlight;
  recoveryInFlight = (async () => {
    const sinceLast = Date.now() - lastRecoveryFinishedMs;
    if (sinceLast < RECOVERY_COOLDOWN_MS) {
      return false;
    }
    resetTdlibParametersLock();
    try {
      const recreated = await tdlibClient.recreateClient();
      if (!recreated && __DEV__) {
        console.warn('[tdlib] recreateClient not available on this platform build');
      }
    } catch (e) {
      if (__DEV__) console.warn('[tdlib] recreateClient failed', e);
      return false;
    }
    try {
      await applyTdlibParameters({ force: true });
      const { ready } = await waitForTdlibAuthorizationReady(45_000);
      if (ready) {
        lastRecoveryFinishedMs = Date.now();
      }
      return ready;
    } catch {
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
  if (tdlibParametersAppliedThisProcess && !options?.force) {
    return verifyTdlibNativeStillInitialized();
  }
  if (applyInFlight) {
    return applyInFlight;
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
      scheduleBackgroundTdlibRecovery();
    }
  } catch {
    /* native unavailable */
  }
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

/**
 * После `setTdlibParameters` TDLib поднимает сессию из БД асинхронно; сразу вызывать `getChats` часто даёт Unauthorized.
 */
export async function waitForTdlibAuthorizationReady(
  timeoutMs = AUTH_READY_TIMEOUT_MS,
): Promise<{ ready: boolean; state: string | null }> {
  const deadline = Date.now() + timeoutMs;
  let lastState: string | null = null;
  while (Date.now() < deadline) {
    const auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<string, unknown>;
    throwIfTdError(auth);
    const t = (auth['@type'] as string) ?? null;
    lastState = t;
    if (t === 'authorizationStateReady') {
      return { ready: true, state: t };
    }
    if (
      t === 'authorizationStateWaitPhoneNumber' ||
      t === 'authorizationStateWaitCode' ||
      t === 'authorizationStateWaitPassword' ||
      t === 'authorizationStateWaitRegistration' ||
      t === 'authorizationStateWaitTdlibParameters'
    ) {
      return { ready: false, state: t };
    }
    await new Promise((r) => setTimeout(r, AUTH_READY_POLL_MS));
  }
  return { ready: false, state: lastState };
}
