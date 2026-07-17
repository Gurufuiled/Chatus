import { sanitizeClientLogText } from '../clientRemoteLogSanitize';

const AUTH_KEY_DROP_PREFIX = 'AUTH_KEY_DROP_';
const MAX_SERVICE_TEXT = 500;
const MAX_DIAGNOSTIC_LINES = 12;
const MAX_DIAGNOSTIC_LINE = 300;
const MAX_DIAGNOSTIC_PAYLOAD = 2800;
const RELEVANT_LOG_LINE =
  /\b(?:auth(?:orization)?|session|error|401|406|AUTH_KEY)\b|authorizationState/i;
const SAFE_AUTH_KEY_DROP_TYPES = new Set([
  'AUTH_KEY_DROP_DUPLICATE',
  'AUTH_KEY_DROP_PERMANENT',
  'AUTH_KEY_DROP_TEMPORARY',
]);
const SAFE_REMOTE_LOG_TOKENS = [
  'AUTH_KEY_DUPLICATED',
  'AUTH_KEY_UNREGISTERED',
  'AUTH_KEY_INVALID',
  'AUTH_KEY_PERM_EMPTY',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'SESSION_PASSWORD_NEEDED',
  'authorizationStateLoggingOut',
  'authorizationStateClosing',
  'authorizationStateClosed',
  'authorizationStateReady',
  'authorizationStateWaitTdlibParameters',
  'authorizationStateWaitPhoneNumber',
  'authorizationStateWaitCode',
  'authorizationStateWaitPassword',
] as const;
const FRESH_LOGIN_AUTH_STATES = new Set([
  'authorizationStateWaitPhoneNumber',
  'authorizationStateWaitEmailAddress',
  'authorizationStateWaitRegistration',
  'authorizationStateWaitCode',
  'authorizationStateWaitEmailCode',
  'authorizationStateWaitOtherDeviceConfirmation',
  'authorizationStateWaitPassword',
]);

export type TdlibServiceNotificationDiagnostic = {
  notificationType: string;
  remoteNotificationType: string;
  text: string;
  isAuthKeyDrop: boolean;
};

export type TdlibAuthKeyDropState = {
  notificationType: string;
  observedAt: number;
};

export type TdlibServiceNotificationUiDecision =
  | {
      kind: 'auth_key_drop';
      title: string;
      message: string;
    }
  | {
      kind: 'notice';
      title: string;
      message: string;
    }
  | { kind: 'none' };

export type TdlibServiceNotificationDeduper = {
  shouldDisplay: (diagnostic: TdlibServiceNotificationDiagnostic) => boolean;
  observeAuthState: (state: string | null | undefined) => void;
  reset: () => void;
};

let lastAuthKeyDrop: TdlibAuthKeyDropState | null = null;

function sanitizeDiagnosticText(value: string, maxLength: number): string {
  return sanitizeClientLogText(value)
    .replace(
      /\b(phone(?:_number)?|code|api[_-]?hash|token|password|message|content|text)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1=[redacted]',
    )
    .replace(/\b[A-Fa-f0-9]{24,}\b/g, '[secret]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[secret]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/(?:file:\/\/)?\/(?:private\/)?var\/[^\s\])},]+/gi, '[path]')
    .replace(/(?:file:\/\/)?\/Users\/[^\s\])},]+/gi, '[path]')
    .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function parseTdlibServiceNotification(
  update: Record<string, unknown>,
): TdlibServiceNotificationDiagnostic | null {
  if (update['@type'] !== 'updateServiceNotification') return null;
  const rawType = typeof update.type === 'string' ? update.type.trim() : '';
  const content = update.content;
  let rawText = '';
  if (typeof content === 'string') {
    rawText = content;
  } else if (content && typeof content === 'object') {
    const text = (content as { text?: unknown }).text;
    if (typeof text === 'string') {
      rawText = text;
    } else if (
      text &&
      typeof text === 'object' &&
      typeof (text as { text?: unknown }).text === 'string'
    ) {
      rawText = String((text as { text: string }).text);
    }
  }
  const notificationType =
    sanitizeDiagnosticText(rawType, 96).replace(/[^A-Za-z0-9_.-]/g, '_') || 'unknown';
  return {
    notificationType,
    remoteNotificationType: rawType.startsWith(AUTH_KEY_DROP_PREFIX)
      ? SAFE_AUTH_KEY_DROP_TYPES.has(rawType)
        ? rawType
        : 'AUTH_KEY_DROP_OTHER'
      : 'OTHER',
    text: sanitizeDiagnosticText(rawText, MAX_SERVICE_TEXT),
    isAuthKeyDrop: rawType.startsWith(AUTH_KEY_DROP_PREFIX),
  };
}

