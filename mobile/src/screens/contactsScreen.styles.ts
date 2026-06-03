import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../theme/palettes';

export function createContactsScreenStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.chatBackground },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 12,
      backgroundColor: c.inputBackground,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    searchIconSlot: {
      marginRight: 4,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 16,
      color: c.textPrimary,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
      backgroundColor: c.inputBackgroundSolid,
    },
    rowPressed: { backgroundColor: c.rowPressed },
    rowLoader: { marginLeft: 8 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    avatarPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.placeholderBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarPlaceholderText: {
      fontSize: 20,
      fontWeight: '600',
      color: '#fff',
    },
    info: {
      marginLeft: 12,
      flex: 1,
    },
    displayName: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textPrimary,
    },
    handle: {
      fontSize: 14,
      color: c.textSecondary,
      marginTop: 2,
    },
    presenceSubtitle: {
      fontSize: 13,
      color: c.textSecondary,
      marginTop: 2,
    },
    empty: {
      padding: 24,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 16,
      color: c.placeholder,
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 8,
      backgroundColor: c.chatBackground,
    },
    sectionHeaderText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    permissionBanner: {
      marginHorizontal: 12,
      marginTop: 12,
      marginBottom: 4,
      padding: 16,
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    permissionBannerText: {
      flex: 1,
      fontSize: 14,
      color: c.textPrimary,
      marginRight: 12,
    },
    permissionBannerButton: {
      fontSize: 14,
      fontWeight: '700',
      color: c.accent,
    },
  });
}
