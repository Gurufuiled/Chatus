import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { resolveAvatarUrl } from '../config';
import { messageStore } from '../stores/messageStore';
import type { Chat } from '../stores/types';
import {
  CHAT_LIST_AVATAR_GAP,
  CHAT_LIST_AVATAR_SIZE,
  CHAT_LIST_HORIZONTAL_PADDING,
} from '../presentation';
import { colors, typography } from '../theme/colors';
import { MessageStatusIcon } from './MessageTimeStatus';

const AVATAR_COLORS = [
  '#5B8DEF',
  '#53B7A8',
  '#F2994A',
  '#BB6BD9',
  '#EB5757',
  '#2D9CDB',
  '#27AE60',
  '#F2C94C',
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatChatTime(timestamp: number | null) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: string) {
  return status === 'read' ? colors.accent : colors.iconMuted;
}

type ChatListRowProps = {
  chat: Chat;
  currentUserId: string | null;
  onPress: (chatId: string, chatTitle: string) => void;
  onLongPress: (chat: Chat, event: GestureResponderEvent) => void;
};

export const ChatListRow = React.memo(function ChatListRow({
  chat,
  currentUserId,
  onPress,
  onLongPress,
}: ChatListRowProps) {
  const lastMessageMetaKey = messageStore(
    React.useCallback(
      (state) => {
        const chatMessages = state.messagesByChatId[chat.id] ?? [];
        const lastMessage = chat.last_message_id
          ? chatMessages.find((message) => message.id === chat.last_message_id)
          : null;
        return JSON.stringify({
          s: lastMessage?.sender_id ?? null,
          t: lastMessage?.status ?? '',
        });
      },
      [chat.id, chat.last_message_id]
    )
  );

  const { lastMessageSenderId, lastMessageStatus } = React.useMemo(() => {
    try {
      const parsed = JSON.parse(lastMessageMetaKey) as { s: string | null; t: string };
      return { lastMessageSenderId: parsed.s, lastMessageStatus: parsed.t };
    } catch {
      return { lastMessageSenderId: null as string | null, lastMessageStatus: '' };
    }
  }, [lastMessageMetaKey]);

  const title =
    chat.local_contact_name?.trim() ||
    chat.peer_display_name ||
    chat.name ||
    (chat.chat_type === 'channel' ? 'Канал' : 'Chat');
  const preview =
    chat.last_message_preview ||
    (chat.chat_type === 'channel' ? chat.description || 'Канал' : null);
  const avatarUrl = resolveAvatarUrl(chat.avatar_url);
  const initial = (title.trim()[0] || '?').toUpperCase();
  const avatarColor = getAvatarColor(title);
  const isLastMessageMine = lastMessageSenderId === currentUserId;
  const statusIconColor = getStatusColor(lastMessageStatus);
  const timeLabel = formatChatTime(chat.last_message_at);
  const unreadCount = Math.max(0, chat.unread_count ?? 0);
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const showUnreadBadge = unreadCount > 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(chat.id, title)}
      onLongPress={(event) => onLongPress(chat, event)}
      delayLongPress={220}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : chat.chat_type === 'channel' ? (
        <View style={[styles.avatarPlaceholder, styles.channelAvatarPlaceholder]}>
          <MaterialCommunityIcons name="bullhorn-outline" size={24} color="#FFFFFF" />
        </View>
      ) : (
        <View style={[styles.avatarPlaceholder, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarPlaceholderText}>{initial}</Text>
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {timeLabel || showUnreadBadge ? (
            <View style={styles.metaColumn}>
              <View style={styles.metaWrap}>
                {isLastMessageMine ? (
                  <MessageStatusIcon
                    status={lastMessageStatus}
                    isMe
                    compact
                    iconColor={statusIconColor}
                  />
                ) : null}
                {timeLabel ? <Text style={styles.timeLabel}>{timeLabel}</Text> : null}
              </View>
              {showUnreadBadge ? (
                <View
                  style={[
                    styles.unreadBadge,
                    chat.is_muted === 1 && styles.unreadBadgeMuted,
                    unreadCount > 99 && styles.unreadBadgeWide,
                  ]}
                >
                  <Text style={styles.unreadBadgeText}>{unreadLabel}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {preview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}, (prev, next) => {
  return (
    prev.chat === next.chat &&
    prev.currentUserId === next.currentUserId &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    paddingHorizontal: CHAT_LIST_HORIZONTAL_PADDING,
    paddingVertical: 10,
    backgroundColor: colors.inputBackgroundSolid,
  },
  rowPressed: { backgroundColor: colors.rowPressed },
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
    backgroundColor: colors.accent,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: typography.dialogTitle,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
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
    justifyContent: 'center',
    minWidth: 42,
  },
  timeLabel: {
    fontSize: typography.dialogTime,
    color: colors.textSecondary,
  },
  preview: {
    marginTop: 3,
    fontSize: typography.dialogPreview,
    color: colors.textSecondary,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    marginTop: 5,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  unreadBadgeMuted: {
    backgroundColor: '#A8B0BC',
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
