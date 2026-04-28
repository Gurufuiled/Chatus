import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

export function createChatProfileScreenStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.chatBackground,
    },
    scrollContent: {
      paddingBottom: 28,
    },
    infoCard: {
      marginTop: 10,
      marginHorizontal: 14,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 24,
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    infoRow: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    infoRowTextWrap: {
      flex: 1,
      paddingRight: 12,
    },
    infoLabel: {
      fontSize: 13,
      color: c.textSecondary,
      marginBottom: 4,
    },
    infoValue: {
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '600',
      color: c.textPrimary,
    },
    infoIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.accent, 0.1),
    },
    infoDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
    },
    editScreen: {
      flex: 1,
      backgroundColor: c.chatBackground,
    },
    editTopBar: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    editNavPill: {
      minWidth: 76,
      height: 44,
      paddingHorizontal: 15,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.92),
    },
    editNavPillPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.98 }],
    },
    editNavText: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '600',
      color: c.textPrimary,
    },
    editDoneText: {
      fontWeight: '700',
    },
    editAvatarWrap: {
      alignItems: 'center',
      marginTop: -10,
      marginBottom: 28,
    },
    editAvatarFrame: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: withAlpha(c.accent, 0.14),
    },
    editAvatarImage: {
      width: '100%',
      height: '100%',
    },
    editAvatarInitial: {
      fontSize: 38,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    editFieldsCard: {
      marginHorizontal: 28,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: c.inputBackgroundSolid,
    },
    editInput: {
      minHeight: 58,
      paddingHorizontal: 18,
      paddingVertical: 0,
      fontSize: 18,
      color: c.textPrimary,
    },
    editInputDivider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 18,
      backgroundColor: c.separator,
    },
  });
}

export type ChatProfileScreenStyleSet = ReturnType<typeof createChatProfileScreenStyles>;
