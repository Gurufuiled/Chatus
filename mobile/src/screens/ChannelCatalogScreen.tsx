import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelCatalog } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import type { Chat } from '../stores/types';
import { colors } from '../theme/colors';
import { LoadErrorState } from '../components/LoadErrorState';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelCatalog'>;

function isPreviewRequired(channel: Chat) {
  return channel.access_type === 'paid' && channel.access_status !== 'active';
}

function ChannelAvatar({ title }: { title: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{(title.trim()[0] || 'К').toUpperCase()}</Text>
    </View>
  );
}

export function ChannelCatalogScreen() {
  const navigation = useNavigation<Nav>();
  const catalog = channelStore((state) => state.catalog);
  const isLoading = channelStore((state) => state.isLoadingCatalog);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    channelStore.getState().setLoadingCatalog(true);
    setLoadError(null);
    try {
      const channels = await fetchChannelCatalog();
      const onlyChannels = channels.filter((channel) => channel.chat_type === 'channel');
      channelStore.getState().setCatalog(onlyChannels);
      onlyChannels
        .filter((channel) => channel.access_status === 'active')
        .forEach((channel) => chatStore.getState().addOrUpdateChat(channel));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Не удалось загрузить список каналов.',
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
      const title = item.name ?? 'Безымянный канал';
      const locked = isPreviewRequired(item);
      const subtitle = `${item.subscriber_count ?? 0} подписчиков`;

      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            navigation.navigate(locked ? 'ChannelPreview' : 'ChannelFeed', {
              channelId: item.id,
            })
          }
        >
          <ChannelAvatar title={title} />
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {locked ? <Feather name="lock" size={16} color={colors.textSecondary} /> : null}
        </Pressable>
      );
    },
    [navigation]
  );

  if (loadError && catalog.length === 0 && !isLoading) {
    return <LoadErrorState message={loadError} onRetry={() => void load()} />;
  }

  if (isLoading && catalog.length === 0) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={catalog}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      refreshing={isLoading}
      onRefresh={() => void load()}
      ItemSeparatorComponent={RowSeparator}
      contentContainerStyle={catalog.length === 0 ? styles.emptyContainer : undefined}
      ListHeaderComponent={
        loadError && catalog.length > 0 ? (
          <View style={styles.refreshErrorBanner}>
            <Text style={styles.refreshErrorText}>{loadError}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.refreshErrorRetry}>Обновить</Text>
            </Pressable>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Пока нет каналов</Text>
          <Text style={styles.emptySubtitle}>Создайте канал через меню удержания вкладки чатов.</Text>
        </View>
      }
    />
  );
}

function RowSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackgroundSolid,
  },
  rowPressed: {
    backgroundColor: colors.rowPressed,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#60A5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  textWrap: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    color: colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 80,
    backgroundColor: colors.separator,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackgroundSolid,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.inputBackgroundSolid,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  refreshErrorBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  refreshErrorText: {
    flex: 1,
    fontSize: 14,
    color: '#B91C1C',
  },
  refreshErrorRetry: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
});
