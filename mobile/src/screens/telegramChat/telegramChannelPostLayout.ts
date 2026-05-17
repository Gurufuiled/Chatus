import {
  CHAT_MESSAGE_WRAP_HORIZONTAL_PADDING,
  CHAT_MSG_HORIZONTAL_PADDING,
  TELEGRAM_CHANNEL_POST_CARD_WIDTH_RATIO,
  TELEGRAM_CHAT_SELECTION_CHECKBOX_HIT_WIDTH,
} from '../../presentation/telegramChatFeedMetrics';

/**
 * Max width for Image/Video `mediaClamp` in Telegram channel feed — aligned with
 * `TELEGRAM_CHANNEL_POST_CARD_MAX_WIDTH_PCT` / `TELEGRAM_CHANNEL_POST_CARD_WIDTH_RATIO`.
 */
export function computeTelegramChannelPostMediaMaxWidth(input: {
  screenWidth: number;
  telegramSelectionMode: boolean;
}): number {
  const selectionW = input.telegramSelectionMode ? TELEGRAM_CHAT_SELECTION_CHECKBOX_HIT_WIDTH : 0;
  const listInner = input.screenWidth - 2 * CHAT_MSG_HORIZONTAL_PADDING;
  const cardW = Math.floor(listInner * TELEGRAM_CHANNEL_POST_CARD_WIDTH_RATIO) - selectionW;
  return Math.max(180, cardW - 2 * CHAT_MESSAGE_WRAP_HORIZONTAL_PADDING);
}
