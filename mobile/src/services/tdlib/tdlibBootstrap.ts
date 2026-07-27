import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getTelegramBuildCredentials, tdlibClient } from './TdlibClient';
import { throwIfTdError } from './tdlibErrors';
import {
  isClosedOrClosingAuthState,
  isTrulyClosedAuthState,
  shouldAllowHardRecreateOnClosed,
  shouldForceApplyParametersInSoftOrWaitLoop,
  shouldForceApplyParametersOnWaitTdlibParameters,
} from './tdlibSessionPolicy';
import { logTdlibEvent } from '../clientRemoteLog';
import { filterTdlibLogDiagnostics } from './tdlibDiagnostics';
import {
  createTdlibRecoveryEpoch,
  runTdlibRecoveryBoundary,
} from './tdlibRecoveryEpoch';

/** Shown in Telegram → Devices; keep in sync with setTdlibParameters. */
export const TDLIB_DEVICE_MODEL = 'Chatus';
const TDLIB_DATABASE_FOLDER = 'tdlib';
const TDLIB_FILES_FOLDER = 'tdlib_files';

/**
 * A native TDLib client on iOS must not be destroyed as a side effect of a
 * failed send/recovery. The next explicit login is the only safe place to
 * create a replacement client there. Android keeps its established recovery
 * behaviour.
 */
function canAutomaticallyRecreateTdlibClient(): boolean {
  return Platform.OS !== 'ios';
}

/** Telegram uses this as part of the active-session identity. */
export function getTdlibSystemVersion(): string {
  const platformName = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  const version = String(Platform.Version ?? '').trim();
  return version ? `${platformName} ${version}` : platformName;
}

/** Safe identity for remote logs (never includes api_hash). */
export function getTdlibClientIdentity(): {
  apiId: number | null;
  deviceModel: string;
  systemVersion: string;
  applicationVersion: string;
  platform: string;
} {
  const { apiId } = getTelegramBuildCredentials();
  return {
    apiId,
    deviceModel: TDLIB_DEVICE_MODEL,
    systemVersion: getTdlibSystemVersion(),
    applicationVersion: String(Constants.expoConfig?.version ?? '1.0.0'),
    platform: Platform.OS,
  };
}

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
  // documentDirectory is persistent app storage on iOS. Do not use cacheDirectory:
  // iOS may purge it and TDLib would then lose the auth-key database.
  const databaseUri = `${baseUri}/${TDLIB_DATABASE_FOLDER}`;
  const filesUri = `${baseUri}/${TDLIB_FILES_FOLDER}`;
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
const recoveryEpoch = createTdlibRecoveryEpoch();
let lastRecoveryFinishedMs = 0;
let backgroundRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let lastNativeVerifyMs = 0;
/** After LoggingOut, Closed/WaitPhone must clear sticky even if the DB probe races. */
let expectEmptyDbAfterLogout = false;
/** AUTH_KEY_DROP destroy keeps local state until TDLib confirms Closed. */
let notifyEmptyDatabaseOnRecoveryAbort = true;
/** First time we saw true Closed this recovery attempt (debounce before hard recreate). */
let closedSeenAtMs = 0;
let hardRecreateCountThisProcess = 0;
const NATIVE_VERIFY_MIN_INTERVAL_MS = 12_000;
const RECOVERY_COOLDOWN_MS = 45_000;
const CLOSED_HARD_RECREATE_DEBOUNCE_MS = 1_200;
const MAX_HARD_RECREATES_PER_PROCESS = 3;
const TDLIB_LOG_FILE_NAME = 'tdlib-ios.log';
const TDLIB_LOG_MAX_FILE_SIZE = 1_500_000;
const TDLIB_LOG_TAIL_BYTES = 128 * 1024;
let lastLoggingOutLogCaptureMs = 0;

/** Set from telegramAccountStore to avoid a circular import with bootstrap. */
let stickySessionProbe: (() => boolean) | null = null;
/** Clears JS sticky session when TDLib DB is gone (no second `logOut`). */
let emptyDatabaseHandler: (() => void) | null = null;

export function setTdlibStickySessionProbe(probe: (() => boolean) | null): void {
  stickySessionProbe = probe;
}

export function setTdlibEmptyDatabaseHandler(handler: (() => void) | null): void {
  emptyDatabaseHandler = handler;
}

function hasStickyLocalTelegramSession(): boolean {
  try {
    return stickySessionProbe?.() === true;
  } catch {
    return false;
  }
}

function notifyEmptyTdlibDatabase(): void {
  try {
    emptyDatabaseHandler?.();
  } catch {
    /* store handler must not break send path */
  }
}

function isEmptySessionLoginGate(state: string | null | undefined): boolean {
  return (
    state === 'authorizationStateWaitPhoneNumber' ||
    state === 'authorizationStateWaitRegistration' ||
    state === 'authorizationStateWaitEmailAddress' ||
    state === 'authorizationStateClosed' ||
    state === 'authorizationStateClosing' ||
    state === 'authorizationStateWaitTdlibParameters'
  );
}

