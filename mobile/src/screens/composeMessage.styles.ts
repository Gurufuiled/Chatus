import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../theme/palettes';

export function createComposeMessageStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.header,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBackgroundSolid,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: 40,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.inputBackgroundSolid,
    },
    searchIconSlot: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    quickAction: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 14,
    },
    quickIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
      fontSize: 14,
      fontWeight: '700',
      color: colors.accent,
      backgroundColor: colors.header,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      gap: 12,
    },
    rowPressed: {
      opacity: 0.75,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    avatarPh: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPhText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textSecondaryMuted,
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    rowSubtitle: {
      marginTop: 2,
      fontSize: 14,
      color: colors.textSecondary,
    },
    indexCol: {
      position: 'absolute',
      right: 4,
      top: 220,
      bottom: 24,
      justifyContent: 'center',
      alignItems: 'center',
      width: 20,
    },
    indexLetter: {
      fontSize: 11,
      fontWeight: '700',
      paddingVertical: 1,
      color: colors.accent,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 76,
      backgroundColor: colors.separator,
    },
  });
}
