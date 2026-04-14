import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChannelsStackParamList } from '../navigation/types';
import { fetchChannelCatalog } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import type { Chat } from '../stores/types';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<ChannelsStackParamList, 'ChannelCatalog'>;

function formatPrice(channel: Chat) {
  if (channel.access_type !== 'paid') return 'Бесплатно';
  const cents = channel.subscription_price_cents ?? 0;
  return `$${(cents / 100).toFixed(2)} / ${(channel.subscription_period_days ?? 30)} дн.`;
}

export function ChannelCatalogScreen() {
  const navigation = useNavigation<Nav>();
  const catalog = channelStore((state) => state.catalog);
  const isLoading = channelStore((state) => state.isLoadingCatalog);

  const load = React.useCallback(async () => {
    channelStore.getState().setLoadingCatalog(true);
    try {
      const channels = await fetchChannelCatalog();
      channelStore.getState().setCatalog(
        channels.filter((channel) => channel.chat_type === 'channel')
      );
    } finally {
      channelStore.getState().setLoadingCatalog(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load])
  );

  const renderItem = React.useCallback(
    ({ item }: { item: Chat }) => {
      const isLocked = item.access_type === 'paid' && item.access_status !== 'active';
      return (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() =>
            navigation.navigate(isLocked ? 'ChannelPreview' : 'ChannelFeed', {
              channelId: item.id,
            })
          }
        >
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.name?.trim()[0] ?? 'C').toUpperCase()}
              </Text>
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.title}>{item.name ?? 'Безымянный канал'}</Text>
              <Text style={styles.subtitle}>
                {item.subscriber_count ?? 0} подписчиков
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                item.access_type === 'paid' ? styles.badgePaid : styles.badgeFree,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  item.access_type === 'paid' ? styles.badgeTextPaid : styles.badgeTextFree,
                ]}
              >
                {item.access_type === 'paid' ? 'Платный' : 'Бесплатный'}
              </Text>
            </View>
          </View>

          <Text style={styles.description} numberOfLines={3}>
            {item.description || 'Канал для публикаций с привязанным обсуждением.'}
          </Text>

          <View style={styles.cardFooter}>
            <Text style={styles.metaLabel}>{formatPrice(item)}</Text>
            <Text style={styles.openLabel}>{isLocked ? 'Превью' : 'Открыть'}</Text>
          </View>
        </Pressable>
      );
    },
    [navigation]
  );

  return (
    <View style={styles.container}>
      {isLoading && catalog.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={catalog}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshing={isLoading}
          onRefresh={() => void load()}
          contentContainerStyle={catalog.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Пока нет каналов</Text>
              <Text style={styles.emptySubtitle}>
                Создайте первый канал через быстрое действие на вкладке.
              </Text>
            </View>
          }
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
  listContent: {
    padding: 16,
    gap: 12,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    shadowColor: '#18233A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#DDEBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.accent,
  },
  cardMeta: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    color: colors.textSecondary,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgePaid: {
    backgroundColor: '#FFF0DA',
  },
  badgeFree: {
    backgroundColor: '#E8F7ED',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextPaid: {
    color: '#A15D00',
  },
  badgeTextFree: {
    color: '#247D4D',
  },
  description: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
    color: '#556070',
  },
  cardFooter: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  openLabel: {
    color: colors.accent,
    fontWeight: '700',
  },
});
