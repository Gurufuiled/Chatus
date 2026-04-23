import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { fetchFeedbackList, type FeedbackEntry } from '../services/feedbackService';
import { colors } from '../theme/colors';
import type { SettingsStackParamList } from '../navigation/types';
import { FEEDBACK_INBOX_HANDLE, isFeedbackInboxViewer } from '../utils/feedbackInbox';

type Props = NativeStackScreenProps<SettingsStackParamList, 'FeedbackList'>;

function formatListDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FeedbackListScreen({ navigation, route }: Props) {
  const { kind } = route.params;
  const { user } = useAuth();
  const inbox = isFeedbackInboxViewer(user?.handle ?? null);

  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = kind === 'bug' ? 'Баги' : 'Предложения';

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const list = await fetchFeedbackList(kind);
        setItems(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [kind],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('FeedbackCompose', { kind })}
          hitSlop={12}
          style={styles.headerBtn}
        >
          <Text style={styles.headerBtnText}>Написать</Text>
        </Pressable>
      ),
    });
  }, [navigation, kind, title]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(false);
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: FeedbackEntry }) => {
      const authorLabel =
        inbox && item.author?.handle
          ? `@${item.author.handle}`
          : inbox && item.author?.display_name
            ? item.author.display_name
            : null;

      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {authorLabel ? (
            <Text style={styles.cardAuthor} numberOfLines={1}>
              {authorLabel}
            </Text>
          ) : null}
          <Text style={styles.cardBody} numberOfLines={6}>
            {item.body}
          </Text>
          <Text style={styles.cardMeta}>{formatListDate(item.created_at)}</Text>
        </View>
      );
    },
    [inbox],
  );

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {inbox ? (
        <Text style={styles.inboxHint}>
          Вы вошли как @{FEEDBACK_INBOX_HANDLE} — видите все заявки этого типа.
        </Text>
      ) : (
        <Text style={styles.inboxHint}>Здесь только ваши сообщения этого типа.</Text>
      )}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load(true)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Пока ничего нет. Нажмите «Написать» вверху справа.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.chatBackground },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inboxHint: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  headerBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  headerBtnText: { fontSize: 17, fontWeight: '600', color: colors.accent },
  listContent: { padding: 16, paddingBottom: 32, gap: 10 },
  card: {
    backgroundColor: colors.inputBackgroundSolid,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cardAuthor: { fontSize: 13, color: colors.accent, marginTop: 4 },
  cardBody: { fontSize: 15, color: colors.textPrimary, marginTop: 8, lineHeight: 21 },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 10 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 24, paddingHorizontal: 24 },
  errorBox: { padding: 16, alignItems: 'center', gap: 8 },
  errorText: { color: '#C62828', textAlign: 'center' },
  retryBtn: { padding: 8 },
  retryText: { color: colors.accent, fontWeight: '600' },
});
