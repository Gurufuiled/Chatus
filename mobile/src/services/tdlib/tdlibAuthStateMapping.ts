import type { TelegramAuthStatus } from '../../stores/telegramAccountStore';

const TERMINAL_AUTH_STATES = new Set([
  'authorizationStateLoggingOut',
  'authorizationStateClosed',
]);

/**
 * Map TDLib authorization state to store status.
 * While UI shows an active session (`ready`), transient close must not flip to `error`.
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
    case 'authorizationStateLoggingOut':
    case 'authorizationStateClosed':
      if (current === 'ready' || current === 'error') return current === 'error' ? 'error' : 'ready';
      return 'error';
  }
  return current;
}

export function isTerminalTdlibAuthState(authType: string | undefined): boolean {
  return authType != null && TERMINAL_AUTH_STATES.has(authType);
}
