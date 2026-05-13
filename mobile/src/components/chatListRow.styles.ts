import { StyleSheet } from 'react-native';

import {
  CHAT_LIST_AVATAR_GAP,
  CHAT_LIST_AVATAR_SIZE,
  CHAT_LIST_HORIZONTAL_PADDING,
} from '../presentation';
import type { ThemeColors } from '../theme/palettes';
import { typography } from '../theme/colors';

export function createChatListRowStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 76,
      paddingHorizontal: CHAT_LIST_HORIZONTAL_PADDING,
      paddingVertical: 10,
      backgroundColor: c.inputBackgroundSolid,
    },
    rowPressed: { backgroundColor: c.rowPressed },
    avatar: {
      width: CHAT_LIST_AVATAR_SIZE,
      height: CHAT_LIST_AVATAR_SIZE,
      borderRadius: CHAT_LIST_AVATAR_SIZE / 2,
    },
    avatarPlaceholder: {
      width: CHAT_LIST_AVATAR_SIZE,
      height: CHAT_LIST_AVATAR_SIZE,
      borderRadius: CHAT_LIST_AVATAR_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    channelAvatarPlaceholder: {
      backgroundColor: c.accent,
    },
    avatarPlaceholderText: {
      fontSize: 20,
      fontWeight: '700',
      color: '#fff',
    },
    content: {
      flex: 1,
      marginLeft: CHAT_LIST_AVATAR_GAP,
      justifyContent: 'center',
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    title: {
      fontSize: typography.dialogTitle,
      fontWeight: '600',
      color: c.textPrimary,
      flex: 1,
      paddingTop: 1,
      includeFontPadding: false,
    },
    metaWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      justifyContent: 'flex-end',
    },
    metaColumn: {
      marginLeft: 8,
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      minWidth: 42,
    },
    timeLabel: {
      fontSize: typography.dialogTime,
      color: c.textSecondary,
      includeFontPadding: false,
    },
    preview: {
      marginTop: 2,
      fontSize: typography.dialogPreview,
      color: c.textSecondary,
      includeFontPadding: false,
    },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      marginTop: 2,
      paddingHorizontal: 6,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    unreadBadgeMuted: {
      backgroundColor: c.iconMuted,
    },
    unreadBadgeWide: {
      minWidth: 28,
    },
    unreadBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
      includeFontPadding: false,
    },
  });
}

export type ChatListRowStyleSet = ReturnType<typeof createChatListRowStyles>;
