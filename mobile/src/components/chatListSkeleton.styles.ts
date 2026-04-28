import { StyleSheet } from 'react-native';

import {
  CHAT_LIST_AVATAR_GAP,
  CHAT_LIST_AVATAR_SIZE,
  CHAT_LIST_HORIZONTAL_PADDING,
  CHAT_LIST_SEPARATOR_INSET,
} from '../presentation';
import type { ThemeColors } from '../theme/palettes';

export function createChatListSkeletonStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.inputBackgroundSolid,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 76,
      paddingHorizontal: CHAT_LIST_HORIZONTAL_PADDING,
      paddingVertical: 10,
      backgroundColor: c.inputBackgroundSolid,
    },
    content: {
      flex: 1,
      marginLeft: CHAT_LIST_AVATAR_GAP,
      justifyContent: 'center',
      gap: 10,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: CHAT_LIST_SEPARATOR_INSET,
      backgroundColor: c.separator,
    },
  });
}
