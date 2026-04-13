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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChannelsStackParamList } from '../navigation/types';
import {
  fetchChannelFeed,
  publishChannelPost,
  toggleChannelReaction,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import type { Message } from '../stores/types';
import { colors } from '../theme/colors';

type Route = RouteProp<ChannelsStackParamList, 'ChannelFeed'>;
type Nav = NativeStackNavigationProp<ChannelsStackParamList, 'ChannelFeed'>;

const QUICK_REACTIONS = ['🔥', '👍', '❤️', '👏'];

export function ChannelFeedScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const feed = channelStore((state) => state.feedByChannelId[channelId] ?? []);
  const [loading, setLoading] = React.useState(feed.length === 0);
  const [postDraft, setPostDraft] = React.useState('');
  const [publishing, setPublishing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchChannelFeed(channelId);
      channelStore.getState().upsertChannel(next.channel);
      channelStore.getState().setFeed(channelId, next.posts);
      if (detail) {
        channelStore.getState().setDetail(channelId, {
          ...detail,
          channel: next.channel,
          preview_posts: next.posts,
          can_view_full_feed: next.can_view_full_feed,
          can_comment: next.can_comment,
          can_react: next.can_react,
          can_post: next.can_post,
          is_subscribed: next.is_subscribed,
          linked_discussion_chat_id: next.channel.linked_discussion_chat_id ?? null,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [channelId, detail]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handlePublish = React.useCallback(async () => {
    const content = postDraft.trim();
    if (!content) return;
    setPublishing(true);
    try {
      const post = await publishChannelPost(channelId, { content });
      channelStore.getState().prependFeedPost(channelId, post);
      setPostDraft('');
    } catch (error) {
      Alert.alert(
        'Unable to publish',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setPublishing(false);
    }
  }, [channelId, postDraft]);

  const handleReaction = React.useCallback(async (message: Message, emoji: string) => {
    try {
      const reactions = await toggleChannelReaction(channelId, message.id, emoji);
      channelStore.getState().updateFeedMessage(channelId, message.id, { reactions });
    } catch (error) {
      Alert.alert(
        'Unable to update reaction',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }, [channelId]);

  const renderPost = React.useCallback(
    ({ item }: { item: Message }) => (
      <View style={styles.postCard}>
        <Text style={styles.postText}>{item.content || 'Media post'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{item.view_count ?? 0} views</Text>
          <Pressable
            onPress={() =>
              navigation.navigate('ChannelDiscussion', {
                channelId,
                postId: item.id,
              })
            }
          >
            <Text style={styles.discussionLink}>
              {item.comment_count ?? 0} comments
            </Text>
          </Pressable>
        </View>
        <View style={styles.reactionRow}>
          {QUICK_REACTIONS.map((emoji) => {
            const reaction = item.reactions?.find((entry) => entry.emoji === emoji);
            return (
              <Pressable
                key={emoji}
                style={[
                  styles.reactionButton,
                  reaction?.reacted_by_me && styles.reactionButtonActive,
                ]}
                onPress={() => void handleReaction(item, emoji)}
              >
                <Text style={styles.reactionText}>
                  {emoji} {reaction?.count ?? 0}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ),
    [channelId, handleReaction, navigation]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.channelTitle}>{detail?.channel.name ?? 'Channel'}</Text>
        <Text style={styles.channelMeta}>
          {(detail?.channel.subscriber_count ?? 0).toString()} subscribers
        </Text>
        {detail?.can_post ? (
          <Pressable
            style={styles.adminLink}
            onPress={() => navigation.navigate('ChannelAdmin', { channelId })}
          >
            <Text style={styles.adminLinkText}>Manage channel</Text>
          </Pressable>
        ) : null}
      </View>

      {detail?.can_post ? (
        <View style={styles.composerCard}>
          <TextInput
            value={postDraft}
            onChangeText={setPostDraft}
            placeholder="Write a channel post"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={() => void handlePublish()}
            style={({ pressed }) => [
              styles.publishButton,
              pressed && styles.publishButtonPressed,
              publishing && styles.publishButtonDisabled,
            ]}
            disabled={publishing}
          >
            {publishing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.publishText}>Publish</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {loading && feed.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          refreshing={loading}
          onRefresh={() => void load()}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 24,
    padding: 18,
  },
  channelTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  channelMeta: {
    marginTop: 4,
    color: colors.textSecondary,
  },
  adminLink: {
    marginTop: 10,
  },
  adminLinkText: {
    color: colors.accent,
    fontWeight: '700',
  },
  composerCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  input: {
    minHeight: 72,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  publishButton: {
    marginTop: 12,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishButtonPressed: {
    opacity: 0.92,
  },
  publishButtonDisabled: {
    opacity: 0.7,
  },
  publishText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  postText: {
    color: colors.textPrimary,
    lineHeight: 21,
    fontSize: 15,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  discussionLink: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  reactionButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F0F4F9',
  },
  reactionButtonActive: {
    backgroundColor: '#DCEBFF',
  },
  reactionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