/**
 * When sticky JS session cannot be restored because the on-disk TDLib DB is gone,
 * drop sticky state and tell the user to sign in again (do not keep saying "reconnect").
 */
async function failIfStickySessionDatabaseGone(live: string | null): Promise<never | void> {
  if (!(await shouldClearStickyTelegramSession(live))) return;
  const expectLogout = expectEmptyDbAfterLogout;
  cancelBackgroundTdlibRecovery();
  if (hasStickyLocalTelegramSession()) {
    // Handler clears sticky + expectEmptyDbAfterLogout after persist wipe.
    notifyEmptyTdlibDatabase();
  } else if (expectLogout) {
    // Sticky already gone — still hold the flag until Closed/empty DB path finishes.
  } else {
    clearTdlibLoggingOutExpectation();
  }
  logTdlibEvent('sticky session DB gone — require reauth', {
    level: 'warn',
    data: { live, expectLogout },
    flushSoon: true,
  });
  throw new Error('Сессия Telegram истекла. Откройте Настройки → Telegram и войдите снова.');
}

/**
 * True when TDLib left session files under database_directory (not just JS SecureStore cache).
 * Returns null if the probe failed (unknown — do not treat as missing).
 */
export async function hasTdlibDatabaseOnDisk(): Promise<boolean | null> {
  try {
    const { databaseDir } = await getTdlibDirectories();
    const baseUri = `file://${databaseDir}`.replace(/([^:]\/)\/+/g, '$1');
    const dirInfo = await FileSystem.getInfoAsync(baseUri);
    if (!dirInfo.exists || !dirInfo.isDirectory) return false;
    const candidates = ['td.binlog', 'db.sqlite', 'db.sqlite-wal'];
    for (const name of candidates) {
      const info = await FileSystem.getInfoAsync(`${baseUri}/${name}`);
      if (info.exists) return true;
    }
    return false;
  } catch {
    return null;
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
  recoveryEpoch.cancel();
  if (backgroundRecoveryTimer) {
    clearTimeout(backgroundRecoveryTimer);
    backgroundRecoveryTimer = null;
  }
}

/**
 * Mark that TDLib is wiping its DB (LoggingOut) — Closed must not schedule recover,
 * and in-flight soft/hard recovery must short-circuit (never recreateClient while set).
 */
export function markTdlibLoggingOut(options?: {
  deferLocalClearUntilClosed?: boolean;
}): void {
  expectEmptyDbAfterLogout = true;
  notifyEmptyDatabaseOnRecoveryAbort = options?.deferLocalClearUntilClosed !== true;
  cancelBackgroundTdlibRecovery();
}

/** Best-effort, bounded native diagnostic capture; failures never affect auth state. */
export async function captureTdlibLoggingOutDiagnostics(): Promise<void> {
  const now = Date.now();
  if (now - lastLoggingOutLogCaptureMs < 10_000) return;
  lastLoggingOutLogCaptureMs = now;
  try {
    const rawTail = await tdlibClient.readTdlibLogTail(TDLIB_LOG_TAIL_BYTES);
    if (!rawTail) return;
    const lines = filterTdlibLogDiagnostics(rawTail);
    if (lines.length === 0) return;
    logTdlibEvent('TDLib auth log tail on LoggingOut', {
      level: 'error',
      data: { lines },
      flushSoon: true,
    });
  } catch {
    /* diagnostic capture must never alter the authorization flow */
  }
}

function abortRecoveryIfLoggingOut(live: string | null | undefined): boolean {
  if (!expectEmptyDbAfterLogout) return false;
  logTdlibEvent('recover aborted (LoggingOut)', {
    level: 'warn',
    data: { live },
    flushSoon: true,
  });
  if (notifyEmptyDatabaseOnRecoveryAbort && hasStickyLocalTelegramSession()) {
    notifyEmptyTdlibDatabase();
  }
  // Do not clear expectEmptyDbAfterLogout here — Closed/empty-DB handler needs it.
  return true;
}

function recoveryWasCancelled(capturedEpoch: number): boolean {
  return !recoveryEpoch.isCurrent(capturedEpoch);
}

export function clearTdlibLoggingOutExpectation(): void {
  expectEmptyDbAfterLogout = false;
  notifyEmptyDatabaseOnRecoveryAbort = true;
}

export function isExpectingEmptyTdlibDatabaseAfterLogout(): boolean {
  return expectEmptyDbAfterLogout;
}

/** True when sticky session should be treated as gone (logout in flight or empty DB). */
export async function shouldClearStickyTelegramSession(
  live: string | null | undefined,
): Promise<boolean> {
  if (expectEmptyDbAfterLogout) return true;
  if (!isEmptySessionLoginGate(live ?? null)) return false;
  return (await hasTdlibDatabaseOnDisk()) === false;
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
 * Soft recover: wait Ready / getMe / re-applyTdlibParameters without destroying the client.
 * Prefer this for send/background — recreateClient kills the live iOS session.
 * Sticky WaitTdlibParameters: never force-apply (policy); wait / getMe only.
 */
async function softRecoverTdlibSession(
  sticky: boolean,
  capturedEpoch: number,
): Promise<{
  ok: boolean;
  state: string | null;
}> {
  if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(null)) {
    return { ok: false, state: 'authorizationStateLoggingOut' };
  }

  let live = await readLiveAuthState().catch((error) => {
    if (isTdlibClientClosedError(error)) return 'authorizationStateClosed';
    return null;
  });

  if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(live)) {
    return { ok: false, state: live };
  }

  if (isClosedOrClosingAuthState(live) || live === 'authorizationStateLoggingOut') {
    return { ok: false, state: live };
  }

  try {
    if (recoveryWasCancelled(capturedEpoch)) return { ok: false, state: live };
    if (live === 'authorizationStateWaitTdlibParameters') {
      if (shouldForceApplyParametersInSoftOrWaitLoop(sticky)) {
        if (recoveryWasCancelled(capturedEpoch)) return { ok: false, state: live };
        await applyTdlibParameters({
          force: true,
          shouldAbort: () => recoveryWasCancelled(capturedEpoch),
        });
      } else if (await canCallAuthorizedApis()) {
        if (recoveryWasCancelled(capturedEpoch)) return { ok: false, state: live };
        return { ok: true, state: 'authorizationStateReady' };
      } else {
        // Sticky: safe non-force apply only (never force:true) before wait loop.
        if (recoveryWasCancelled(capturedEpoch)) return { ok: false, state: live };
        await applyTdlibParameters({
          shouldAbort: () => recoveryWasCancelled(capturedEpoch),
        }).catch(() => undefined);
      }
    } else {
      if (recoveryWasCancelled(capturedEpoch)) return { ok: false, state: live };
      await applyTdlibParameters({
        shouldAbort: () => recoveryWasCancelled(capturedEpoch),
      }).catch(() => undefined);
    }
    if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(live)) {
      return { ok: false, state: live };
    }
    const { ready, state } = await waitForTdlibAuthorizationReady(20_000, {
      stickySession: sticky,
      stickyGraceMs: RECOVERY_STICKY_GRACE_MS,
      shouldAbort: () => recoveryWasCancelled(capturedEpoch),
    });
    if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(state)) {
      return { ok: false, state };
    }
    live = state;
    if (ready) return { ok: true, state: live };
    const callable = await canCallAuthorizedApis();
    return {
      ok: !recoveryWasCancelled(capturedEpoch) && callable,
      state: live,
    };
  } catch (e) {
    if (recoveryWasCancelled(capturedEpoch)) {
      return { ok: false, state: live };
    }
    logTdlibEvent('recoverTdlibSession soft apply/wait failed', {
      level: 'warn',
      data: { error: e instanceof Error ? e.message : String(e) },
      flushSoon: true,
    });
    live = await readLiveAuthState().catch(() => live);
    if (recoveryWasCancelled(capturedEpoch)) {
      return { ok: false, state: live };
    }
    return { ok: false, state: live };
  }
}

