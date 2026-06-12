import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail, fetchChannelFeed, unsubscribeFromChannel } from '../services/channelService';
import { ChatDao } from '../db';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { buildChannelInviteDeepLink, buildChannelSlugDeepLink, resolveAvatarUrl } from '../config';
import { LoadErrorState } from '../components/LoadErrorState';
import { ChannelUnsubscribeConfirmModal } from '../components/ChannelUnsubscribeConfirmModal';
import { ChatProfileMediaViewerModal } from '../components/ChatProfileMediaViewerModal';
import { MediaTilePreview, type MediaTile } from '../components/ChatProfileMediaSection';
import type { Chat, Message } from '../stores/types';
import { formatMediaDuration } from '../utils/mediaDuration';

type Route = RouteProp<ChatsStackParamList, 'ChannelProfile'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelProfile'>;

const CHANNEL_HERO_SCREEN_W = Dimensions.get('window').width;
const CHANNEL_HERO_COLLAPSED = 88;
const CHANNEL_HERO_EXPANDED_W = CHANNEL_HERO_SCREEN_W - 56;
const CHANNEL_HERO_EXPANDED_H = Math.min(
  Math.max(CHANNEL_HERO_EXPANDED_W * 1.02, 280),
  420,
);

function createChannelProfileStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.chatBackground },
    container: { flex: 1, backgroundColor: c.chatBackground },
    content: { paddingHorizontal: 12, paddingBottom: 24 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chatBackground },
    errorText: { color: c.textSecondary, fontSize: 16 },
    headerCard: {
      backgroundColor: c.inputBackground,
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
      backgroundColor: c.inputBackgroundSolid,
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
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 18,
      paddingHorizontal: 12,
      height: 36,
      zIndex: 2,
    },
    editPillPressed: { opacity: 0.82 },
    editPlus: { color: c.accent, fontWeight: '800', fontSize: 18, marginTop: -1 },
    editText: { color: c.textPrimary, fontSize: 17, fontWeight: '600' },
    avatarPressable: {
      alignSelf: 'center',
    },
    avatarPressablePressed: {
      opacity: 0.92,
    },
    avatarAnimatedWrap: {
      alignSelf: 'center',
    },
    avatarFrame: {
      overflow: 'hidden',
    },
    avatarMedia: {
      width: '100%',
      height: '100%',
    },
    avatarLetterWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#FFFFFF', fontSize: 42, fontWeight: '700' },
    title: { marginTop: 10, fontSize: 34, lineHeight: 40, color: c.textPrimary, fontWeight: '500' },
    subtitle: { marginTop: 2, color: c.textSecondary, fontSize: 16 },
    subscriberToolbar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      marginBottom: 10,
    },
    subscriberToolbarPill: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    subscriberToolbarPillPressed: {
      opacity: 0.88,
    },
    subscriberToolbarPillDisabled: {
      opacity: 0.55,
    },
    subscriberToolbarLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.accent,
      textAlign: 'center',
    },
    infoCard: {
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 10,
    },
    infoLabel: { fontSize: 15, color: c.textSecondary, textTransform: 'lowercase' },
    infoLink: { marginTop: 2, fontSize: 20, color: c.link, fontWeight: '500' },
    infoText: { marginTop: 2, fontSize: 18, lineHeight: 24, color: c.textPrimary },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginVertical: 10 },
    menuCard: { backgroundColor: c.inputBackgroundSolid, borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
    row: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
    },
    rowPressed: { backgroundColor: c.rowPressed },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowTitle: { color: c.textPrimary, fontSize: 18 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowValue: { color: c.textSecondary, fontSize: 16, fontWeight: '500' },
    mediaCard: {
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingTop: 14,
      paddingBottom: 14,
      overflow: 'hidden',
    },
    mediaSectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    mediaEmptyText: {
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
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
      backgroundColor: withAlpha(c.accent, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(c.accent, 0.35),
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: c.accent,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    snackbarText: { color: c.link, textAlign: 'center', fontWeight: '700' },
  });
}

