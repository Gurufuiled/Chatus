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
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import {
  fetchChannelDetail,
  mockCheckoutChannel,
  subscribeToChannel,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors } from '../theme/colors';

type Route = RouteProp<ChatsStackParamList, 'ChannelPreview'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelPreview'>;

function formatAccessText(priceCents?: number | null, periodDays?: number | null) {
  return `$${((priceCents ?? 0) / 100).toFixed(2)} / ${periodDays ?? 30} дн.`;
}

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
          if (nextDetail.is_subscribed || nextDetail.can_view_full_feed) {
            chatStore.getState().addOrUpdateChat(nextDetail.channel);
          }
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
      chatStore.getState().addOrUpdateChat(updated);
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

  const title = detail.channel.name ?? 'Безымянный канал';
  const accessTitle = detail.channel.access_type === 'paid' ? 'Платная подписка' : 'Бесплатный канал';
  const accessValue =
    detail.channel.access_type === 'paid'
      ? formatAccessText(detail.channel.subscription_price_cents, detail.channel.subscription_period_days)
      : 'Подписка бесплатная';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(title.trim()[0] || 'К').toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>{detail.channel.subscriber_count ?? 0} подписчиков</Text>
        </View>

        {detail.channel.description ? (
          <View style={styles.infoCard}>
            <Text style={styles.description}>{detail.channel.description}</Text>
          </View>
        ) : null}

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{accessTitle}</Text>
          <Text style={styles.infoValue}>{accessValue}</Text>
        </View>

        <View style={styles.previewSection}>
          <Text style={styles.previewTitle}>Превью публикаций</Text>
          {detail.preview_posts.map((post) => (
            <View key={post.id} style={styles.previewPost}>
              <Text style={styles.previewText}>{post.content || 'Медиапубликация'}</Text>
              <View style={styles.previewMeta}>
                <Feather name="message-circle" size={13} color={colors.textSecondary} />
                <Text style={styles.previewMetaText}>{post.comment_count ?? 0}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.actionDock}>
        <Pressable
          onPress={() => void handleJoin()}
          style={({ pressed }) => [
            styles.joinButton,
            pressed && styles.joinButtonPressed,
            checkoutState === 'processing' && styles.joinButtonDisabled,
          ]}
          disabled={checkoutState === 'processing'}
        >
          {checkoutState === 'processing' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.joinButtonText}>
              {detail.channel.access_type === 'paid' ? 'Оплатить и открыть' : 'Подписаться'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.inputBackgroundSolid,
  },
  content: {
    paddingBottom: 96,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackgroundSolid,
  },
  errorText: {
    color: colors.textSecondary,
  },
  headerBlock: {
    alignItems: 'center',
    paddingTop: 22,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#60A5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
  },
  title: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  meta: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  description: {
    color: colors.textPrimary,
    lineHeight: 20,
    fontSize: 15,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  infoValue: {
    marginTop: 4,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  previewSection: {
    marginTop: 4,
    paddingHorizontal: 12,
  },
  previewTitle: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  previewPost: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  previewText: {
    color: colors.textPrimary,
    lineHeight: 20,
    fontSize: 15,
  },
  previewMeta: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  actionDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  joinButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonPressed: {
    opacity: 0.92,
  },
  joinButtonDisabled: {
    opacity: 0.72,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