/**
 * Recover TDLib session. Soft-first (no destroy); hard recreateClient only when
 * allowRecreate and live state is true Closed (not Closing) after soft failed.
 * Phone-login after logout uses `ensureTdlibReadyForPhoneLogin` (direct recreate),
 * not this helper. Default allowRecreate:false for send/background.
 */
export async function recoverTdlibSession(options?: {
  allowRecreate?: boolean;
}): Promise<boolean> {
  const allowRecreate = options?.allowRecreate === true;
  if (expectEmptyDbAfterLogout) {
    // Notify sticky clear, but keep expectEmptyDbAfterLogout until Closed/empty DB completes.
    if (notifyEmptyDatabaseOnRecoveryAbort && hasStickyLocalTelegramSession()) {
      notifyEmptyTdlibDatabase();
    }
    return false;
  }
  if (recoveryInFlight) return recoveryInFlight;
  const capturedEpoch = recoveryEpoch.capture();
  recoveryInFlight = (async () => {
    if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(null)) return false;
    const sticky = hasStickyLocalTelegramSession();
    const sinceLast = Date.now() - lastRecoveryFinishedMs;
    if (sinceLast < RECOVERY_COOLDOWN_MS) {
      // Soft wait only — unless true Closed + allowRecreate (hard path still needed).
      const cooldownLive = await readLiveAuthState().catch((error) => {
        if (isTdlibClientClosedError(error)) return 'authorizationStateClosed';
        return null;
      });
      if (
        recoveryWasCancelled(capturedEpoch) ||
        abortRecoveryIfLoggingOut(cooldownLive)
      ) {
        return false;
      }
      if (!(allowRecreate && isTrulyClosedAuthState(cooldownLive))) {
        logTdlibEvent('recoverTdlibSession soft (cooldown)', {
          level: 'info',
          data: { allowRecreate, sticky, state: cooldownLive },
        });
        const { ready } = await waitForTdlibAuthorizationReady(20_000, {
          stickySession: sticky,
          stickyGraceMs: RECOVERY_STICKY_GRACE_MS,
          shouldAbort: () => recoveryWasCancelled(capturedEpoch),
        });
        if (recoveryWasCancelled(capturedEpoch)) return false;
        lastRecoveryFinishedMs = Date.now();
        if (ready) return true;
        const callable = await canCallAuthorizedApis();
        return !recoveryWasCancelled(capturedEpoch) && callable;
      }
      logTdlibEvent('recoverTdlibSession cooldown skip (Closed)', {
        level: 'info',
        data: { allowRecreate, sticky, state: cooldownLive },
      });
      // Fall through to soft then hard recreate for true Closed.
    }

    logTdlibEvent('recoverTdlibSession soft', {
      level: 'info',
      data: { allowRecreate, sticky },
    });
    const soft = await softRecoverTdlibSession(sticky, capturedEpoch);
    // Always stamp cooldown after any soft attempt (success or failure) to stop re-init loops.
    lastRecoveryFinishedMs = Date.now();
    if (
      recoveryWasCancelled(capturedEpoch) ||
      abortRecoveryIfLoggingOut(soft.state)
    ) {
      return false;
    }
    if (soft.ok) {
      logTdlibEvent('recoverTdlibSession ok', {
        level: 'info',
        data: { mode: 'soft', state: soft.state },
      });
      return true;
    }

    let live = soft.state ?? (await readLiveAuthState().catch(() => null));
    if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(live)) {
      return false;
    }

    const hardAllowed = await canProceedWithHardRecreate(
      live,
      allowRecreate,
      capturedEpoch,
    );
    if (recoveryWasCancelled(capturedEpoch)) return false;
    if (!hardAllowed) {
      const dbOnDisk = await hasTdlibDatabaseOnDisk();
      if (recoveryWasCancelled(capturedEpoch)) return false;
      logTdlibEvent('recoverTdlibSession not ready', {
        level: 'warn',
        data: {
          mode: 'soft',
          allowRecreate,
          state: live,
          dbOnDisk,
          expectLogout: expectEmptyDbAfterLogout,
          hardRecreateCount: hardRecreateCountThisProcess,
        },
        flushSoon: true,
      });
      if (dbOnDisk === false && isEmptySessionLoginGate(live)) {
        cancelBackgroundTdlibRecovery();
        notifyEmptyTdlibDatabase();
      }
      return false;
    }

    // Hard path: true Closed after soft failed — destroy+recreate.
    if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(live)) {
      return false;
    }
    logTdlibEvent('recoverTdlibSession hard recreate', {
      level: 'info',
      data: { state: live, sticky, hardRecreateCount: hardRecreateCountThisProcess },
      flushSoon: true,
    });
    let didRecreate = false;
    try {
      const recreateBoundary = await runTdlibRecoveryBoundary(
        recoveryEpoch,
        capturedEpoch,
        () => {
          hardRecreateCountThisProcess += 1;
          return tdlibClient.recreateClient();
        },
      );
      if (recreateBoundary.cancelled) return false;
      const recreated = recreateBoundary.value;
      didRecreate = recreated;
      closedSeenAtMs = 0;
      if (!recreated && __DEV__) {
        console.warn('[tdlib] recreateClient not available on this platform build');
      }
    } catch (e) {
      if (recoveryWasCancelled(capturedEpoch)) return false;
      if (__DEV__) console.warn('[tdlib] recreateClient failed', e);
      logTdlibEvent('recreateClient failed', {
        level: 'error',
        data: { error: e instanceof Error ? e.message : String(e) },
        flushSoon: true,
      });
      lastRecoveryFinishedMs = Date.now();
      return false;
    }
    if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(live)) {
      return false;
    }
    try {
      // force:true clears the lock only after the new native client exists (intentional recreate).
      const applyBoundary = await runTdlibRecoveryBoundary(
        recoveryEpoch,
        capturedEpoch,
        () =>
          applyTdlibParameters({
            force: true,
            shouldAbort: () => recoveryWasCancelled(capturedEpoch),
          }),
      );
      if (applyBoundary.cancelled) return false;
      // After recreate, iOS often flashes WaitPhone while opening SQLite — allow ~18s, not 2.5s.
      const { ready, state } = await waitForTdlibAuthorizationReady(20_000, {
        stickySession: sticky,
        stickyGraceMs: RECOVERY_STICKY_GRACE_MS,
        shouldAbort: () => recoveryWasCancelled(capturedEpoch),
      });
      lastRecoveryFinishedMs = Date.now();
      if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(state)) {
        return false;
      }
      const ok = ready || (await canCallAuthorizedApis());
      if (recoveryWasCancelled(capturedEpoch)) return false;
      if (!ok) {
        const dbOnDisk = await hasTdlibDatabaseOnDisk();
        if (recoveryWasCancelled(capturedEpoch)) return false;
        live = state ?? (await readLiveAuthState().catch(() => null));
        if (recoveryWasCancelled(capturedEpoch)) return false;
        logTdlibEvent('recoverTdlibSession not ready', {
          level: 'warn',
          data: { mode: 'hard', didRecreate, ready, state: live, dbOnDisk },
          flushSoon: true,
        });
        // Empty DB + WaitPhone/Closed after recreate: session is gone — clear sticky JS
        // so send stops looping on "переподключается" forever.
        if (dbOnDisk === false && isEmptySessionLoginGate(live)) {
          cancelBackgroundTdlibRecovery();
          notifyEmptyTdlibDatabase();
        }
        return false;
      }
      logTdlibEvent('recoverTdlibSession ok', {
        level: 'info',
        data: { mode: 'hard', didRecreate, ready },
      });
      return true;
    } catch (e) {
      if (recoveryWasCancelled(capturedEpoch)) return false;
      logTdlibEvent('recoverTdlibSession apply/wait failed', {
        level: 'error',
        data: {
          mode: 'hard',
          error: e instanceof Error ? e.message : String(e),
          didRecreate,
        },
        flushSoon: true,
      });
      lastRecoveryFinishedMs = Date.now();
      return false;
    }
  })().finally(() => {
    recoveryInFlight = null;
  });
  return recoveryInFlight;
}

