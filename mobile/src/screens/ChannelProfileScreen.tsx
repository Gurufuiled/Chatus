import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail, fetchChannelFeed } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors } from '../theme/colors';
import { resolveAvatarUrl } from '../config';
import { LoadErrorState } from '../components/LoadErrorState';
import { ChatProfileMediaViewerModal } from '../components/ChatProfileMediaViewerModal';
import { MediaTilePreview, type MediaTile } from '../components/ChatProfileMediaSection';
import type { Message } from '../stores/types';
import { formatMediaDuration } from '../utils/mediaDuration';

type Route = RouteProp<ChatsStackParamList, 'ChannelProfile'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelProfile'>;

function extractRemoteMediaUri(message: Message): string | null {
  const media = message.media?.[0];
  const resolved = resolveAvatarUrl(media?.remote_url ?? null);
  return resolved ?? null;
}

function extractPreviewMediaUri(message: Message): string | null {
  const media = message.media?.[0];
  const candidates = [media?.thumbnail_url, media?.remote_url];
  for (const c of candidates) {
    const resolved = resolveAvatarUrl(c ?? null);
    if (resolved) return resolved;
  }
  return null;
}

function Row({
  icon,
  title,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowLeft}>
        <Feather name={icon} size={18} color={colors.accent} />
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

export function ChannelProfileScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const [loading, setLoading] = React.useState(!detail);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [snackbar, setSnackbar] = React.useState<string | null>(null);
  const [feedPosts, setFeedPosts] = React.useState<Message[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = React.useState<number | null>(null);

  const showSnackbar = React.useCallback((message: string) => {
    setSnackbar(message);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [next, feedResult] = await Promise.all([
        fetchChannelDetail(channelId),
        fetchChannelFeed(channelId).catch(() => null),
      ]);
      channelStore.getState().setDetail(channelId, next);
      chatStore.getState().addOrUpdateChat(next.channel);
      if (feedResult) {
        setFeedPosts(feedResult.posts);
        channelStore.getState().setFeed(channelId, feedResult.posts);
      } else {
        setFeedPosts([]);
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Не удалось загрузить профиль канала.',
      );
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 1800);
    return () => clearTimeout(timer);
  }, [snackbar]);

  const channelMediaItems = React.useMemo<MediaTile[]>(
    () =>
      feedPosts
        .filter(
          (m) =>
            m.is_deleted !== 1 &&
            (m.msg_type === 'image' || m.msg_type === 'video'),
        )
        .map((m) => {
          const uri = extractRemoteMediaUri(m) ?? '';
          const thumbnailUri = resolveAvatarUrl(m.media?.[0]?.thumbnail_url ?? null);
          const caption = typeof m.content === 'string' ? m.content.trim() : '';
          return {
            id: m.id,
            kind: m.msg_type === 'video' ? 'video' : 'image',
            uri,
            previewUri:
              m.msg_type === 'video'
                ? thumbnailUri ?? undefined
                : extractPreviewMediaUri(m) ?? uri,
            durationMs:
              m.msg_type === 'video' ? m.media?.[0]?.duration_ms ?? 0 : undefined,
            caption: caption.length > 0 ? caption : undefined,
          } satisfies MediaTile;
        })
        .filter((item) => item.uri.length > 0),
    [feedPosts],
  );

  React.useEffect(() => {
    if (selectedMediaIndex != null && selectedMediaIndex >= channelMediaItems.length) {
      setSelectedMediaIndex(null);
    }
  }, [channelMediaItems.length, selectedMediaIndex]);

  if (loading && !detail) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (loadError && !detail) {
    return <LoadErrorState message={loadError} onRetry={() => void load()} />;
  }

  if (!detail) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Канал недоступен</Text>
      </View>
    );
  }

  const channel = detail.channel;
  const title = channel.name?.trim() || 'Канал';
  const initial = (title[0] || 'К').toUpperCase();
  const inviteLink = channel.invite_token ? `https://t.me/${channel.invite_token}` : 'Ссылка недоступна';
  const description = channel.description?.trim() || 'Описание не указано';
  const avatarUrl = resolveAvatarUrl(channel.avatar_url ?? null);

  const canManageAdmins = detail.channel_permissions?.can_manage_admins === true;
  const canAdminOps =
    detail.channel_permissions?.can_add_admins === true ||
    detail.channel_permissions?.can_remove_admins === true ||
    detail.channel_permissions?.can_edit_admin_permissions === true ||
    canManageAdmins;
  const canModerate = detail.channel_permissions?.can_moderate_subscribers === true;
  const canEditSettings = detail.channel_permissions?.can_edit_channel === true;
  const canOpenEdit =
    detail.channel_permissions?.can_edit_channel_avatar === true ||
    detail.channel_permissions?.can_edit_channel_name === true ||
    detail.channel_permissions?.can_edit_channel_description === true ||
    canEditSettings;

  /** Обычный подписчик: без блока админов / подписчиков / настроек */
  const showManagementMenu = canAdminOps || canModerate || canEditSettings;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 6, 10) }]}
      >
        <View style={styles.headerCard}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Feather name="chevron-left" size={24} color="#111827" />
          </Pressable>

          {canOpenEdit ? (
            <Pressable
              onPress={() => navigation.navigate('ChannelEdit', { channelId })}
              style={({ pressed }) => [styles.editPill, pressed && styles.editPillPressed]}
            >
              <Text style={styles.editPlus}>+</Text>
              <Text style={styles.editText}>Изм.</Text>
            </Pressable>
          ) : null}

          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{channel.subscriber_count ?? 0} подписчиков</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>ссылка</Text>
          <Text style={styles.infoLink}>{inviteLink}</Text>
          <View style={styles.divider} />
          <Text style={styles.infoLabel}>описание</Text>
          <Text style={styles.infoText}>{description}</Text>
        </View>

        {showManagementMenu ? (
          <View style={styles.menuCard}>
            <Row
              icon="shield"
              title="Администраторы"
              value={String(
                (channel.members ?? []).filter((m) => m.role === 'owner' || m.role === 'admin').length,
              )}
              onPress={() => {
                if (!canAdminOps) return showSnackbar('Недостаточно прав для управления администраторами');
                navigation.navigate('ChannelMembers', { channelId, mode: 'admins' });
              }}
            />
            <View style={styles.divider} />
            <Row
              icon="users"
              title="Подписчики"
              value={String(channel.subscriber_count ?? 0)}
              onPress={() => {
                if (!canModerate && !canAdminOps) {
                  return showSnackbar('Недостаточно прав для просмотра подписчиков');
                }
                navigation.navigate('ChannelMembers', { channelId, mode: 'subscribers' });
              }}
            />
            <View style={styles.divider} />
            <Row
              icon="sliders"
              title="Настройки канала"
              onPress={() => {
                if (!canEditSettings) return showSnackbar('Недостаточно прав для настроек канала');
                navigation.navigate('ChannelSettings', { channelId });
              }}
            />
          </View>
        ) : null}

        <View style={styles.mediaCard}>
          <Text style={styles.mediaSectionTitle}>Медиа</Text>
          {channelMediaItems.length === 0 ? (
            <Text style={styles.mediaEmptyText}>
              Фото и видео из публикаций канала появятся здесь.
            </Text>
          ) : (
            <View style={styles.mediaGrid}>
              {channelMediaItems.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedMediaIndex(index)}
                  style={({ pressed }) => [styles.mediaTile, pressed && styles.mediaTilePressed]}
                >
                  <MediaTilePreview item={item} />
                  {item.kind === 'video' ? (
                    <View style={styles.mediaPlayBadge}>
                      <Feather name="play" size={15} color="#FFFFFF" style={styles.mediaPlayIcon} />
                    </View>
                  ) : null}
                  {item.durationMs ? (
                    <View style={styles.mediaDurationBadge}>
                      <Text style={styles.mediaDurationText}>
                        {formatMediaDuration(item.durationMs)}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <ChatProfileMediaViewerModal
        visible={selectedMediaIndex != null}
        items={channelMediaItems}
        selectedIndex={selectedMediaIndex ?? 0}
        onChangeIndex={setSelectedMediaIndex}
        onClose={() => setSelectedMediaIndex(null)}
      />

      {snackbar ? (
        <View style={styles.snackbarWrap} pointerEvents="none">
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F0F5' },
  container: { flex: 1, backgroundColor: '#F0F0F5' },
  content: { paddingHorizontal: 12, paddingBottom: 24 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F0F5' },
  errorText: { color: colors.textSecondary, fontSize: 16 },
  headerCard: {
    backgroundColor: '#EAEAF0',
    borderRadius: 16,
    paddingTop: 18,
    paddingBottom: 18,
    alignItems: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  backButtonPressed: { opacity: 0.75 },
  editPill: {
    position: 'absolute',
    top: 10,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 12,
    height: 36,
    zIndex: 2,
  },
  editPillPressed: { opacity: 0.82 },
  editPlus: { color: colors.accent, fontWeight: '800', fontSize: 18, marginTop: -1 },
  editText: { color: '#111827', fontSize: 17, fontWeight: '600' },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6D6D',
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarText: { color: '#FFFFFF', fontSize: 42, fontWeight: '700' },
  title: { marginTop: 10, fontSize: 34, lineHeight: 40, color: '#111827', fontWeight: '500' },
  subtitle: { marginTop: 2, color: '#6B7280', fontSize: 16 },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  infoLabel: { fontSize: 15, color: '#4B5563', textTransform: 'lowercase' },
  infoLink: { marginTop: 2, fontSize: 20, color: '#2563EB', fontWeight: '500' },
  infoText: { marginTop: 2, fontSize: 18, lineHeight: 24, color: '#111827' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#D1D5DB', marginVertical: 10 },
  menuCard: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  rowPressed: { backgroundColor: '#F8F9FC' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { color: '#111827', fontSize: 18 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { color: '#6B7280', fontSize: 16, fontWeight: '500' },
  mediaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  mediaSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  mediaEmptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -3,
  },
  mediaTile: {
    width: '33.3333%',
    aspectRatio: 1,
    padding: 3,
  },
  mediaTilePressed: { opacity: 0.88 },
  mediaPlayBadge: {
    position: 'absolute',
    left: 15,
    top: 15,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  mediaPlayIcon: { marginLeft: 2 },
  mediaDurationBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(16,24,40,0.6)',
  },
  mediaDurationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  snackbarWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    backgroundColor: 'rgba(239,246,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  snackbarText: { color: '#1E40AF', textAlign: 'center', fontWeight: '700' },
});
