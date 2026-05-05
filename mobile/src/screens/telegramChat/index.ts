/** Telegram TDLib chat screen — split modules live in this folder (see `TelegramChatScreen.tsx`). */

export type { TelegramMessageMenuState, TelegramMessageRow } from './types';
export {
  applyReadOutboxStatus,
  getTelegramReplyPreviewText,
  getTelegramReplyThumbnailUri,
  isSameGroup,
  isSameTelegramChain,
  markMessageFailed,
  optimisticOutgoingMessage,
  telegramRowToInputReplyMessage,
  upsertMessage,
} from './messageRow';
export {
  createTelegramChatStyles,
  createTelegramStackHeaderPresentationStyles,
  type TelegramChatStyles,
} from './telegramChatStyles';