/**
 * True Closed debounce + logout/budget/DB gates before destroy+recreate.
 */
async function canProceedWithHardRecreate(
  live: string | null,
  allowRecreate: boolean,
  capturedEpoch: number,
): Promise<boolean> {
  if (recoveryWasCancelled(capturedEpoch)) return false;
  if (!allowRecreate) return false;
  if (!canAutomaticallyRecreateTdlibClient()) {
    // iOS may enter Closed because Telegram revoked the auth key. Recreating a
    // client from a send/recovery path only creates more session churn; wait
    // for the user to explicitly start a new login instead.
    logTdlibEvent('automatic recreate disabled on iOS', {
      level: 'warn',
      data: { state: live },
      flushSoon: true,
    });
    return false;
  }
  if (
    !shouldAllowHardRecreateOnClosed({
      authState: live,
      expectEmptyDbAfterLogout,
      hardRecreateCountThisProcess,
      maxHardRecreatesPerProcess: MAX_HARD_RECREATES_PER_PROCESS,
    })
  ) {
    return false;
  }

  const now = Date.now();
  if (closedSeenAtMs === 0) {
    closedSeenAtMs = now;
  }
  const waited = now - closedSeenAtMs;
  if (waited < CLOSED_HARD_RECREATE_DEBOUNCE_MS) {
    await new Promise((r) => setTimeout(r, CLOSED_HARD_RECREATE_DEBOUNCE_MS - waited));
  }
  if (recoveryWasCancelled(capturedEpoch) || abortRecoveryIfLoggingOut(live)) {
    return false;
  }

  const still = await readLiveAuthState().catch((error) => {
    if (isTdlibClientClosedError(error)) return 'authorizationStateClosed';
    return null;
  });
  if (recoveryWasCancelled(capturedEpoch)) return false;
  if (!isTrulyClosedAuthState(still)) {
    closedSeenAtMs = 0;
    return false;
  }
  if (
    !shouldAllowHardRecreateOnClosed({
      authState: still,
      expectEmptyDbAfterLogout,
      hardRecreateCountThisProcess,
      maxHardRecreatesPerProcess: MAX_HARD_RECREATES_PER_PROCESS,
    })
  ) {
    return false;
  }

  const dbOnDisk = await hasTdlibDatabaseOnDisk();
  if (recoveryWasCancelled(capturedEpoch)) return false;
  // Empty DB: do not recreate — sticky clear path handles reauth.
  if (dbOnDisk === false) return false;
  return true;
}

