import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

const HERO_COLLAPSED_SIZE = 108;

export function createChatProfileHeroStyles(c: ThemeColors) {
  return StyleSheet.create({
    heroCard: {
      alignItems: 'center',
      paddingTop: 24,
      paddingBottom: 18,
      backgroundColor: c.chatBackground,
      overflow: 'hidden',
    },
    topBar: {
      width: '100%',
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      marginBottom: 2,
    },
    navBubble: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.88),
    },
    editBubble: {
      minWidth: 68,
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.92),
    },
    editBubbleText: {
      fontSize: 17,
      lineHeight: 20,
      fontWeight: '700',
      color: c.textPrimary,
    },
    bubblePressed: {
      opacity: 0.72,
      transform: [{ scale: 0.98 }],
    },
    avatarPressable: {
      width: '100%',
      alignItems: 'center',
    },
    avatarPressablePressed: {
      opacity: 0.96,
    },
    avatarFrame: {
      width: HERO_COLLAPSED_SIZE,
      height: HERO_COLLAPSED_SIZE,
      borderRadius: 54,
      marginBottom: 14,
      overflow: 'hidden',
      backgroundColor: withAlpha(c.accent, 0.12),
      borderWidth: 3,
      borderColor: withAlpha(c.inputBackgroundSolid, 0.5),
    },
    avatarMedia: {
      width: '100%',
      height: '100%',
    },
    avatarFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarFallbackText: {
      fontSize: 40,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    heroContent: {
      width: '100%',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    name: {
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    status: {
      marginTop: 4,
      fontSize: 16,
      color: c.textSecondary,
      textAlign: 'center',
    },
    handle: {
      marginTop: 6,
      fontSize: 15,
      fontWeight: '600',
      color: c.accent,
      textAlign: 'center',
    },
    quickActionsRow: {
      marginTop: 20,
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    quickAction: {
      flex: 1,
      height: 74,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      shadowColor: '#89A8D8',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    quickActionPressed: {
      opacity: 0.86,
    },
    quickActionActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    quickActionIconSlot: {
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionLabel: {
      marginTop: 7,
      fontSize: 12.5,
      fontWeight: '600',
      color: c.accent,
      textAlign: 'center',
    },
    quickActionLabelActive: {
      color: '#FFFFFF',
    },
    quickActionWave: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 20,
      backgroundColor: withAlpha(c.accent, 0.18),
    },
    loaderRow: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loaderText: {
      fontSize: 14,
      color: c.textSecondary,
    },
    errorText: {
      marginTop: 16,
      fontSize: 14,
      textAlign: 'center',
      color: '#E05263',
    },
  });
}

export type ChatProfileHeroStyleSet = ReturnType<typeof createChatProfileHeroStyles>;
