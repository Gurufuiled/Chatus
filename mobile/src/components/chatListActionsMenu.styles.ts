import { StyleSheet } from 'react-native';

import { CHAT_LIST_MENU_WIDTH } from '../presentation';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

export function createChatListActionsMenuStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.12)',
    },
    menuCard: {
      position: 'absolute',
      width: CHAT_LIST_MENU_WIDTH,
      borderRadius: 12,
      backgroundColor: c.inputBackgroundSolid,
      paddingVertical: 8,
      shadowColor: '#0F172A',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    actionRow: {
      minHeight: 52,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionRowPressed: {
      backgroundColor: c.rowPressed,
    },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBackground,
      marginRight: 12,
    },
    iconWrapDanger: {
      backgroundColor: withAlpha('#E53935', 0.14),
    },
    actionLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
    },
    actionLabelDanger: {
      color: '#E53935',
    },
  });
}

export type ChatListActionsMenuStyleSet = ReturnType<
  typeof createChatListActionsMenuStyles
>;
