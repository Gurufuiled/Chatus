import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { resolveMediaUrl } from '../config';
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
  const { height: windowHeight } = useWindowDimensions();
  const imageBoxHeight = Math.min(480, Math.round(windowHeight * 0.4));

  const { kind } = route.params;
  const prependEntry = route.params.prependEntry;
  const { user } = useAuth();
  const inbox = isFeedbackInboxViewer(user?.handle ?? null);
  const insets = useSafeAreaInsets();

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

  useEffect(() => {
    if (!prependEntry || prependEntry.type !== kind) return;
    setItems((prev) => {
      if (prev.some((x) => x.id === prependEntry.id)) return prev;
      return [prependEntry, ...prev];
    });
    navigation.setParams({ prependEntry: undefined });
  }, [prependEntry, kind, navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => null,
    });
  }, [navigation, title]);

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

      const imgUri = resolveMediaUrl(item.attachment_url ?? null);

      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {authorLabel ? (
            <Text style={styles.cardAuthor} numberOfLines={1}>
              {authorLabel}
            </Text>
          ) : null}
          {imgUri ? (
            <View style={[styles.cardImageWrap, { height: imageBoxHeight }]}>
              <Image source={{ uri: imgUri }} style={styles.cardImage} resizeMode="contain" />
            </View>
          ) : null}
          <Text style={styles.cardBody} numberOfLines={8}>
            {item.body}
          </Text>
          <Text style={styles.cardMeta}>{formatListDate(item.created_at)}</Text>
        </View>
      );
    },
    [imageBoxHeight, inbox],
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
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              Пока ничего нет. Нажмите «Написать» внизу экрана.
            </Text>
          ) : null
        }
      />
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          style={({ pressed }) => [styles.composeCta, pressed && styles.composeCtaPressed]}
          onPress={() => navigation.navigate('FeedbackCompose', { kind })}
        >
          <Feather name="edit-3" size={20} color="#fff" />
          <Text style={styles.composeCtaText}>Написать</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.chatBackground },
  list: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inboxHint: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  listContent: { padding: 16, paddingBottom: 24, gap: 10 },
  card: {
    backgroundColor: colors.inputBackgroundSolid,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cardAuthor: { fontSize: 13, color: colors.accent, marginTop: 4 },
  cardImageWrap: {
    width: '100%',
    marginTop: 10,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.inputBackground,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardBody: { fontSize: 15, color: colors.textPrimary, marginTop: 10, lineHeight: 21 },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 10 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 24, paddingHorizontal: 24 },
  errorBox: { padding: 16, alignItems: 'center', gap: 8 },
  errorText: { color: '#C62828', textAlign: 'center' },
  retryBtn: { padding: 8 },
  retryText: { color: colors.accent, fontWeight: '600' },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.chatBackground,
  },
  composeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  composeCtaPressed: { opacity: 0.92 },
  composeCtaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
