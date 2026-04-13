import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChannelsStackParamList } from '../navigation/types';
import {
  fetchChannelDetail,
  mockCheckoutChannel,
  subscribeToChannel,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { colors } from '../theme/colors';

type Route = RouteProp<ChannelsStackParamList, 'ChannelPreview'>;
type Nav = NativeStackNavigationProp<ChannelsStackParamList, 'ChannelPreview'>;

export function ChannelPreviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const checkoutState = channelStore(
    (state) => state.checkoutStateByChannelId[channelId] ?? 'idle'
  );
  const [loading, setLoading] = React.useState(!detail);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const nextDetail = await fetchChannelDetail(channelId);
        if (!cancelled) {
          channelStore.getState().setDetail(channelId, nextDetail);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const handleJoin = React.useCallback(async () => {
    if (!detail) return;
    channelStore.getState().setCheckoutState(channelId, 'processing');
    try {
      const updated =
        detail.channel.access_type === 'paid'
          ? await mockCheckoutChannel(channelId)
          : await subscribeToChannel(channelId);

      channelStore.getState().setCheckoutState(channelId, 'paid');
      channelStore.getState().upsertChannel(updated);
      navigation.replace('ChannelFeed', { channelId });
    } catch (error) {
      channelStore.getState().setCheckoutState(channelId, 'error');
      Alert.alert(
        'Unable to unlock channel',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }, [channelId, detail, navigation]);

  if (loading && !detail) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Channel unavailable.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(detail.channel.name?.trim()[0] ?? 'C').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.title}>{detail.channel.name ?? 'Untitled channel'}</Text>
        <Text style={styles.meta}>
          {detail.channel.subscriber_count ?? 0} subscribers
        </Text>
        <Text style={styles.description}>
          {detail.channel.description || 'Read preview posts and unlock the full channel feed.'}
        </Text>
      </View>

      <View style={styles.paywallCard}>
        <Text style={styles.paywallLabel}>
          {detail.channel.access_type === 'paid' ? 'Paid subscription' : 'Free membership'}
        </Text>
        <Text style={styles.paywallValue}>
          {detail.channel.access_type === 'paid'
            ? `$${((detail.channel.subscription_price_cents ?? 0) / 100).toFixed(2)} every ${
                detail.channel.subscription_period_days ?? 30
              } days`
            : 'Join instantly to read all posts and open discussion'}
        </Text>
        <Text style={styles.mockNote}>
          Checkout is mocked for V1 until billing integration is ready.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preview posts</Text>
        {detail.preview_posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
            <Text style={styles.postText}>{post.content || 'Media post'}</Text>
            <Text style={styles.postMeta}>
              {post.comment_count ?? 0} comments
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => void handleJoin()}
        style={({ pressed }) => [
          styles.cta,
          pressed && styles.ctaPressed,
          checkoutState === 'processing' && styles.ctaDisabled,
        ]}
        disabled={checkoutState === 'processing'}
      >
        {checkoutState === 'processing' ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.ctaText}>
            {detail.channel.access_type === 'paid' ? 'Mock checkout and open' : 'Join channel'}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F7FB',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.textSecondary,
  },
  hero: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#DDEBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.accent,
  },
  title: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  meta: {
    marginTop: 6,
    color: colors.textSecondary,
  },
  description: {
    marginTop: 14,
    textAlign: 'center',
    color: '#556070',
    lineHeight: 20,
  },
  paywallCard: {
    marginTop: 16,
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#111827',
  },
  paywallLabel: {
    color: '#9FB3D1',
    fontWeight: '700',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  paywallValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mockNote: {
    marginTop: 10,
    color: '#D7E4FF',
    lineHeight: 18,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  postText: {
    color: colors.textPrimary,
    lineHeight: 20,
  },
  postMeta: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  cta: {
    marginTop: 8,
    borderRadius: 20,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  ctaPressed: {
    opacity: 0.92,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
