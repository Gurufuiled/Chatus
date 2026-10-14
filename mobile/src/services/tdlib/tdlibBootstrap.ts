import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { getTelegramBuildCredentials, tdlibClient } from './TdlibClient';
import { throwIfTdError } from './tdlibErrors';
import {
  AUTH_STATE_CLOSED,
  recoverTdlibSession,
  type SessionRecoveryOptions,
  type SessionRecoveryResult,
} from './tdlibSessionRecovery';

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

/**
 * Только если нативный клиент TDLib реально пересоздан (новый процесс приложения).
 * Не вызывать при «выходе из Telegram» в JS: нативный `client_id` тот же — повторный
 * `setTdlibParameters` даёт Unexpected setTdlibParameters.
 */
export function resetTdlibParametersLock(): void {
  tdlibParametersAppliedThisProcess = false;
  applyInFlight = null;
}

export function applyTdlibParameters(): Promise<void> {
  if (tdlibParametersAppliedThisProcess) {
    return Promise.resolve();
  }
  if (applyInFlight) {
    return applyInFlight;
  }
  applyInFlight = doApplyTdlibParameters().finally(() => {
    applyInFlight = null;
  });
  return applyInFlight;
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
  const probeType = (authProbe['@type'] as string) ?? '';
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
}

function waitForClosedState(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (tdlibClient.getLastAuthorizationState() === AUTH_STATE_CLOSED) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = tdlibClient.subscribe((update) => {
      if (update['@type'] !== 'updateAuthorizationState') return;
      const state = (update.authorization_state as { '@type'?: string } | undefined)?.['@type'];
      if (state !== AUTH_STATE_CLOSED) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

let recoveryInFlight: Promise<SessionRecoveryResult> | null = null;

/**
 * Гарантирует, что клиент TDLib жив: если он вышел из аккаунта (LoggingOut / Closing / Closed) — ждёт закрытия
 * (или делает `destroy`, если выход не завершается из-за недоступных серверов Telegram), создаёт нового клиента и
 * заново передаёт параметры. Живой клиент не трогает. Одновременные вызовы делят один проход.
 */
export function recoverTdlibAuthSession(options?: SessionRecoveryOptions): Promise<SessionRecoveryResult> {
  if (recoveryInFlight) return recoveryInFlight;
  const run = recoverTdlibSession(
    {
      readState: async () => {
        const known = tdlibClient.getLastAuthorizationState();
        if (known) return known;
        try {
          const auth = (await withTimeout(
            tdlibClient.send({ '@type': 'getAuthorizationState' }) as Promise<Record<string, unknown>>,
            4000,
          )) as Record<string, unknown>;
          return typeof auth['@type'] === 'string' ? (auth['@type'] as string) : null;
        } catch {
          return null;
        }
      },
      waitClosed: waitForClosedState,
      destroy: async () => {
        // закрытый клиент на запросы не отвечает — ответа может не быть, ждём закрытия по апдейтам
        await withTimeout(tdlibClient.send({ '@type': 'destroy' }), 4000).catch(() => undefined);
      },
      restartClient: () => tdlibClient.restartClient(),
      reinitialize: async () => {
        resetTdlibParametersLock();
        await applyTdlibParameters();
      },
    },
    options,
  ).finally(() => {
    recoveryInFlight = null;
  });
  recoveryInFlight = run;
  return run;
}

const AUTH_READY_POLL_MS = 120;
const AUTH_READY_TIMEOUT_MS = 25000;

/**
 * После `setTdlibParameters` TDLib поднимает сессию из БД асинхронно; сразу вызывать `getChats` часто даёт Unauthorized.
 */
export async function waitForTdlibAuthorizationReady(): Promise<{ ready: boolean; state: string | null }> {
  const deadline = Date.now() + AUTH_READY_TIMEOUT_MS;
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
