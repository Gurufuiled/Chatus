export const CHATUS_FATHER_USER_ID = '00000000-0000-0000-0000-00000000cfaf';
export const CHATUS_FATHER_HANDLE = 'ChatusFather';
export const CHATUS_FATHER_DISPLAY_NAME = 'Chatus Father';

/** TTL for the signed init payload (before exchange). */
export const INIT_PAYLOAD_TTL_SECONDS = 60 * 5; // 5 min

/** TTL for the short-lived session token returned after init_data exchange. */
export const SESSION_TOKEN_TTL_SECONDS = 60 * 15; // 15 min

export const DEVELOPER_AGREEMENT_VERSION = '1.0';

export const DEVELOPER_AGREEMENT_TEXT = [
  'Краткая оферта разработчика мини-приложений Chatus v1.0:',
  '1) Ваш контент не нарушает законы, не содержит вредоносного кода, фишинга, обмана и скама.',
  '2) Вы отвечаете за обработку персональных данных пользователей в своём сервисе.',
  '3) Chatus может удалить или скрыть приложение при нарушении правил.',
  '4) В v1 модерация автоматическая; серьёзные нарушения могут привести к блокировке разработчика.',
].join('\n');
