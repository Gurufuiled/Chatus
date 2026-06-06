import React, { useMemo } from 'react';
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { resolveAvatarUrl } from '../config';
import { useTheme } from '../contexts/ThemeContext';
import { messageStore } from '../stores/messageStore';
import type { Chat } from '../stores/types';
import { createChatListRowStyles } from './chatListRow.styles';
import { DialogListPreview } from './DialogListPreview';
import { MessageStatusIcon } from './MessageTimeStatus';
import { getChatListTitle } from '../presentation';
import { buildChatusDialogPreviewForChat } from '../utils/chatusDialogPreview';
import { formatMessageTime } from '../utils/formatMessageTime';

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
  return formatMessageTime(timestamp);
}

function getStatusColor(status: string, accent: string, iconMuted: string) {
  return status === 'read' ? accent : iconMuted;
}

type ChatListRowProps = {
  chat: Chat;
  currentUserId: string | null;
  onPress: (chatId: string, chatTitle: string) => void;
  onLongPress: (chat: Chat, event: GestureResponderEvent) => void;
};

export const ChatListRow = React.memo(
  function ChatListRow({
    chat,
    currentUserId,
    onPress,
    onLongPress,
  }: ChatListRowProps) {
    const { colors: themeColors } = useTheme();
    const styles = useMemo(
      () => createChatListRowStyles(themeColors),
      [themeColors],
    );
    const lastMessageSnapshotKey = messageStore(
      React.useCallback(
        (state) => {
          const chatMessages = state.messagesByChatId[chat.id] ?? [];
          const lastMessage = chat.last_message_id
            ? chatMessages.find(
                (message) => message.id === chat.last_message_id,
              )
            : null;
          const preview = buildChatusDialogPreviewForChat(
            chat,
            lastMessage ?? null,
          );
          return JSON.stringify({
            s: lastMessage?.sender_id ?? null,
            t: lastMessage?.status ?? '',
            p: preview.text,
            th: preview.thumbnailUris,
            a: preview.accentLabel ? 1 : 0,
          });
        },
        [chat, chat.id, chat.last_message_id],
      ),
    );

    const { lastMessageSenderId, lastMessageStatus, dialogPreview } =
      React.useMemo(() => {
        try {
          const parsed = JSON.parse(lastMessageSnapshotKey) as {
            s: string | null;
            t: string;
            p: string;
            th: string[];
            a: number;
          };
          return {
            lastMessageSenderId: parsed.s,
            lastMessageStatus: parsed.t,
            dialogPreview: {
              text: parsed.p ?? '',
              thumbnailUris: Array.isArray(parsed.th) ? parsed.th : [],
              accentLabel: parsed.a === 1,
            },
          };
        } catch {
          return {
            lastMessageSenderId: null as string | null,
            lastMessageStatus: '',
            dialogPreview: buildChatusDialogPreviewForChat(chat, null),
          };
        }
      }, [chat, lastMessageSnapshotKey]);

    const title = getChatListTitle(chat);
    const avatarUrl = resolveAvatarUrl(chat.avatar_url);
    const initial = (title.trim()[0] || '?').toUpperCase();
    const avatarColor = getAvatarColor(title);
    const isLastMessageMine = lastMessageSenderId === currentUserId;
    const statusIconColor = getStatusColor(
      lastMessageStatus,
      themeColors.accent,
      themeColors.iconMuted,
    );
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
          <View
            style={[styles.avatarPlaceholder, styles.channelAvatarPlaceholder]}
          >
            <MaterialCommunityIcons
              name="bullhorn-outline"
              size={24}
              color="#FFFFFF"
            />
          </View>
        ) : (
          <View
            style={[styles.avatarPlaceholder, { backgroundColor: avatarColor }]}
          >
            <Text style={styles.avatarPlaceholderText}>{initial}</Text>
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {timeLabel || isLastMessageMine ? (
              <View style={styles.metaWrap}>
                {isLastMessageMine ? (
                  <MessageStatusIcon
                    status={lastMessageStatus}
                    isMe
                    compact
                    iconColor={statusIconColor}
                  />
                ) : null}
                {timeLabel ? (
                  <Text style={styles.timeLabel}>{timeLabel}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.bottomRow}>
            {dialogPreview.text || dialogPreview.thumbnailUris.length > 0 ? (
              <DialogListPreview
                text={dialogPreview.text}
                thumbnailUris={dialogPreview.thumbnailUris}
                accentLabel={dialogPreview.accentLabel}
                colors={themeColors}
              />
            ) : (
              <View style={styles.previewPlaceholder} />
            )}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              {chat.is_pinned === 1 ? (
                <MaterialCommunityIcons
                  name="pin"
                  size={18}
                  color={themeColors.iconMuted}
                  style={{ transform: [{ rotate: '45deg' }] }}
                />
              ) : null}
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
          </View>
        </View>
      </Pressable>
    );
  },
  (prev, next) => {
    return (
      prev.chat === next.chat &&
      prev.currentUserId === next.currentUserId &&
      prev.onPress === next.onPress &&
      prev.onLongPress === next.onLongPress
    );
  },
);
