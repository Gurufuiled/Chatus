import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../../theme/palettes';
import { withAlpha } from '../../theme/stylePrimitives';

export function createSettingsIconRowStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      minHeight: 52,
      backgroundColor: c.inputBackgroundSolid,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowPressed: {
      backgroundColor: c.inputBackground,
    },
    iconBubble: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: withAlpha(c.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    textBlock: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textPrimary,
    },
    titleDestructive: {
      color: '#E53935',
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: c.textSecondary,
    },
    badge: {
      marginRight: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: c.inputBackground,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textSecondary,
    },
    chevron: {
      fontSize: 22,
      color: c.textSecondary,
      marginLeft: 4,
      fontWeight: '300',
    },
  });
}
