import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { resolveAvatarUrl } from '../config';
import { messageStore } from '../stores/messageStore';
import type { Chat } from '../stores/types';

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

function getStatusIcon(status: string) {
  switch (status) {
    case 'read':
      return '\u2713\u2713';
    case 'delivered':
    case 'sent':
      return '\u2713';
    default:
      return '';
  }
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
  const lastMessageSenderId = messageStore(
    React.useCallback(
      (state) => {
        const chatMessages = state.messagesByChatId[chat.id] ?? [];
        const lastMessage = chat.last_message_id
          ? chatMessages.find((message) => message.id === chat.last_message_id)
          : null;

        return lastMessage?.sender_id ?? null;
      },
      [chat.id, chat.last_message_id]
    )
  );

  const lastMessageStatus = messageStore(
    React.useCallback(
      (state) => {
        const chatMessages = state.messagesByChatId[chat.id] ?? [];
        const lastMessage = chat.last_message_id
          ? chatMessages.find((message) => message.id === chat.last_message_id)
          : null;

        return lastMessage?.status ?? '';
      },
      [chat.id, chat.last_message_id]
    )
  );

  const title = chat.peer_display_name || chat.name || 'Chat';
  const preview = chat.last_message_preview;
  const avatarUrl = resolveAvatarUrl(chat.avatar_url);
  const initial = (title.trim()[0] || '?').toUpperCase();
  const avatarColor = getAvatarColor(title);
  const isLastMessageMine = lastMessageSenderId === currentUserId;
  const statusIcon = isLastMessageMine ? getStatusIcon(lastMessageStatus) : '';
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
              {statusIcon ? <Text style={styles.statusIcon}>{statusIcon}</Text> : null}
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
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  rowPressed: { backgroundColor: '#F7F8FA' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  metaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    justifyContent: 'flex-end',
  },
  metaColumn: {
    marginLeft: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 42,
  },
  statusIcon: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '700',
  },
  timeLabel: {
    fontSize: 14,
    color: '#8A9099',
  },
  preview: {
    marginTop: 3,
    fontSize: 16,
    color: '#8A9099',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    marginTop: 5,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4D8DFF',
  },
  unreadBadgeMuted: {
    backgroundColor: '#AEB7C5',
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