/**
 * Debounced soft recovery when a sticky session exists — never recreateClient.
 * Closed cannot soft-heal: do not schedule here; next send uses allowRecreate:true.
 */
export function scheduleBackgroundTdlibRecovery(): void {
  if (expectEmptyDbAfterLogout) return;
  if (!hasStickyLocalTelegramSession()) return;
  if (recoveryInFlight) return;
  const sinceLast = Date.now() - lastRecoveryFinishedMs;
  if (sinceLast < RECOVERY_COOLDOWN_MS) return;
  if (backgroundRecoveryTimer) return;
  const scheduledEpoch = recoveryEpoch.capture();
  backgroundRecoveryTimer = setTimeout(() => {
    backgroundRecoveryTimer = null;
    if (recoveryWasCancelled(scheduledEpoch)) return;
    if (expectEmptyDbAfterLogout) return;
    if (!hasStickyLocalTelegramSession()) return;
    void (async () => {
      const live = await readLiveAuthState().catch((error) => {
        if (isTdlibClientClosedError(error)) return 'authorizationStateClosed';
        return null;
      });
      if (recoveryWasCancelled(scheduledEpoch)) return;
      // Soft path exits immediately on Closed/Closing — rely on next send for hard recreate.
      // Do not soft-recover Closed here (send-path hard recreate after sticky/DB checks).
      if (isClosedOrClosingAuthState(live) || live === 'authorizationStateLoggingOut') {
        lastRecoveryFinishedMs = Date.now();
        logTdlibEvent('background soft recovery skipped (Closed/Closing)', {
          level: 'info',
          data: { state: live },
        });
        return;
      }
      const ok = await recoverTdlibSession({ allowRecreate: false });
      if (recoveryWasCancelled(scheduledEpoch)) return;
      if (ok && __DEV__) {
        console.log('[tdlib] background soft session recovery succeeded');
      }
    })();
  }, 3000);
}

