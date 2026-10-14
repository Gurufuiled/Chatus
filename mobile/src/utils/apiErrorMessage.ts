/**
 * Понятные сообщения о сетевых ошибках для экранов. Чистая логика: покрыта тестами в `apiErrorMessage.test.ts`.
 *
 * Раньше при таймауте показывалось «Проверьте, что телефон и ПК в одной сети, API: …» — подсказка для разработки,
 * бесполезная в релизе. Реальная причина обычно другая: провайдер или роутер режет соединение с адресом сервера
 * (так было с Wi-Fi Keenetic: TCP открывается, а TLS до домена не доходит) — помогает VPN или мобильная сеть.
 */

export const SERVER_UNREACHABLE_PREFIX = 'Сервер не отвечает';

const NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /timeout/i,
  /timed out/i,
  /aborted/i,
  /ENOTFOUND|ECONNREFUSED|ECONNRESET|EHOSTUNREACH/i,
];

export function isNetworkErrorMessage(message: string): boolean {
  return message.startsWith(SERVER_UNREACHABLE_PREFIX) || NETWORK_ERROR_PATTERNS.some((re) => re.test(message));
}

/** Текст ошибки для пользователя: сетевые — по-человечески, остальные — как есть. */
export function friendlyApiError(error: unknown, fallback = 'Не удалось выполнить запрос'): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message.trim()) return fallback;
  if (isNetworkErrorMessage(message)) {
    return (
      'Нет связи с сервером Chatus. Проверьте интернет. Если он работает, возможно, сеть (провайдер или Wi‑Fi-роутер) ' +
      'блокирует адрес сервера — включите VPN или переключитесь на мобильный интернет.'
    );
  }
  return message;
}

/** Сообщение таймаута запроса: адрес показываем только при разработке. */
export function serverTimeoutMessage(apiBaseUrl: string, isDev: boolean): string {
  return isDev
    ? `${SERVER_UNREACHABLE_PREFIX}. Проверьте, что телефон и ПК в одной сети, API: ${apiBaseUrl}`
    : `${SERVER_UNREACHABLE_PREFIX}. Проверьте интернет-соединение.`;
}
