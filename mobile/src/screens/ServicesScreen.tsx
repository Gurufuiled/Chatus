import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import {
  listMiniApps,
  openChatusFatherChat,
  type MiniAppSummary,
} from '../services/miniAppsService';
import { resolveAvatarUrl } from '../config';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Services'>;

export function ServicesScreen({ navigation }: Props) {
  const [apps, setApps] = useState<MiniAppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const list = await listMiniApps();
      setApps(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить сервисы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(false);
  }, [load]);

  const openApp = useCallback(
    (app: MiniAppSummary) => {
      navigation.navigate('MiniApp', { appId: app.short_id, title: app.title });
    },
    [navigation],
  );

  const openChatusFather = useCallback(async () => {
    try {
      const { chat } = await openChatusFatherChat();
      navigation.dispatch(
        CommonActions.navigate({
          name: 'Chats',
          params: {
            screen: 'Chat',
            params: { chatId: chat.id, chatTitle: 'ChatusFather' },
          },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть ChatusFather');
    }
  }, [navigation]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={apps}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.fatherCard, pressed && styles.pressed]}
            onPress={openChatusFather}
          >
            <View style={styles.fatherIcon}>
              <Text style={styles.fatherIconText}>CF</Text>
            </View>
            <View style={styles.fatherText}>
              <Text style={styles.fatherTitle}>@ChatusFather</Text>
              <Text style={styles.fatherSubtitle}>
                Зарегистрировать мини-приложение, /newapp, /myapps
              </Text>
            </View>
          </Pressable>

          <Text style={styles.sectionTitle}>Опубликованные приложения</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Пока нет мини-приложений</Text>
          <Text style={styles.emptySubtitle}>
            Разработчики могут опубликовать своё приложение через @ChatusFather.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => openApp(item)}
        >
          <View style={styles.icon}>
            {item.icon_url ? (
              <Image
                source={{ uri: resolveAvatarUrl(item.icon_url) ?? item.icon_url }}
                style={styles.iconImage}
              />
            ) : (
              <Text style={styles.iconPlaceholder}>
                {(item.title[0] ?? '?').toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.description ? (
              <Text style={styles.rowSubtitle} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.chatBackground },
  listContent: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.85 },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: { color: '#c62828', fontSize: 14 },
  fatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.inputBackgroundSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  fatherIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  fatherIconText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  fatherText: { flex: 1, minWidth: 0 },
  fatherTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  fatherSubtitle: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.inputBackgroundSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    marginBottom: 8,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.buttonBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  iconImage: { width: '100%', height: '100%' },
  iconPlaceholder: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  rowSubtitle: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
