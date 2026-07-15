/**
 * Small pure guards for TDLib auth/session recovery.
 * These protect iOS from hard client recreation while a sticky session is still trusted.
 */

export function shouldBootstrapPhoneLoginFromLocalStatus(status: string): boolean {
  return status !== 'ready';
}

export function shouldForceApplyParametersOnWaitTdlibParameters(hasStickySession: boolean): boolean {
  return !hasStickySession;
}
