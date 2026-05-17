/**
 * Telegram message-feed layout numbers — **no** `react-native` import (safe for `tsx` unit tests).
 * Re-exported from `telegramChatUi.ts` for a single public entry point.
 */

// ─── Message feed layout ─────────────────────────────────────────────────────
// Mirrors `ChatMessageList` / `chatScreen.styles`: list has no horizontal inset;
// each row uses `messageWrap` with horizontal padding (see `telegramChatStyles`).

/** Horizontal padding on the FlatList content — 0 so insets match Chatus (`messageWrap`). */
export const CHAT_MSG_HORIZONTAL_PADDING = 0;

/** Inset from screen edge to bubble column (same as `messageWrap.paddingHorizontal` in Chatus). */
export const CHAT_MESSAGE_WRAP_HORIZONTAL_PADDING = 12;

/** Vertical padding at top and bottom of the message list. */
export const CHAT_MSG_VERTICAL_PADDING = 12;

/** Max bubble width — same cap as `chatScreen.styles` bubble / mediaStack. */
export const CHAT_BUBBLE_MAX_WIDTH_PCT = '82%';

/** Incoming канал-посты: как в `ChannelFeedScreen` (`postBubble`), не на всю ширину экрана. */
export const TELEGRAM_CHANNEL_POST_CARD_MAX_WIDTH_PCT = '90%';

/** Доля ширины списка под карточку поста (согласовано с `TELEGRAM_CHANNEL_POST_CARD_MAX_WIDTH_PCT`). */
export const TELEGRAM_CHANNEL_POST_CARD_WIDTH_RATIO = 0.9;

/** marginVertical for a standalone (isolated) message row or at group boundaries. */
export const CHAT_MSG_ROW_MARGIN_ISOLATED = 3;

/** marginVertical for a message row inside a same-author chain. */
export const CHAT_MSG_ROW_MARGIN_GROUPED = 1;

/** Selection-mode checkbox hit target width (`selectionCheckboxHit` in telegram chat styles). */
export const TELEGRAM_CHAT_SELECTION_CHECKBOX_HIT_WIDTH = 36;

/**
 * Maximum time gap (ms) between two consecutive messages from the same author
 * for them to be considered part of the same visual group chain.
 */
export const CHAT_MSG_GROUP_TIME_GAP_MS = 60_000;
