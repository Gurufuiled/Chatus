import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/palettes';
import { bubbleRadius, withAlpha } from '../../theme/stylePrimitives';
import { CHAT_HEADER_AVATAR_SIZE, chatHeaderPresentation } from '../../presentation';
import { TELEGRAM_CHAT_BUBBLE_MAX_WIDTH_PCT } from '../../presentation/chatBubbleMetrics';
import {
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
      alignSelf: 'center',
      maxWidth: 248,
      minHeight: 46,
      paddingLeft: 6,
      paddingRight: 12,
      paddingVertical: 5,
      borderRadius: 23,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.separator, 0.62),
      backgroundColor: withAlpha(colors.inputBackgroundSolid, 0.46),
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOpacity: 0.1,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 3 },
    },
    pillBlurLayer: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 23,
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
      minWidth: 0,
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
      overflow: 'visible',
    },
    /** Абсолютный док композера у нижнего края — совместно с `useAnimatedKeyboard` как в `ChatScreen`. */
    composerDockAbsolute: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 220,
      justifyContent: 'flex-end',
      zIndex: 30,
      overflow: 'visible',
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
      maxWidth: TELEGRAM_CHAT_BUBBLE_MAX_WIDTH_PCT,
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
      maxWidth: TELEGRAM_CHAT_BUBBLE_MAX_WIDTH_PCT,
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
      maxWidth: TELEGRAM_CHAT_BUBBLE_MAX_WIDTH_PCT,
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
    forwardHeaderContainer: {
      paddingVertical: 1,
      paddingHorizontal: 2,
      marginBottom: 5,
    },
    forwardPrefixText: {
      fontSize: 11,
      lineHeight: 13,
      opacity: 0.76,
      fontWeight: '500',
    },
    forwardAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      gap: 5,
    },
    forwardAvatar: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    forwardAvatarFallback: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    forwardAvatarInitial: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '800',
    },
    forwardAuthorText: {
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 16,
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
      maxWidth: TELEGRAM_CHAT_BUBBLE_MAX_WIDTH_PCT,
      minWidth: 0,
    },
    groupMessageSurface: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
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
    albumBubble: {
      maxWidth: '100%',
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: 'transparent',
    },
    albumBubbleMe: {
      alignSelf: 'flex-end',
    },
    albumBubbleOther: {
      alignSelf: 'flex-start',
    },
    /** Канал: одна карточка — сетка, подпись и комментарии без разрыва. */
    albumChannelPost: {
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.bubbleOtherBorder,
    },
    albumChannelGridClip: {
      borderRadius: 0,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      overflow: 'hidden',
      backgroundColor: '#D8DEE7',
    },
    albumChannelGridClipSolo: {
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: '#D8DEE7',
    },
    albumCaptionChannel: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 4,
    },
    albumGridClip: {
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: '#D8DEE7',
    },
    albumRow: {
      flexDirection: 'row',
      gap: 1.5,
    },
    albumColumn: {
      gap: 1.5,
    },
    albumGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 1.5,
    },
    albumTile: {
      overflow: 'hidden',
      backgroundColor: '#C8D0DC',
    },
    albumImage: {
      width: '100%',
      height: '100%',
    },
    albumTilePlaceholder: {
      flex: 1,
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#C8D0DC',
    },
    albumTileLoading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.35)',
      zIndex: 2,
    },
    albumVideoBadge: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: 'rgba(15,23,42,0.68)',
    },
    albumVideoDuration: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    albumTimeOverlay: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: 'rgba(15,23,42,0.62)',
    },
    albumExtraOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15,23,42,0.42)',
    },
    albumExtraText: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    albumCaptionWrap: {
      paddingHorizontal: 10,
      paddingTop: 7,
      paddingBottom: 6,
    },
    albumCaptionMe: {
      backgroundColor: colors.bubbleMe,
    },
    albumCaptionOther: {
      backgroundColor: colors.bubbleOther,
    },
    albumCaptionText: {
      fontSize: 15,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    messageContentHighlighted: {
      borderRadius: 22,
      shadowColor: '#F59E0B',
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    searchMatchOverlay: {
      ...StyleSheet.absoluteFillObject,
      pointerEvents: 'box-none',
      zIndex: 24,
    },
    searchMatchNavColumn: {
      position: 'absolute',
      right: 10,
      top: '30%',
      gap: 10,
      alignItems: 'center',
    },
    searchMatchNavButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(18, 22, 28, 0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.14)',
    },
    searchMatchNavButtonPressed: {
      opacity: 0.78,
    },
    searchMatchCounterPill: {
      position: 'absolute',
      left: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(18, 22, 28, 0.52)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    searchMatchCounterText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
}

export type TelegramChatStyles = ReturnType<typeof createTelegramChatStyles>;