export function getTdlibServiceNotificationUiDecision(
  diagnostic: TdlibServiceNotificationDiagnostic,
): TdlibServiceNotificationUiDecision {
  if (diagnostic.isAuthKeyDrop) {
    return {
      kind: 'auth_key_drop',
      title: 'Сессия Telegram завершена',
      message:
        diagnostic.text ||
        'Telegram отключил текущую сессию. Выйдите из аккаунта и войдите снова.',
    };
  }
  if (!diagnostic.text) return { kind: 'none' };
  return {
    kind: 'notice',
    title: 'Telegram',
    message: diagnostic.text,
  };
}

export function createTdlibServiceNotificationDeduper(
  maxFingerprints = 32,
): TdlibServiceNotificationDeduper {
  const seen = new Set<string>();
  const order: string[] = [];
  let freshLoginStateSeen = false;
  const reset = () => {
    seen.clear();
    order.length = 0;
    freshLoginStateSeen = false;
  };
  return {
    shouldDisplay: (diagnostic) => {
      const fingerprint = `${diagnostic.notificationType}\u0000${diagnostic.text}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      order.push(fingerprint);
      while (order.length > Math.max(1, maxFingerprints)) {
        const oldest = order.shift();
        if (oldest) seen.delete(oldest);
      }
      return true;
    },
    observeAuthState: (state) => {
      if (!state) return;
      if (FRESH_LOGIN_AUTH_STATES.has(state)) {
        freshLoginStateSeen = true;
        return;
      }
      if (state === 'authorizationStateReady' && freshLoginStateSeen) {
        reset();
        freshLoginStateSeen = false;
      }
    },
    reset,
  };
}

export function markTdlibAuthKeyDrop(
  diagnostic: TdlibServiceNotificationDiagnostic,
  observedAt = Date.now(),
): void {
  if (!diagnostic.isAuthKeyDrop) return;
  lastAuthKeyDrop = {
    notificationType: diagnostic.notificationType,
    observedAt,
  };
}

export function getLastTdlibAuthKeyDrop(): TdlibAuthKeyDropState | null {
  return lastAuthKeyDrop ? { ...lastAuthKeyDrop } : null;
}

export function filterTdlibLogDiagnostics(rawTail: string): string[] {
  const selected = rawTail
    .split(/\r?\n/)
    .filter((line) => RELEVANT_LOG_LINE.test(line))
    .slice(-MAX_DIAGNOSTIC_LINES)
    .map((line) => {
      const codes = Array.from(line.matchAll(/\b(?:401|406)\b/g), (match) => match[0]);
      const tokens = SAFE_REMOTE_LOG_TOKENS.filter((token) => {
        const start = line.indexOf(token);
        if (start < 0) return false;
        const before = start > 0 ? line[start - 1] : '';
        const after = line[start + token.length] ?? '';
        return !/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after);
      });
      const flags = [
        /\bauth(?:orization)?\b/i.test(line) ? 'auth' : '',
        /\bsession\b/i.test(line) ? 'session' : '',
        /\berror\b/i.test(line) ? 'error' : '',
      ].filter(Boolean);
      return [
        codes.length ? `codes=${Array.from(new Set(codes)).join(',')}` : '',
        tokens.length ? `tokens=${Array.from(new Set(tokens)).join(',')}` : '',
        flags.length ? `flags=${flags.join(',')}` : '',
      ]
        .filter(Boolean)
        .join(' ')
        .slice(0, MAX_DIAGNOSTIC_LINE);
    })
    .filter(Boolean);

  const bounded: string[] = [];
  const seen = new Set<string>();
  let size = 0;
  for (const line of selected) {
    if (seen.has(line)) continue;
    seen.add(line);
    const available = MAX_DIAGNOSTIC_PAYLOAD - size;
    if (available <= 0) break;
    const next = line.slice(0, available);
    bounded.push(next);
    size += next.length;
  }
  return bounded;
}
