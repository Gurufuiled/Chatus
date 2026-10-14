/** Человекочитаемые сообщения для ошибок TDLib на шагах входа. */
export function formatTdlibAuthError(message: string): string {
  const key = message.trim().toUpperCase();
  if (key.includes('PASSWORD_HASH_INVALID')) {
    return (
      'Неверный облачный пароль.\n\n' +
      'Нужен пароль из официального Telegram: Настройки → Конфиденциальность → ' +
      'двухэтапная проверка → «Облачный пароль». Это не PIN SIM, не код из SMS и не пароль блокировки Chatus.\n\n' +
      'Проверьте раскладку клавиатуры и пробелы в начале или в конце пароля.'
    );
  }
  if (key.includes('PHONE_NUMBER_INVALID')) {
    return 'Номер телефона указан неверно. Введите его в международном формате, например +79881234567.';
  }
  if (key.includes('PHONE_NUMBER_BANNED')) {
    return 'Этот номер заблокирован в Telegram.';
  }
  if (key.includes('PHONE_CODE_INVALID') || key.includes('PHONE_CODE_EMPTY')) {
    return 'Неверный код. Проверьте цифры из Telegram или SMS и введите снова.';
  }
  if (key.includes('PHONE_CODE_EXPIRED')) {
    return 'Код устарел. Запросите новый код.';
  }
  const waitSeconds = parseFloodWaitSeconds(key);
  if (waitSeconds != null || key.includes('PHONE_NUMBER_FLOOD') || key.includes('TOO MANY REQUESTS')) {
    return (
      'Слишком много попыток входа: Telegram временно ограничил отправку кода.' +
      (waitSeconds != null ? ` Повторите через ${formatWaitDuration(waitSeconds)}.` : ' Повторите позже.')
    );
  }
  switch (key) {
    case 'PASSWORD_REQUIRED':
      return 'Для этого аккаунта включена двухэтапная проверка — введите облачный пароль Telegram.';
    default:
      return message;
  }
}

/** Секунды ожидания из `FLOOD_WAIT_300` / `Too Many Requests: retry after 300`; `null`, если не указаны. */
export function parseFloodWaitSeconds(key: string): number | null {
  const match = /FLOOD_WAIT_(\d+)/i.exec(key) ?? /RETRY AFTER (\d+)/i.exec(key);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/** «45 с», «5 мин», «2 ч 10 мин». */
export function formatWaitDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.max(1, Math.round(totalSeconds))} с`;
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/**
 * Что показать, если вход не может начаться из-за состояния TDLib (а не ошибки ввода).
 * Раньше для всех таких случаев было «Закройте экран и откройте снова» — это не помогало.
 */
export function describeUnexpectedAuthState(state: string | null | undefined): string {
  switch (state) {
    case 'authorizationStateLoggingOut':
    case 'authorizationStateClosing':
    case 'authorizationStateClosed':
      return 'Telegram ещё завершает выход из аккаунта. Если нет связи с серверами Telegram (например, они заблокированы провайдером), включите VPN и повторите.';
    case 'authorizationStateWaitRegistration':
      return 'Этот номер не зарегистрирован в Telegram. Сначала зарегистрируйтесь в официальном приложении Telegram.';
    case 'authorizationStateWaitEmailAddress':
    case 'authorizationStateWaitEmailCode':
      return 'Telegram запросил подтверждение входа по e-mail — в Chatus это пока не поддерживается. Войдите по QR-коду или отключите проверку по e-mail в настройках Telegram.';
    default:
      return `Не удалось начать вход (состояние: ${state ?? '?'}). Закройте приложение полностью и откройте снова.`;
  }
}

export type WaitPasswordAuthInfo = {
  passwordHint: string | null;
  hasRecoveryEmail: boolean;
};

export async function readWaitPasswordAuthInfo(
  getAuthState: () => Promise<unknown>,
): Promise<WaitPasswordAuthInfo | null> {
  const auth = (await getAuthState()) as {
    '@type'?: string;
    password_hint?: string;
    has_recovery_email_address?: boolean;
  };
  if (auth['@type'] !== 'authorizationStateWaitPassword') {
    return null;
  }
  const hint = auth.password_hint?.trim();
  return {
    passwordHint: hint ? hint : null,
    hasRecoveryEmail: !!auth.has_recovery_email_address,
  };
}
