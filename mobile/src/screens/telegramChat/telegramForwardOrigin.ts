export type TelegramForwardOriginKind =
  | 'user'
  | 'chat'
  | 'channel'
  | 'import'
  | 'hidden_user'
  | 'unknown';

/**
 * TDLib renamed messageForwardOrigin* to messageOrigin*. Accept both families
 * so cached/older native binaries and TDLib 1.8.66 render the same header.
 */
export function classifyTelegramForwardOriginType(
  value: unknown,
): TelegramForwardOriginKind {
  switch (value) {
    case 'messageOriginUser':
    case 'messageForwardOriginUser':
      return 'user';
    case 'messageOriginChat':
    case 'messageForwardOriginChat':
      return 'chat';
    case 'messageOriginChannel':
    case 'messageForwardOriginChannel':
      return 'channel';
    case 'messageOriginMessageImport':
    case 'messageForwardOriginMessageImport':
      return 'import';
    case 'messageOriginHiddenUser':
    case 'messageForwardOriginHiddenUser':
      return 'hidden_user';
    default:
      return 'unknown';
  }
}
