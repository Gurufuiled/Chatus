import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { ChatsStackParamList } from '../navigation/types';
import {
  fetchDiscussionThread,
  sendDiscussionMessage,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { authStore } from '../stores/authStore';
import type { Message } from '../stores/types';
import { colors } from '../theme/colors';
import { formatTime } from './chatScreen.shared';

type Route = RouteProp<ChatsStackParamList, 'ChannelDiscussion'>;

const AVATAR_SIZE = 36;
const AVATAR_COLORS = [
  '#E57373', '#F06292', '#BA68C8', '#9575CD',
  '#7986CB', '#64B5F6', '#4FC3F7', '#4DB6AC',
  '#81C784', '#AED581', '#FFD54F', '#FFB74D',
];

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function nameInitial(name?: string | null): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function OriginalPostHeader({ post }: { post: Message | null }) {
  if (!post) return null;
  const time = formatTime(post.created_at);

  return (
    <View style={styles.originalPost}>
      <View style={styles.originalPostBody}>
        {post.content ? (
          <Text style={styles.originalPostText} numberOfLines={6}>
            {post.content}
          </Text>
        ) : (
          <Text style={styles.originalPostMediaLabel}>
            {post.msg_type === 'image'
              ? '🖼 Фото'
              : post.msg_type === 'video'
                ? '🎬 Видео'
                : post.msg_type === 'voice'
                  ? '🎤 Голосовое'
                  : post.msg_type === 'video_note'
                    ? '📹 Видео-кружок'
                    : post.msg_type === 'file'
                      ? '📎 Файл'
                      : 'Публикация'}
          </Text>
        )}
        <View style={styles.originalPostMeta}>
          <Feather name="eye" size={12} color="#8E99A4" />
          <Text style={styles.originalPostMetaText}>{post.view_count ?? 0}</Text>
          <Text style={styles.originalPostMetaText}>{time}</Text>
        </View>
      </View>
      <View style={styles.discussionDivider}>
        <View style={styles.discussionDividerLine} />
        <Text style={styles.discussionDividerText}>Начало обсуждения</Text>
        <View style={styles.discussionDividerLine} />
      </View>
    </View>
  );
}

function CommentBubble({ item }: { item: Message }) {
  const currentUserId = authStore((s) => s.user?.id);
  const isMe = item.sender_id === currentUserId;
  const name = item.sender_name || item.sender_id.slice(0, 8);
  const avatarUrl = item.sender_avatar_url;
  const time = formatTime(item.created_at);
  const bgColor = hashColor(item.sender_id);

  return (
    <View style={styles.commentRow}>
      {!isMe ? (
        avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: bgColor }]}>
            <Text style={styles.avatarInitial}>{nameInitial(name)}</Text>
          </View>
        )
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <View
        style={[
          styles.commentBubble,
          isMe ? styles.commentBubbleMe : styles.commentBubbleOther,
        ]}
      >
        {!isMe ? (
          <Text style={[styles.commentAuthor, { color: bgColor }]}>{name}</Text>
        ) : null}
        <Text style={[styles.commentText, isMe && styles.commentTextMe]}>
          {item.content || 'Медиаответ'}
        </Text>
        <View style={styles.commentMeta}>
          {item.reactions && item.reactions.length > 0 ? (
            <View style={styles.commentReactions}>
              {item.reactions.map((r) => (
                <Text key={r.emoji} style={styles.commentReactionText}>
                  {r.emoji} {r.count}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={[styles.commentTime, isMe && styles.commentTimeMe]}>{time}</Text>
        </View>
      </View>
    </View>
  );
}

export function ChannelDiscussionScreen() {
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { channelId, postId } = route.params;
  const key = `${channelId}:${postId}`;
  const thread = channelStore((state) => state.discussionByKey[key]);
  const originalPost = channelStore(
    (state) => (state.feedByChannelId[channelId] ?? []).find((p) => p.id === postId) ?? null,
  );
  const [loading, setLoading] = React.useState(!thread);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const listRef = React.useRef<FlatList<Message>>(null);

  const sortedMessages = React.useMemo(() => {
    if (!thread?.messages) return [];
    return [...thread.messages].sort((a, b) => a.created_at - b.created_at);
  }, [thread?.messages]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchDiscussionThread(channelId, postId);
      channelStore.getState().setDiscussion(key, {
        discussion_chat_id: next.discussion_chat_id,
        thread_root_message_id: next.thread_root_message_id,
        can_comment: next.can_comment,
        messages: next.messages,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Попробуйте еще раз.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [channelId, key, postId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSend = React.useCallback(async () => {
    const content = draft.trim();
    if (!content) return;
    Keyboard.dismiss();
    setSending(true);
    try {
      const message = await sendDiscussionMessage(channelId, postId, { content });
      channelStore.getState().prependDiscussionMessage(key, message);
      setDraft('');
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      Alert.alert(
        'Не удалось отправить комментарий',
        error instanceof Error ? error.message : 'Попробуйте еще раз.',
      );
    } finally {
      setSending(false);
    }
  }, [channelId, draft, key, postId]);

  const renderComment = React.useCallback(
    ({ item }: { item: Message }) => <CommentBubble item={item} />,
    [],
  );

  return (
    <View style={styles.container}>
      {loading && !thread && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : loadError && !thread ? (
        <View style={styles.loading}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={sortedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            refreshing={loading}
            onRefresh={() => void load()}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: 68 + Math.max(insets.bottom, 8) },
            ]}
            ListHeaderComponent={<OriginalPostHeader post={originalPost} />}
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.emptyText}>Пока нет комментариев</Text>
              ) : null
            }
          />
          {thread?.can_comment ? (
            <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Комментарий"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                multiline
                maxLength={2000}
              />
              <Pressable
                onPress={() => void handleSend()}
                disabled={sending || !draft.trim()}
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.sendButtonPressed,
                  (sending || !draft.trim()) && styles.sendButtonDisabled,
                ]}
                hitSlop={8}
              >
                <Feather name="send" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFEAE2',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },

  originalPost: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  originalPostBody: {
    padding: 12,
  },
  originalPostText: {
    color: '#000000',
    fontSize: 15,
    lineHeight: 20,
  },
  originalPostMediaLabel: {
    color: '#555555',
    fontSize: 15,
    fontStyle: 'italic',
  },
  originalPostMeta: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-end',
  },
  originalPostMetaText: {
    color: '#8E99A4',
    fontSize: 12,
    fontWeight: '600',
  },

  discussionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  discussionDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  discussionDividerText: {
    color: '#8E99A4',
    fontSize: 12,
    fontWeight: '600',
  },

  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
    gap: 6,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginBottom: 2,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  avatarSpacer: {
    width: AVATAR_SIZE,
  },

  commentBubble: {
    maxWidth: '75%',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 12,
  },
  commentBubbleOther: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 4,
  },
  commentBubbleMe: {
    backgroundColor: '#DCF8C6',
    borderTopRightRadius: 4,
    marginLeft: 'auto',
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 1,
  },
  commentText: {
    color: '#000000',
    fontSize: 15,
    lineHeight: 20,
  },
  commentTextMe: {
    color: '#000000',
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  commentReactions: {
    flexDirection: 'row',
    gap: 6,
  },
  commentReactionText: {
    fontSize: 12,
    color: '#6B7280',
  },
  commentTime: {
    fontSize: 11,
    color: '#8E99A4',
  },
  commentTimeMe: {
    color: '#6B8A5E',
  },

  emptyText: {
    marginTop: 24,
    textAlign: 'center',
    color: '#8E99A4',
    fontWeight: '600',
    fontSize: 14,
  },

  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: '#F0EBE3',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.textPrimary,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginBottom: 0,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
