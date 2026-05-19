import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/palettes';
import { bubbleRadius, withAlpha } from '../../theme/stylePrimitives';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../../presentation';
import {
  CHAT_BUBBLE_MAX_WIDTH_PCT,
  CHAT_MESSAGE_WRAP_HORIZONTAL_PADDING,
  CHAT_MSG_HORIZONTAL_PADDING,
  CHAT_MSG_ROW_MARGIN_ISOLATED,
  CHAT_MSG_VERTICAL_PADDING,
  TELEGRAM_CHANNEL_POST_CARD_MAX_WIDTH_PCT,
  TELEGRAM_CHAT_SELECTION_CHECKBOX_HIT_WIDTH,
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
      backgroundColor: 'transparent',
    },
    /** Абсолютный док композера у нижнего края — совместно с `useAnimatedKeyboard` как в `ChatScreen`. */
    composerDockAbsolute: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
    },
    listContent: {
      paddingHorizontal: CHAT_MSG_HORIZONTAL_PADDING,
      paddingTop: CHAT_MSG_VERTICAL_PADDING,
      paddingBottom: CHAT_MSG_VERTICAL_PADDING,
    },
    /** Same shell as `ChatMessageList`: full-width row → card column → wrap with side padding. */
    messagePressable: {
      width: '100%',
    },
    messageRowShell: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    messageCardColumn: {
      flex: 1,
      minWidth: 0,
    },
    messageWrap: {
      width: '100%',
      paddingHorizontal: CHAT_MESSAGE_WRAP_HORIZONTAL_PADDING,
    },
    messageWrapMe: {
      alignItems: 'flex-end',
    },
    messageWrapOther: {
      alignItems: 'flex-start',
    },
    messageContentMeasure: {
      flexShrink: 1,
    },
    /** Медиа-баблы (фото/видео) — без padding `bubble`, как в Chatus `mediaStack`. */
    mediaStack: {
      maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
    },
    mediaStackChannel: {
      maxWidth: '100%',
      alignSelf: 'stretch',
    },
    mediaOutgoingChrome: {
      alignSelf: 'flex-end',
      overflow: 'hidden',
      ...bubbleRadius.mine,
    },
    bubble: {
      maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 7,
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
      lineHeight: 20,
      flexShrink: 1,
    },
    messageTextMe: {
      color: '#FFFFFF',
    },
    bubbleContentRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
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
    /** Incoming row in group/supergroup — avatar + bubble (aligned with Chatus group chat). */
    groupIncomingRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      maxWidth: '100%',
      minWidth: 0,
    },
    groupAvatarSlot: {
      width: 34,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 2,
      flexShrink: 0,
    },
    groupAvatarImage: {
      width: 30,
      height: 30,
      borderRadius: 15,
    },
    groupAvatarFallback: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupAvatarInitial: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    groupIncomingContent: {
      minWidth: 0,
      flexShrink: 1,
      flexGrow: 1,
    },
    /** Группа: бабл по содержимому, не на всю колонку (иначе ломается перенос текста). */
    groupIncomingBubbleMeasure: {
      alignSelf: 'flex-start',
      maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
      minWidth: 0,
    },
    groupMessageSurface: {
      alignSelf: 'flex-start',
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
    /** Режим выбора сообщений: строка на всю ширину + чекбокс слева */
    selectionOuterRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    selectionCheckboxHit: {
      width: TELEGRAM_CHAT_SELECTION_CHECKBOX_HIT_WIDTH,
      paddingBottom: 6,
      justifyContent: 'center',
      alignItems: 'center',
    },
    selectionCheckboxOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectionCheckboxOuterOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    selectionBubbleColumn: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-start',
    },
    selectionBubbleColumnMe: {
      alignItems: 'flex-end',
    },
    /** Нижняя панель в режиме выбора (переслать / удалить) */
    selectionBatchWrap: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 6,
      backgroundColor: colors.composerSurface,
    },
    selectionBatchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: 4,
    },
    selectionBatchAction: {
      alignItems: 'center',
      minWidth: 96,
      paddingBottom: 4,
    },
    selectionBatchActionPressed: {
      opacity: 0.72,
    },
    selectionBatchActionDisabled: {
      opacity: 0.42,
    },
    selectionBatchIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      backgroundColor: colors.inputBackgroundSolid,
    },
    selectionBatchIconCircleMuted: {
      backgroundColor: colors.toolbar,
    },
    selectionBatchIconCircleDanger: {
      borderColor: withAlpha('#DB4F55', 0.35),
      backgroundColor: withAlpha('#DB4F55', 0.08),
    },
    selectionBatchIconCircleAccent: {
      borderColor: withAlpha(colors.accent, 0.4),
      backgroundColor: withAlpha(colors.accent, 0.1),
    },
    selectionBatchLabel: {
      marginTop: 8,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    selectionBatchLabelDisabled: {
      color: colors.textSecondary,
    },
    /** Исходящие посты админа в канале — та же max ширина карточки, выравнивание вправо. */
    channelOutgoingPostWrap: {
      maxWidth: TELEGRAM_CHANNEL_POST_CARD_MAX_WIDTH_PCT,
      alignSelf: 'flex-end',
      flexShrink: 1,
      minWidth: 0,
    },
    /** Incoming канал-пост: карточка ~90% ширины списка (как Chatus `postBubble`). */
    channelIncomingWrap: {
      maxWidth: TELEGRAM_CHANNEL_POST_CARD_MAX_WIDTH_PCT,
      alignSelf: 'flex-start',
      flexShrink: 1,
      minWidth: 0,
    },
    /** Текст/оболочка поста в канале на всю ширину карточки (`channelIncomingWrap` / `channelOutgoingPostWrap`). */
    channelPostTextBubble: {
      alignSelf: 'stretch',
      maxWidth: '100%',
      width: '100%',
    },
  });
}

export type TelegramChatStyles = ReturnType<typeof createTelegramChatStyles>;
