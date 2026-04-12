/**
 * Presentation constants for Telegram Android–oriented chat UI.
 * Keeps layout and typography targets out of screen components for easier future transplants.
 */

import { Dimensions } from 'react-native';

import { colors } from '../theme/colors';

/** Dialog row: horizontal screen padding (matches Material-ish list). */
export const CHAT_LIST_HORIZONTAL_PADDING = 16;

/** Dialog cell avatar diameter (Telegram Android ~56dp). */
export const CHAT_LIST_AVATAR_SIZE = 56;

/** Gap between avatar and title column. */
export const CHAT_LIST_AVATAR_GAP = 12;

/** Left inset for hairline separator under a row (padding + avatar + gap). */
export const CHAT_LIST_SEPARATOR_INSET =
  CHAT_LIST_HORIZONTAL_PADDING + CHAT_LIST_AVATAR_SIZE + CHAT_LIST_AVATAR_GAP;

/** Long-press overflow menu width (anchored modal, not Android PopupWindow). */
export const CHAT_LIST_MENU_WIDTH = 236;

/** Chat stack header: avatar in headerRight (Telegram ~34dp). */
export const CHAT_HEADER_AVATAR_SIZE = 34;

/** Two-line action bar title region. */
export const chatHeaderPresentation = {
  avatarSize: CHAT_HEADER_AVATAR_SIZE,
  titleFontSize: 17,
  titleFontWeight: '700' as const,
  subtitleFontSize: 13,
  /** Resolved in `ChatsStack` via `colors[subtitleColorKey]` for chat header subtitle. */
  subtitleColorKey: 'textSecondary' as keyof typeof colors,
  titleMaxWidth: 200,
};

export type ChatListMenuAnchor = { left: number; top: number };

/**
 * Positions the dialog row context menu near the touch point (adapter for PopupWindow).
 */
export function computeChatListMenuPosition(
  pageX: number,
  pageY: number,
  screenWidth: number = Dimensions.get('window').width,
): ChatListMenuAnchor {
  const sideGap = 12;
  /** Keeps the menu below the native stack header + status bar on typical phones (~56dp bar + ~24–44dp inset). Not device-aware; revisit with `useSafeAreaInsets` if clipping appears on notches. */
  const topGap = 84;
  const left = Math.max(
    sideGap,
    Math.min(pageX - CHAT_LIST_MENU_WIDTH / 2, screenWidth - CHAT_LIST_MENU_WIDTH - sideGap),
  );
  const top = Math.max(topGap, pageY - 20);
  return { left, top };
}

/** Composer dock: outer shell (ChatActivityEnterView–like grouping in RN). */
export const composerPresentation = {
  shellBorderRadius: 27,
  shellMinHeight: 54,
};
