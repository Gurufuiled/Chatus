import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { ChatsStackParamList } from '../navigation/types';
import {
  fetchDiscussionThread,
  sendDiscussionMessage,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import type { Message } from '../stores/types';
import { colors } from '../theme/colors';

type Route = RouteProp<ChatsStackParamList, 'ChannelDiscussion'>;

export function ChannelDiscussionScreen() {
  const route = useRoute<Route>();
  const { channelId, postId } = route.params;
  const key = `${channelId}:${postId}`;
  const thread = channelStore((state) => state.discussionByKey[key]);
  const [loading, setLoading] = React.useState(!thread);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

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
    setSending(true);
    try {
      const message = await sendDiscussionMessage(channelId, postId, { content });
      channelStore.getState().prependDiscussionMessage(key, message);
      setDraft('');
    } catch (error) {
      Alert.alert(
        'Не удалось отправить комментарий',
        error instanceof Error ? error.message : 'Попробуйте еще раз.'
      );
    } finally {
      setSending(false);
    }
  }, [channelId, draft, key, postId]);

  const renderMessage = React.useCallback(
    ({ item }: { item: Message }) => (
      <View style={styles.messageCard}>
        <Text style={styles.messageText}>{item.content || 'Медиаответ'}</Text>
      </View>
    ),
    []
  );

  return (
    <View style={styles.container}>
      {loading && !thread && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : loadError && !thread ? (
        <View style={styles.loading}>
          <Text style={styles.headerText}>{loadError}</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={thread?.messages ?? []}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            refreshing={loading}
            onRefresh={() => void load()}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <Text style={styles.headerText}>
                {loadError ?? 'Привязанное обсуждение канала'}
              </Text>
            }
          />
          {thread?.can_comment ? (
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Напишите комментарий"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
              />
              <Pressable
                onPress={() => void handleSend()}
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.sendButtonPressed,
                  sending && styles.sendButtonDisabled,
                ]}
                disabled={sending}
              >
                <Text style={styles.sendButtonText}>Отправить</Text>
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
    backgroundColor: '#F4F7FB',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  headerText: {
    marginBottom: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  messageText: {
    color: colors.textPrimary,
    lineHeight: 20,
  },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    color: colors.textPrimary,
  },
  sendButton: {
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendButtonPressed: {
    opacity: 0.92,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