export function applyTdlibParameters(options?: {
  force?: boolean;
  shouldAbort?: () => boolean;
}): Promise<void> {
  if (options?.shouldAbort?.()) return Promise.resolve();
  if (options?.force) {
    tdlibParametersAppliedThisProcess = false;
  }
  if (tdlibParametersAppliedThisProcess && !options?.force) {
    return verifyTdlibNativeStillInitialized(options?.shouldAbort);
  }
  if (applyInFlight) {
    if (!options?.force) return applyInFlight;
    return applyInFlight
      .catch(() => undefined)
      .then(() => {
        if (options?.shouldAbort?.()) return;
        tdlibParametersAppliedThisProcess = false;
        applyInFlight = doApplyTdlibParameters(options?.shouldAbort).finally(() => {
          applyInFlight = null;
        });
        return applyInFlight;
      });
  }
  applyInFlight = doApplyTdlibParameters(options?.shouldAbort).finally(() => {
    applyInFlight = null;
  });
  return applyInFlight;
}

/** Native client may have been recreated while JS still thinks parameters were applied. */
async function verifyTdlibNativeStillInitialized(
  shouldAbort?: () => boolean,
): Promise<void> {
  if (shouldAbort?.()) return;
  const now = Date.now();
  if (now - lastNativeVerifyMs < NATIVE_VERIFY_MIN_INTERVAL_MS) return;
  lastNativeVerifyMs = now;
  if (recoveryInFlight) return;

  try {
    const auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<
      string,
      unknown
    >;
    if (shouldAbort?.()) return;
    throwIfTdError(auth);
    const probeType = readAuthStateType(auth);
    if (probeType === 'authorizationStateWaitTdlibParameters') {
      if (!shouldForceApplyParametersOnWaitTdlibParameters(hasStickyLocalTelegramSession())) {
        logTdlibEvent('verifyTdlibNativeStillInitialized wait parameters with sticky session', {
          level: 'warn',
          data: { state: probeType },
          flushSoon: true,
        });
        return;
      }
      if (shouldAbort?.()) return;
      tdlibParametersAppliedThisProcess = false;
      await applyTdlibParameters({ force: true, shouldAbort });
      return;
    }
    if (
      probeType === 'authorizationStateClosed' ||
      probeType === 'authorizationStateClosing'
    ) {
      // Closed needs hard recreate on next send — soft background cannot heal it.
      tdlibParametersAppliedThisProcess = false;
      if (probeType === 'authorizationStateClosed' && closedSeenAtMs === 0) {
        closedSeenAtMs = Date.now();
      }
    }
  } catch {
    /* native unavailable */
  }
}

function isTdlibClientClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /client is closed/i.test(message) ||
    /authorization is closing/i.test(message) ||
    /authorizationstateclosed/i.test(message)
  );
}

