/**
 * Типы TDLib-апдейтов, которые обрабатывает JS.
 * Дубликат списка: `mobile/tdlib-android/.../TdlibModule.kt` → `shouldEmitUpdateToJs`.
 * При добавлении типа — обновить оба места.
 */
export const TDLIB_JS_UPDATE_TYPES = new Set([
  'updateAuthorizationState',
  'updateNewMessage',
  'updateMessageSendSucceeded',
  'updateMessageSendFailed',
  'updateFile',
  'updateChatPinnedMessage',
  'updateDeleteMessages',
  'updateChatReadOutbox',
  'updateNewChat',
  'updateChatLastMessage',
  'updateChatPosition',
  'updateChatReadInbox',
  'updateChatTitle',
]);

export function shouldEmitTdlibUpdateToJs(updateType: string): boolean {
  return TDLIB_JS_UPDATE_TYPES.has(updateType);
}
