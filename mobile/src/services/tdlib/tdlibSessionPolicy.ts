/**
 * Small pure guards for TDLib auth/session recovery.
 * These protect iOS from hard client recreation while a sticky session is still trusted.
 */

export function shouldBootstrapPhoneLoginFromLocalStatus(status: string): boolean {
  return status !== 'ready';
}

/** Never force-apply setTdlibParameters while a sticky local session is trusted. */
export function shouldForceApplyParametersOnWaitTdlibParameters(hasStickySession: boolean): boolean {
  return !hasStickySession;
}

/**
 * Soft recover / wait-loop policy for WaitTdlibParameters.
 * Sticky: wait / getMe only — no force-apply (matches prod LoggingOut without OUTBOUND logOut).
 * Force-apply only after intentional recreateClient or non-sticky cold start.
 */
export function shouldForceApplyParametersInSoftOrWaitLoop(hasStickySession: boolean): boolean {
  return shouldForceApplyParametersOnWaitTdlibParameters(hasStickySession);
}

/** True Closed only — Closing must not trigger destroy/recreate. */
export function isTrulyClosedAuthState(probeType: string | null | undefined): boolean {
  return probeType === 'authorizationStateClosed';
}

export function isClosingAuthState(probeType: string | null | undefined): boolean {
  return probeType === 'authorizationStateClosing';
}

/** Closed or Closing — soft heal cannot help; do not force-apply. */
export function isClosedOrClosingAuthState(probeType: string | null | undefined): boolean {
  return isTrulyClosedAuthState(probeType) || isClosingAuthState(probeType);
}

/**
 * Hard recreateClient is allowed only on true Closed, not while LoggingOut/empty-DB wipe,
 * and not when the hard-recreate budget for this process is exhausted.
 */
export function shouldAllowHardRecreateOnClosed(options: {
  authState: string | null | undefined;
  expectEmptyDbAfterLogout: boolean;
  hardRecreateCountThisProcess: number;
  maxHardRecreatesPerProcess: number;
}): boolean {
  if (options.expectEmptyDbAfterLogout) return false;
  if (!isTrulyClosedAuthState(options.authState)) return false;
  if (options.hardRecreateCountThisProcess >= options.maxHardRecreatesPerProcess) return false;
  return true;
}

/** Placeholder `0` from auth success must not count as a sticky user id. */
export function isValidTelegramUserId(id: number | null | undefined): boolean {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}