async function doApplyTdlibParameters(shouldAbort?: () => boolean): Promise<void> {
  if (shouldAbort?.()) return;
  if (tdlibParametersAppliedThisProcess) {
    return;
  }
  const { apiId, apiHash } = getTelegramBuildCredentials();
  if (apiId == null || !apiHash) {
    throw new Error('Нет TELEGRAM_API_ID / TELEGRAM_API_HASH в сборке');
  }
  const authProbe = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<string, unknown>;
  if (shouldAbort?.()) return;
  throwIfTdError(authProbe);
  const probeType = readAuthStateType(authProbe);
  if (!probeType) {
    throw new Error('TDLib: пустой ответ getAuthorizationState');
  }
  if (isClosedOrClosingAuthState(probeType)) {
    // Closed/Closing client cannot accept setTdlibParameters — must recreate first (true Closed only).
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
  if (shouldAbort?.()) return;

  logTdlibEvent('TDLib persistent storage configured', {
    level: 'info',
    data: {
      platform: Platform.OS,
      root: 'documentDirectory',
      databaseFolder: TDLIB_DATABASE_FOLDER,
      filesFolder: TDLIB_FILES_FOLDER,
      directoriesDistinct: databaseDir !== filesDir,
    },
  });

  try {
    await tdlibClient.send({
      '@type': 'setLogVerbosityLevel',
      new_verbosity_level: 2,
    });
    if (shouldAbort?.()) return;
    if (__DEV__) {
      await tdlibClient.send({
        '@type': 'setLogStream',
        log_stream: { '@type': 'logStreamDefault' },
      });
      if (shouldAbort?.()) return;
    } else if (Platform.OS === 'ios') {
      await tdlibClient.send({
        '@type': 'setLogStream',
        log_stream: {
          '@type': 'logStreamFile',
          path: `${filesDir}/${TDLIB_LOG_FILE_NAME}`,
          max_file_size: TDLIB_LOG_MAX_FILE_SIZE,
          redirect_stderr: false,
        },
      });
      if (shouldAbort?.()) return;
    }
  } catch {
    /* optional diagnostics; never block TDLib initialization */
  }

  const applicationVersion = String(Constants.expoConfig?.version ?? '1.0.0');
  if (shouldAbort?.()) return;
  const setRes = await tdlibClient.send({
    '@type': 'setTdlibParameters',
    use_test_dc: false,
    database_directory: databaseDir,
    files_directory: filesDir,
    database_encryption_key: '',
    api_id: apiId,
    api_hash: apiHash,
    system_language_code: 'ru',
    device_model: TDLIB_DEVICE_MODEL,
    system_version: getTdlibSystemVersion(),
    application_version: applicationVersion,
  });
  throwIfTdError(setRes);
  tdlibParametersAppliedThisProcess = true;
  if (shouldAbort?.()) return;
  logTdlibEvent('setTdlibParameters ok', {
    level: 'info',
    data: getTdlibClientIdentity(),
    flushSoon: true,
  });
}

const AUTH_READY_POLL_MS = 120;
const AUTH_READY_TIMEOUT_MS = 25_000;
/** After recreate, WaitPhone can flash briefly while DB opens — send path stays short. */
const STICKY_WAIT_PHONE_GRACE_MS = 2_500;
/** Recovery after recreateClient: iOS SQLite open often needs >2.5s before Ready. */
const RECOVERY_STICKY_GRACE_MS = 18_000;

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
 * stickySession: WaitPhone/WaitCode briefly tolerated while DB loads after recreate.
 * stickyGraceMs: override for recovery (long) vs send path (short).
 * Sticky WaitTdlibParameters: never force-apply — wait / getMe only.
 */
export async function waitForTdlibAuthorizationReady(
  timeoutMs = AUTH_READY_TIMEOUT_MS,
  options?: {
    stickySession?: boolean;
    stickyGraceMs?: number;
    shouldAbort?: () => boolean;
  },
): Promise<{ ready: boolean; state: string | null }> {
  const sticky = options?.stickySession === true;
  const stickyGraceMs = options?.stickyGraceMs ?? STICKY_WAIT_PHONE_GRACE_MS;
  const deadline = Date.now() + timeoutMs;
  let lastState: string | null = null;
  let appliedParameters = false;
  let loginGateSeenAt: number | null = null;
  let pollCount = 0;
  while (Date.now() < deadline) {
    if (options?.shouldAbort?.()) {
      return { ready: false, state: lastState };
    }
    if (expectEmptyDbAfterLogout) {
      return { ready: false, state: lastState ?? 'authorizationStateLoggingOut' };
    }
    const auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as Record<string, unknown>;
    throwIfTdError(auth);
    const t = (auth['@type'] as string) ?? null;
    lastState = t;
    pollCount += 1;
    if (t === 'authorizationStateReady') {
      closedSeenAtMs = 0;
      return { ready: true, state: t };
    }
    if (t === 'authorizationStateLoggingOut') {
      return { ready: false, state: t };
    }
    if (t === 'authorizationStateWaitTdlibParameters') {
      loginGateSeenAt = null;
      if (!appliedParameters) {
        appliedParameters = true;
        if (shouldForceApplyParametersInSoftOrWaitLoop(sticky)) {
          if (options?.shouldAbort?.()) return { ready: false, state: t };
          tdlibParametersAppliedThisProcess = false;
          await applyTdlibParameters({
            force: true,
            shouldAbort: options?.shouldAbort,
          }).catch(() => undefined);
        } else if (await canCallAuthorizedApis()) {
          if (options?.shouldAbort?.()) return { ready: false, state: t };
          closedSeenAtMs = 0;
          return { ready: true, state: 'authorizationStateReady' };
        } else {
          // Sticky: safe non-force apply only (never force:true), then keep polling.
          if (options?.shouldAbort?.()) return { ready: false, state: t };
          await applyTdlibParameters({
            shouldAbort: options?.shouldAbort,
          }).catch(() => undefined);
        }
      } else if (sticky && pollCount % 4 === 0 && (await canCallAuthorizedApis())) {
        closedSeenAtMs = 0;
        return { ready: true, state: 'authorizationStateReady' };
      }
      await new Promise((r) => setTimeout(r, AUTH_READY_POLL_MS));
      continue;
    }
    if (LOGIN_GATE_STATES.has(t ?? '')) {
      if (t === 'authorizationStateWaitPassword' && !sticky) {
        return { ready: false, state: t };
      }
      if (sticky) {
        if (loginGateSeenAt == null) loginGateSeenAt = Date.now();
        if (Date.now() - loginGateSeenAt < stickyGraceMs) {
          // Prefer getMe — Ready may lag behind an already-usable session.
          if (pollCount % 4 === 0 && (await canCallAuthorizedApis())) {
            closedSeenAtMs = 0;
            return { ready: true, state: 'authorizationStateReady' };
          }
          await new Promise((r) => setTimeout(r, AUTH_READY_POLL_MS));
          continue;
        }
      }
      return { ready: false, state: t };
    }
    loginGateSeenAt = null;
    await new Promise((r) => setTimeout(r, AUTH_READY_POLL_MS));
  }
  if (options?.shouldAbort?.()) {
    return { ready: false, state: lastState };
  }
  if (await canCallAuthorizedApis()) {
    if (options?.shouldAbort?.()) return { ready: false, state: lastState };
    closedSeenAtMs = 0;
    return { ready: true, state: lastState ?? 'authorizationStateReady' };
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

  if (expectEmptyDbAfterLogout) {
    throw new Error('Telegram выходит из аккаунта. Подождите и попробуйте снова.');
  }

  // Probe Closed BEFORE applyTdlibParameters — otherwise doApply throws
  // "TDLib client is closed" and never reaches recoverTdlibSession below.
  let live = await readLiveAuthState().catch((error) => {
    if (isTdlibClientClosedError(error)) return 'authorizationStateClosed';
    return null;
  });

  if (live === 'authorizationStateLoggingOut') {
    throw new Error('Telegram выходит из аккаунта. Подождите и попробуйте снова.');
  }

  // Closing: wait soft / fail — never destroy the client mid-close.
  if (live === 'authorizationStateClosing') {
    const { ready, state } = await waitForTdlibAuthorizationReady(4_000, {
      stickySession: sticky,
    });
    live = state;
    if (ready || (await canCallAuthorizedApis())) return;
    if (live === 'authorizationStateClosing' || live === 'authorizationStateLoggingOut') {
      throw new Error('Telegram переподключается. Подождите пару секунд и попробуйте снова.');
    }
  }

  if (isTrulyClosedAuthState(live)) {
    if (closedSeenAtMs === 0) closedSeenAtMs = Date.now();
    if (!allowSessionReload) {
      logTdlibEvent('ensureAuthorized: Closed, reload not allowed', {
        level: 'error',
        flushSoon: true,
      });
      throw new Error('TDLib client is closed');
    }
    if (expectEmptyDbAfterLogout) {
      throw new Error('Telegram выходит из аккаунта. Подождите и попробуйте снова.');
    }
    // True Closed cannot soft-recover — hard recreate with debounce/DB/budget gates.
    const recovered = await recoverTdlibSession({ allowRecreate: true }).catch(() => false);
    if (recovered || (await canCallAuthorizedApis())) return;
    live = await readLiveAuthState().catch(() => live);
    await failIfStickySessionDatabaseGone(live);
    // Do not schedule soft background recover — Closed needs hard recreate on next send.
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
      if (expectEmptyDbAfterLogout) {
        throw new Error('Telegram выходит из аккаунта. Подождите и попробуйте снова.');
      }
      const recovered = await recoverTdlibSession({ allowRecreate: true }).catch(() => false);
      if (recovered || (await canCallAuthorizedApis())) return;
      live = await readLiveAuthState().catch(() => 'authorizationStateClosed');
      await failIfStickySessionDatabaseGone(live);
      // Do not schedule soft background recover — Closed needs hard recreate on next send.
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

  if (live === 'authorizationStateWaitPassword' && !sticky) {
    throw new Error('Нужен облачный пароль 2FA Telegram. Откройте Настройки → Telegram.');
  }

  if (live === 'authorizationStateLoggingOut' || live === 'authorizationStateClosing') {
    throw new Error('Telegram выходит из аккаунта. Подождите и попробуйте снова.');
  }

  const isClosed = isTrulyClosedAuthState(live);
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
    // Soft by default; hard only if still true Closed after soft.
    const recovered = await recoverTdlibSession({
      allowRecreate: isTrulyClosedAuthState(live),
    }).catch(() => false);
    if (recovered || (await canCallAuthorizedApis())) return;
    live = await readLiveAuthState().catch(() => live);
  }

  if (live === 'authorizationStateWaitPassword' && !sticky) {
    throw new Error('Нужен облачный пароль 2FA Telegram. Откройте Настройки → Telegram.');
  }

  if (sticky) {
    await failIfStickySessionDatabaseGone(live);
    // Sticky = we still believe a local session exists (DB present or unknown).
    // Soft background only when not Closed/Closing (Closed heals on next send with allowRecreate).
    if (!isClosedOrClosingAuthState(live) && live !== 'authorizationStateLoggingOut') {
      scheduleBackgroundTdlibRecovery();
    }
    throw new Error('Telegram переподключается. Подождите пару секунд и попробуйте снова.');
  }

  // Recover may have cleared sticky while we still held the old `sticky` flag.
  await failIfStickySessionDatabaseGone(live);

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