type ChannelProfileStyles = ReturnType<typeof createChannelProfileStyles>;

function Row({
  st,
  accent,
  muted,
  icon,
  title,
  value,
  onPress,
}: {
  st: ChannelProfileStyles;
  accent: string;
  muted: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && st.rowPressed]}>
      <View style={st.rowLeft}>
        <Feather name={icon} size={18} color={accent} />
        <Text style={st.rowTitle}>{title}</Text>
      </View>
      <View style={st.rowRight}>
        {value ? <Text style={st.rowValue}>{value}</Text> : null}
        <Feather name="chevron-right" size={18} color={muted} />
      </View>
    </Pressable>
  );
}

export function ChannelProfileScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelProfileStyles(c), [c]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const currentUserId = authStore((state) => state.user?.id ?? null);
  const channelChat = chatStore((state) => state.chats.find((c) => c.id === channelId) ?? null);
  const [loading, setLoading] = React.useState(!detail);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [snackbar, setSnackbar] = React.useState<string | null>(null);
  const [feedPosts, setFeedPosts] = React.useState<Message[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = React.useState<number | null>(null);
  const [leaveBusy, setLeaveBusy] = React.useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = React.useState(false);
  const [isAvatarExpanded, setIsAvatarExpanded] = React.useState(false);
  const avatarProgress = useSharedValue(0);

  const channelHeroAvatarUrl = React.useMemo(
    () =>
      detail?.channel ? resolveAvatarUrl(detail.channel.avatar_url ?? null) : null,
    [detail?.channel?.avatar_url],
  );

  React.useEffect(() => {
    avatarProgress.value = withSpring(isAvatarExpanded ? 1 : 0, {
      damping: 22,
      stiffness: 185,
      mass: 0.94,
      overshootClamping: true,
    });
  }, [avatarProgress, isAvatarExpanded]);

  React.useEffect(() => {
    if (!channelHeroAvatarUrl) setIsAvatarExpanded(false);
  }, [channelHeroAvatarUrl]);

  const toggleChannelAvatarExpanded = React.useCallback(() => {
    if (!channelHeroAvatarUrl) return;
    setIsAvatarExpanded((prev) => !prev);
  }, [channelHeroAvatarUrl]);

  const heroAvatarGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(Boolean(channelHeroAvatarUrl))
        .maxPointers(1)
        .activeOffsetY(8)
        .failOffsetX([-18, 18])
        .onEnd((event) => {
          if (!channelHeroAvatarUrl) return;

          if (!isAvatarExpanded && event.translationY > 34) {
            runOnJS(setIsAvatarExpanded)(true);
            return;
          }

          if (isAvatarExpanded && event.translationY < -28) {
            runOnJS(setIsAvatarExpanded)(false);
          }
        }),
    [channelHeroAvatarUrl, isAvatarExpanded],
  );

  const heroAvatarFrameStyle = useAnimatedStyle(() => ({
    width: interpolate(
      avatarProgress.value,
      [0, 1],
      [CHANNEL_HERO_COLLAPSED, CHANNEL_HERO_EXPANDED_W],
    ),
    height: interpolate(
      avatarProgress.value,
      [0, 1],
      [CHANNEL_HERO_COLLAPSED, CHANNEL_HERO_EXPANDED_H],
    ),
    borderRadius: interpolate(avatarProgress.value, [0, 1], [44, 14]),
  }));

  const heroAvatarMarginStyle = useAnimatedStyle(() => ({
    marginBottom: interpolate(avatarProgress.value, [0, 1], [10, 14]),
  }));

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
      feedPosts.flatMap((m) => {
        if (m.is_deleted === 1 || (m.msg_type !== 'image' && m.msg_type !== 'video')) {
          return [];
        }
        const entries = (m.media ?? []).filter((x) => x.remote_url?.trim());
        if (entries.length === 0) return [];
        const caption = typeof m.content === 'string' ? m.content.trim() : '';
        const captionOpt = caption.length > 0 ? caption : undefined;
        return entries
          .map((mediaItem, idx): MediaTile | null => {
            const uri = resolveAvatarUrl(mediaItem.remote_url?.trim() ?? null) ?? '';
            if (!uri) return null;
            const mt = (mediaItem.media_type ?? '').toLowerCase();
            const kind: 'image' | 'video' =
              mt === 'video' ? 'video' : mt === 'image' ? 'image' : m.msg_type === 'video' ? 'video' : 'image';
            const thumbnailUri = resolveAvatarUrl(mediaItem.thumbnail_url ?? null);
            return {
              id: `${m.id}:${idx}`,
              kind,
              uri,
              previewUri:
                kind === 'video'
                  ? thumbnailUri ?? undefined
                  : thumbnailUri || uri,
              durationMs: kind === 'video' ? mediaItem.duration_ms ?? 0 : undefined,
              caption: captionOpt,
            } satisfies MediaTile;
          })
          .filter((item): item is MediaTile => item != null);
      }),
    [feedPosts],
  );

  React.useEffect(() => {
    if (selectedMediaIndex != null && selectedMediaIndex >= channelMediaItems.length) {
      setSelectedMediaIndex(null);
    }
  }, [channelMediaItems.length, selectedMediaIndex]);

  const showSubscriberToolbar = React.useMemo(() => {
    if (!detail?.is_subscribed) return false;
    if (detail.channel_permissions?.can_edit_channel) return false;
    if (detail.can_post) return false;
    const me = detail.channel.members?.find((m) => m.user_id === currentUserId);
    if (me?.role === 'owner' || me?.role === 'admin') return false;
    return true;
  }, [detail, currentUserId]);

  const isChannelNotificationsMuted = React.useMemo(() => {
    const muted = channelChat?.is_muted ?? detail?.channel?.is_muted ?? 0;
    return muted === 1;
  }, [channelChat?.is_muted, detail?.channel?.is_muted]);

  const handleToggleChannelMute = React.useCallback(() => {
    const base = channelChat ?? detail?.channel;
    if (!base) return;
    const next: Chat = {
      ...base,
      is_muted: isChannelNotificationsMuted ? 0 : 1,
      updated_at: Date.now(),
    };
    chatStore.getState().addOrUpdateChat(next);
    void new ChatDao()
      .update({
        id: next.id,
        is_muted: next.is_muted,
        updated_at: next.updated_at,
      })
      .catch(() => {
        /* чат мог ещё не попасть в локальную БД */
      });
  }, [channelChat, detail?.channel, isChannelNotificationsMuted]);

  const handleLeaveChannelPress = React.useCallback(() => {
    setLeaveConfirmVisible(true);
  }, []);

  const handleConfirmLeaveChannel = React.useCallback(() => {
    void (async () => {
      setLeaveBusy(true);
      try {
        await unsubscribeFromChannel(channelId);
        chatStore.getState().removeChat(channelId);
        channelStore.setState((state) => {
          const detailsById = { ...state.detailsById };
          delete detailsById[channelId];
          const feedByChannelId = { ...state.feedByChannelId };
          delete feedByChannelId[channelId];
          const catalog = state.catalog.filter((c) => c.id !== channelId);
          return { detailsById, feedByChannelId, catalog };
        });
        setLeaveConfirmVisible(false);
        navigation.goBack();
      } catch (e) {
        setLeaveConfirmVisible(false);
        Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось покинуть канал');
      } finally {
        setLeaveBusy(false);
      }
    })();
  }, [channelId, navigation]);

  if (loading && !detail) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={c.accent} />
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
  const inviteDeepLink = channel.invite_token
    ? buildChannelInviteDeepLink(channel.invite_token)
    : null;
  const publicDeepLink =
    channel.visibility === 'public' && channel.slug?.trim()
      ? buildChannelSlugDeepLink(channel.slug.trim())
      : null;
  const description = channel.description?.trim() || 'Описание не указано';

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
            <Feather name="chevron-left" size={24} color={c.textPrimary} />
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

          <GestureDetector gesture={heroAvatarGesture}>
            <Pressable
              onPress={toggleChannelAvatarExpanded}
              disabled={!channelHeroAvatarUrl}
              style={({ pressed }) => [
                styles.avatarPressable,
                channelHeroAvatarUrl && pressed && styles.avatarPressablePressed,
              ]}
            >
              <Reanimated.View style={[styles.avatarAnimatedWrap, heroAvatarMarginStyle]}>
                <Reanimated.View
                  style={[
                    styles.avatarFrame,
                    heroAvatarFrameStyle,
                    !channelHeroAvatarUrl ? { backgroundColor: c.accent } : null,
                  ]}
                >
                  {channelHeroAvatarUrl ? (
                    <Image
                      source={{ uri: channelHeroAvatarUrl }}
                      style={styles.avatarMedia}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                  ) : (
                    <View style={styles.avatarLetterWrap}>
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                  )}
                </Reanimated.View>
              </Reanimated.View>
            </Pressable>
          </GestureDetector>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{channel.subscriber_count ?? 0} подписчиков</Text>
        </View>

        {showSubscriberToolbar ? (
          <View style={styles.subscriberToolbar}>
            <Pressable
              onPress={() => handleToggleChannelMute()}
              style={({ pressed }) => [
                styles.subscriberToolbarPill,
                pressed && styles.subscriberToolbarPillPressed,
              ]}
            >
              <Feather
                name={isChannelNotificationsMuted ? 'bell' : 'bell-off'}
                size={22}
                color={c.accent}
              />
              <Text style={styles.subscriberToolbarLabel}>
                {isChannelNotificationsMuted ? 'Звук' : 'Без звука'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleLeaveChannelPress()}
              disabled={leaveBusy}
              style={({ pressed }) => [
                styles.subscriberToolbarPill,
                pressed && styles.subscriberToolbarPillPressed,
                leaveBusy && styles.subscriberToolbarPillDisabled,
              ]}
            >
              {leaveBusy ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <Feather name="log-out" size={22} color={c.accent} />
              )}
              <Text style={styles.subscriberToolbarLabel}>Покинуть</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.infoCard}>
          {publicDeepLink ? (
            <>
              <Text style={styles.infoLabel}>ссылка</Text>
              <Text style={styles.infoLink} selectable>
                {publicDeepLink}
              </Text>
              <View style={styles.divider} />
            </>
          ) : null}
          {channel.visibility === 'private' && inviteDeepLink ? (
            <>
              <Text style={styles.infoLabel}>приглашение</Text>
              <Text style={styles.infoLink} selectable>
                {inviteDeepLink}
              </Text>
              <View style={styles.divider} />
            </>
          ) : null}
          <Text style={styles.infoLabel}>описание</Text>
          <Text style={styles.infoText}>{description}</Text>
        </View>

        {showManagementMenu ? (
          <View style={styles.menuCard}>
            <Row
              st={styles}
              accent={c.accent}
              muted={c.textSecondary}
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
              st={styles}
              accent={c.accent}
              muted={c.textSecondary}
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
              st={styles}
              accent={c.accent}
              muted={c.textSecondary}
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
                  <MediaTilePreview item={item} peerFirstLineId={channelId} />
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

      <ChannelUnsubscribeConfirmModal
        visible={leaveConfirmVisible}
        channelName={title}
        busy={leaveBusy}
        onCancel={() => {
          if (!leaveBusy) setLeaveConfirmVisible(false);
        }}
        onConfirmLeave={handleConfirmLeaveChannel}
      />

      {snackbar ? (
        <View style={styles.snackbarWrap} pointerEvents="none">
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      ) : null}
    </View>
  );
}
