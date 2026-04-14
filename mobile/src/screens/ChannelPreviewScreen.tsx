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
        'Не удалось открыть канал',
        error instanceof Error ? error.message : 'Попробуйте еще раз.'
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
        <Text style={styles.errorText}>Канал недоступен.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(detail.channel.name?.trim()[0] ?? 'К').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.title}>{detail.channel.name ?? 'Безымянный канал'}</Text>
        <Text style={styles.meta}>
          {detail.channel.subscriber_count ?? 0} подписчиков
        </Text>
        <Text style={styles.description}>
          {detail.channel.description || 'Посмотрите превью публикаций и откройте полную ленту канала.'}
        </Text>
      </View>

      <View style={styles.paywallCard}>
        <Text style={styles.paywallLabel}>
          {detail.channel.access_type === 'paid' ? 'Платная подписка' : 'Бесплатный доступ'}
        </Text>
        <Text style={styles.paywallValue}>
          {detail.channel.access_type === 'paid'
            ? `$${((detail.channel.subscription_price_cents ?? 0) / 100).toFixed(2)} каждые ${
                detail.channel.subscription_period_days ?? 30
              } дн.`
            : 'Вступите, чтобы читать все публикации и открыть обсуждение'}
        </Text>
        <Text style={styles.mockNote}>
          Оплата пока смоделирована для V1, пока не готова реальная интеграция биллинга.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Публикации в превью</Text>
        {detail.preview_posts.map((post) => (
          <View key={post.id} style={styles.postCard}>
            <Text style={styles.postText}>{post.content || 'Медиапубликация'}</Text>
            <Text style={styles.postMeta}>
              {post.comment_count ?? 0} комментариев
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
            {detail.channel.access_type === 'paid' ? 'Оплатить и открыть' : 'Вступить в канал'}
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
