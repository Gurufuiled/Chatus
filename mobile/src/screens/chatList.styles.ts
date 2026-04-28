import { StyleSheet } from 'react-native';

import { CHAT_LIST_SEPARATOR_INSET } from '../presentation';
import type { ThemeColors } from '../theme/palettes';

export function createChatListStyles(themeColors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: themeColors.chatBackground },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginTop: 12,
      marginBottom: 6,
      paddingHorizontal: 12,
      backgroundColor: themeColors.inputBackground,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: themeColors.separator,
    },
    searchIconSlot: {
      marginRight: 4,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 16,
      color: themeColors.textPrimary,
    },
    searchLoader: {
      marginLeft: 8,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: CHAT_LIST_SEPARATOR_INSET,
      backgroundColor: themeColors.separator,
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: themeColors.textSecondary,
      backgroundColor: themeColors.chatBackground,
    },
    contactRow: {
      minHeight: 72,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.inputBackgroundSolid,
    },
    rowPressed: {
      backgroundColor: themeColors.rowPressed,
    },
    contactAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    contactAvatarPlaceholder: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: themeColors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactAvatarText: {
      fontSize: 20,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    contactInfo: {
      flex: 1,
      marginLeft: 12,
    },
    contactTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: themeColors.textPrimary,
    },
    contactSubtitle: {
      marginTop: 3,
      fontSize: 14,
      color: themeColors.textSecondary,
    },
    rowLoader: {
      marginLeft: 8,
    },
    empty: { padding: 24, alignItems: 'center' },
    emptyText: { fontSize: 16, color: themeColors.textSecondary },
  });
}

export type ChatListStyleSet = ReturnType<typeof createChatListStyles>;
