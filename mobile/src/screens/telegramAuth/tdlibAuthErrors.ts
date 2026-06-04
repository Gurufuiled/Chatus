/** Человекочитаемые сообщения для ошибок TDLib на шагах входа. */
export function formatTdlibAuthError(message: string): string {
  const key = message.trim().toUpperCase();
  switch (key) {
    case 'PASSWORD_HASH_INVALID':
      return (
        'Неверный облачный пароль.\n\n' +
        'Нужен пароль из официального Telegram: Настройки → Конфиденциальность → ' +
        'двухэтапная проверка → «Облачный пароль». Это не PIN SIM, не код из SMS и не пароль блокировки Chatus.\n\n' +
        'Проверьте раскладку клавиатуры и пробелы в начале или в конце пароля.'
      );
    case 'PASSWORD_REQUIRED':
      return 'Для этого аккаунта включена двухэтапная проверка — введите облачный пароль Telegram.';
    default:
      return message;
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
