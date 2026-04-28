import { StyleSheet } from 'react-native';

import { REPLIED_VOICE_BUBBLE_WIDTH } from './chatScreen.shared';
import type { ThemeColors } from '../theme/palettes';
import { bubbleRadius, withAlpha } from '../theme/stylePrimitives';

export function buildChatScreenStyles(themeColors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#E8F4D6' },
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
      backgroundColor: themeColors.bubbleMe,
    },
    albumCaptionOther: {
      backgroundColor: themeColors.bubbleOther,
    },
    albumCaptionText: {
      fontSize: 15,
      lineHeight: 20,
      color: themeColors.textPrimary,
    },
    chatContentLayer: {
      flex: 1,
    },
    messagesSkeletonOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    inputBarWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    selectionDockWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 14,
      paddingTop: 8,
    },
    selectionDockRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: 4,
    },
    selectionDockAction: {
      alignItems: 'center',
      minWidth: 90,
      paddingBottom: 2,
    },
    selectionDockActionLeft: {
      alignSelf: 'flex-start',
      marginLeft: 2,
    },
    selectionDockActionRight: {
      alignSelf: 'flex-start',
      marginRight: 2,
    },
    selectionDockActionPressed: {
      opacity: 0.74,
    },
    selectionDockActionDisabled: {
      opacity: 0.45,
    },
    selectionDockIconCircle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#0F172A',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 9,
      borderWidth: 1,
      borderColor: 'rgba(248,251,255,0.95)',
      backgroundColor: 'rgba(255,255,255,0.84)',
    },
    selectionDockDeleteCircle: {
      borderColor: 'rgba(248,207,212,0.98)',
    },
    selectionDockForwardCircle: {
      borderColor: 'rgba(198,222,255,0.98)',
    },
    selectionDockIconCircleDisabled: {
      backgroundColor: 'rgba(231,236,243,0.96)',
      shadowOpacity: 0,
      elevation: 0,
      borderColor: 'rgba(214,221,230,0.92)',
    },
    selectionDockActionLabel: {
      marginTop: 9,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '600',
      color: '#163047',
    },
    selectionDockActionLabelDisabled: {
      color: '#94A3B8',
    },
    messagePressable: {
      width: '100%',
    },
    replyGestureContainer: {
      width: '100%',
      justifyContent: 'center',
    },
    replyGestureContent: {
      width: '100%',
    },
    messageWrap: {
      paddingHorizontal: 12,
      marginVertical: 4,
      width: '100%',
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
    messageContentHighlighted: {
      borderRadius: 22,
      shadowColor: '#F59E0B',
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    bubble: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 16,
      maxWidth: '82%',
    },
    bubbleMe: { backgroundColor: themeColors.bubbleMe },
    bubbleOther: {
      backgroundColor: themeColors.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: themeColors.bubbleOtherBorder,
    },
    bubbleContentRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
    },
    textContent: {
      fontSize: 16,
      lineHeight: 20,
      color: '#000',
      flexShrink: 1,
    },
    textContentMe: { color: '#fff' },
    selectedBubble: {
      borderWidth: 2,
      borderColor: '#F28C28',
      borderRadius: 18,
    },
    mediaStack: {
      maxWidth: '82%',
    },
    repliedMediaBubble: {
      maxWidth: '82%',
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 4,
      overflow: 'hidden',
    },
    repliedVoiceBubble: {
      width: REPLIED_VOICE_BUBBLE_WIDTH,
      maxWidth: '82%',
    },
    repliedMediaBubbleMe: {
      backgroundColor: themeColors.bubbleMe,
      ...bubbleRadius.mine,
    },
    repliedMediaBubbleOther: {
      backgroundColor: themeColors.bubbleOther,
      ...bubbleRadius.other,
    },
    deletedBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 16,
      maxWidth: '82%',
    },
    deletedBubbleMe: {
      backgroundColor: '#D8E8F9',
    },
    deletedBubbleOther: {
      backgroundColor: '#ECEDEF',
    },
    deletedText: {
      fontSize: 14,
      lineHeight: 18,
      color: '#4B5563',
      fontStyle: 'italic',
      flexShrink: 1,
    },
    deletedTextMe: {
      color: '#426789',
    },
    replySwipeAction: {
      position: 'absolute',
      right: 16,
      width: 44,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
    },
    replySwipeIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(themeColors.accent, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export type ChatScreenStyleSet = ReturnType<typeof buildChatScreenStyles>;
