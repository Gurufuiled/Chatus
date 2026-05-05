import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/palettes';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../../presentation';
import {
  CHAT_BUBBLE_MAX_WIDTH_PCT,
  CHAT_MSG_HORIZONTAL_PADDING,
  CHAT_MSG_ROW_MARGIN_ISOLATED,
  CHAT_MSG_VERTICAL_PADDING,
} from '../../presentation/telegramChatUi';

export function createTelegramStackHeaderPresentationStyles(colors: ThemeColors) {
  const subtitleKey = chatHeaderPresentation.subtitleColorKey;
  return StyleSheet.create({
    pressableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    pressablePressed: {
      opacity: 0.7,
    },
    avatar: {
      width: CHAT_HEADER_AVATAR_SIZE,
      height: CHAT_HEADER_AVATAR_SIZE,
      borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
      marginRight: 10,
    },
    avatarPlaceholder: {
      width: CHAT_HEADER_AVATAR_SIZE,
      height: CHAT_HEADER_AVATAR_SIZE,
      borderRadius: CHAT_HEADER_AVATAR_SIZE / 2,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    avatarPlaceholderLetter: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    titleWrap: {
      flexShrink: 1,
      justifyContent: 'center',
    },
    headerTitleText: {
      fontSize: chatHeaderPresentation.titleFontSize,
      fontWeight: chatHeaderPresentation.titleFontWeight,
      color: colors.textPrimary,
    },
    headerSubtitleText: {
      marginTop: 1,
      fontSize: chatHeaderPresentation.subtitleFontSize,
      color: colors[subtitleKey],
    },
  });
}

export function createTelegramChatStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flexChatBody: {
      flex: 1,
      backgroundColor: colors.chatBackground,
    },
    wallpaperLayer: StyleSheet.absoluteFillObject,
    messagesList: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    bottomChrome: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      backgroundColor: colors.composerSurface,
    },
    listContent: {
      paddingHorizontal: CHAT_MSG_HORIZONTAL_PADDING,
      paddingTop: CHAT_MSG_VERTICAL_PADDING,
      paddingBottom: CHAT_MSG_VERTICAL_PADDING,
    },
    messageRow: {
      marginVertical: CHAT_MSG_ROW_MARGIN_ISOLATED,
      flexDirection: 'row',
    },
    messageRowMe: {
      justifyContent: 'flex-end',
    },
    messageRowOther: {
      justifyContent: 'flex-start',
    },
    bubble: {
      maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    bubbleMe: {
      backgroundColor: colors.bubbleMe,
      borderBottomRightRadius: 6,
    },
    bubbleMeChained: {
      backgroundColor: colors.bubbleMe,
    },
    bubbleOther: {
      backgroundColor: colors.bubbleOther,
      borderBottomLeftRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.bubbleOtherBorder,
    },
    bubbleOtherChained: {
      backgroundColor: colors.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.bubbleOtherBorder,
    },
    messageText: {
      color: colors.textPrimary,
      fontSize: 16,
      lineHeight: 21,
      flexShrink: 1,
    },
    messageTextMe: {
      color: '#FFFFFF',
    },
    bubbleContentRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      columnGap: 6,
    },
    fileBubbleWrap: {
      maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
      minWidth: 220,
    },
    empty: {
      padding: 24,
      alignItems: 'center',
    },
    emptyText: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    loadingOlder: {
      paddingVertical: 4,
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 12,
    },
    senderNameText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 2,
    },
    viewCountText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    viewCountTextMe: {
      color: colors.textSecondaryMuted,
    },
    readOnlyFooter: {
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.toolbar,
    },
    readOnlyText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
  });
}

export type TelegramChatStyles = ReturnType<typeof createTelegramChatStyles>;
