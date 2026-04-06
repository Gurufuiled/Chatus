import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatProfileHero } from '../components/ChatProfileHero';
import type {
  AnchoredMenuState,
  AnchoredPopoverMenuItem,
} from '../components/AnchoredPopoverMenu';
import { ChatThemePickerModal } from '../components/ChatThemePickerModal';
import {
  ChatProfileMediaSection,
  type FileItem,
  type LinkItem,
  type MediaTile,
  type ProfileTabKey,
  type VoiceItem,
} from '../components/ChatProfileMediaSection';
import { ChatProfileOverlayLayer } from '../components/ChatProfileOverlayLayer';
import { API_BASE_URL, resolveAvatarUrl } from '../config';
import { useCall } from '../contexts/CallContext';
import { ChatDao } from '../db';
import type { ChatsStackParamList } from '../navigation/types';
import type { ApiUser } from '../services/AuthService';
import { getUserProfile } from '../services/profileService';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import type { Message } from '../stores/types';
import { uiStore } from '../stores/uiStore';
import { colors } from '../theme/colors';
import { DEFAULT_CHAT_THEME_ID, type ChatThemeId } from '../theme/chatThemes';

type ChatProfileRoute = RouteProp<ChatsStackParamList, 'ChatProfile'>;
type ChatProfileNavigation = NativeStackNavigationProp<ChatsStackParamList, 'ChatProfile'>;
const EMPTY_PROFILE_MESSAGES: Message[] = [];

type InfoRow = {
  id: string;
  label: string;
  value: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
};

type ProfileActionMenuState = {
  messageId: string;
  top: number;
  left: number;
} | null;

const AVATAR_COLORS = [
  '#5B8DEF',
  '#53B7A8',
  '#F2994A',
  '#BB6BD9',
  '#EB5757',
  '#2D9CDB',
  '#27AE60',
  '#F2C94C',
];

const PROFILE_SCREEN_WIDTH = Dimensions.get('window').width;

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatPresence(isOnline?: boolean, lastSeen?: number | null) {
  if (isOnline) return 'в сети';
  if (lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

function buildDisplayName(profile: ApiUser | null, fallbackTitle: string) {
  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    fallbackTitle ||
    'Профиль'
  );
}

function formatMessageDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function extractMediaUri(message: Message): string | null {
  const media = message.media?.[0];
  const candidates = [media?.thumbnail_url, media?.remote_url, message.content];

  for (const candidate of candidates) {
    const resolved = resolveAvatarUrl(candidate ?? null);
    if (resolved) return resolved;
  }

  return null;
}

function extractLinks(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = content.match(/https?:\/\/[^\s]+/gi) ?? [];
  return matches.filter(isExternalLinkCandidate);
}

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
}

function isExternalLinkCandidate(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (!hostname) return false;
    if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) {
      return false;
    }
    if (isPrivateIpv4(hostname)) {
      return false;
    }
    if (url.pathname.startsWith('/uploads/')) {
      return false;
    }

    try {
      const apiHost = new URL(API_BASE_URL).hostname.toLowerCase();
      if (hostname === apiHost) {
        return false;
      }
    } catch {
      // Ignore API url parse issues and keep external candidate check.
    }

    return true;
  } catch {
    return false;
  }
}

function buildFileSubtitle(message: Message) {
  const media = message.media?.[0];
  const sizePart = formatFileSize(media?.file_size ?? undefined);
  const datePart = formatMessageDate(message.created_at);
  return sizePart ? `${sizePart} • ${datePart}` : datePart;
}

function buildInfoRows(profile: ApiUser | null): InfoRow[] {
  const rows: InfoRow[] = [];

  if (profile?.phone?.trim()) {
    rows.push({
      id: 'phone',
      label: 'Мобильный',
      value: profile.phone.trim(),
      icon: 'phone',
    });
  }

  if (profile?.handle?.trim() || profile?.username?.trim()) {
    rows.push({
      id: 'username',
      label: 'Имя пользователя',
      value: profile?.handle?.trim()
        ? `@${profile.handle.trim()}`
        : profile?.username?.trim() || 'Не указано',
      icon: 'at-sign',
    });
  }

  return rows;
}

function getFileExtension(fileName: string) {
  const ext = fileName.split('.').pop()?.trim() ?? '';
  if (!ext || ext === fileName) return 'FILE';
  return ext.slice(0, 4).toUpperCase();
}

type ProfileInfoCardProps = {
  infoRows: InfoRow[];
};

const ProfileInfoCard = React.memo(function ProfileInfoCard({
  infoRows,
}: ProfileInfoCardProps) {
  if (infoRows.length === 0) return null;

  return (
    <View style={styles.infoCard}>
      {infoRows.map((row, index) => (
        <View key={row.id}>
          <View style={styles.infoRow}>
            <View style={styles.infoRowTextWrap}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
            {row.icon ? (
              <View style={styles.infoIconWrap}>
                <Feather name={row.icon} size={16} color={colors.accent} />
              </View>
            ) : null}
          </View>
          {index !== infoRows.length - 1 ? <View style={styles.infoDivider} /> : null}
        </View>
      ))}
    </View>
  );
});

export function ChatProfileScreen() {
  const navigation = useNavigation<ChatProfileNavigation>();
  const route = useRoute<ChatProfileRoute>();
  const { chatId, userId, chatTitle } = route.params;
  const { startCall } = useCall();
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('media');
  const [selectedMediaUri, setSelectedMediaUri] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<ProfileActionMenuState>(null);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);
  const [moreMenu, setMoreMenu] = useState<AnchoredMenuState>(null);
  const [isThemePickerVisible, setIsThemePickerVisible] = useState(false);
  const [draftThemeId, setDraftThemeId] = useState<ChatThemeId>(DEFAULT_CHAT_THEME_ID);
  const actionMenuAnimation = useRef(new Animated.Value(0)).current;
  const moreMenuAnimation = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const moreButtonRef = useRef<View | null>(null);

  const chat = chatStore(
    useCallback(
      (state) => state.chats.find((item) => item.id === chatId) ?? null,
      [chatId]
    )
  );
  const chatMessages = messageStore(
    useCallback(
      (state) => state.messagesByChatId[chatId] ?? EMPTY_PROFILE_MESSAGES,
      [chatId]
    )
  );
  const livePresence = uiStore((s) => s.presenceByUserId[userId]);
  const isBlocked = uiStore((s) => Boolean(s.blockedUserIds[userId]));
  const currentThemeId = uiStore(
    (s) => (s.chatThemeIdByChatId[chatId] as ChatThemeId | undefined) ?? DEFAULT_CHAT_THEME_ID
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getUserProfile(userId);
        if (!isMounted) return;
        setProfile(data);
      } catch (e) {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    void uiStore.getState().hydrateBlockedUsers();
  }, []);

  useEffect(() => {
    if (!isThemePickerVisible) {
      setDraftThemeId(currentThemeId);
    }
  }, [currentThemeId, isThemePickerVisible]);

  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      if (value > 24 && isHeroExpanded) {
        setIsHeroExpanded(false);
      }
    });

    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [isHeroExpanded, scrollY]);

  const displayName = buildDisplayName(
    profile,
    chatTitle ?? chat?.peer_display_name ?? chat?.name ?? ''
  );
  const handleLabel = profile?.handle?.trim() ? `@${profile.handle.trim()}` : null;
  const avatarUrl = resolveAvatarUrl(profile?.avatar_url ?? chat?.avatar_url);
  const statusLabel = formatPresence(
    livePresence?.is_online ?? profile?.is_online,
    livePresence?.last_seen ?? profile?.last_seen
  );
  const avatarColor = useMemo(() => getAvatarColor(displayName), [displayName]);
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const isMuted = (chat?.is_muted ?? 0) === 1;
  const infoRows = useMemo(() => buildInfoRows(profile), [profile]);
  const expandedHeroWidth = PROFILE_SCREEN_WIDTH;
  const expandedHeroHeight = Math.min(Math.max(PROFILE_SCREEN_WIDTH * 0.92, 280), 360);

  const mediaItems = useMemo<MediaTile[]>(
    () =>
      chatMessages
        .filter(
          (message) =>
            !message.is_deleted &&
            (message.msg_type === 'image' || message.msg_type === 'video_note')
        )
        .map((message) => ({
          id: message.id,
          uri: extractMediaUri(message) ?? '',
          durationMs:
            message.msg_type === 'video_note'
              ? message.media?.[0]?.duration_ms ?? 0
              : undefined,
        }))
        .filter((item) => item.uri.length > 0),
    [chatMessages]
  );

  const fileItems = useMemo<FileItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'file')
        .map((message) => ({
          id: message.id,
          title: message.media?.[0]?.file_name || 'Файл',
          subtitle: buildFileSubtitle(message),
          uri: extractMediaUri(message),
          extension: getFileExtension(message.media?.[0]?.file_name || 'FILE'),
        })),
    [chatMessages]
  );

  const voiceItems = useMemo<VoiceItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'voice')
        .map((message) => ({
          id: message.id,
          uri: extractMediaUri(message),
          durationMs: message.media?.[0]?.duration_ms ?? 0,
          waveform: message.media?.[0]?.waveform ?? [],
          dateLabel: formatMessageDate(message.created_at),
        })),
    [chatMessages]
  );

  const linkItems = useMemo<LinkItem[]>(
    () =>
      chatMessages.flatMap((message) =>
        message.is_deleted
          ? []
          :
        extractLinks(message.content).map((link, index) => ({
          id: `${message.id}-${index}`,
          title: link.replace(/^https?:\/\//, ''),
          subtitle: formatMessageDate(message.created_at),
          uri: link,
        }))
      ),
    [chatMessages]
  );

  const handleMutePress = useCallback(() => {
    if (!chat) return;
    chatStore.getState().updateChat({
      ...chat,
      is_muted: isMuted ? 0 : 1,
    });
  }, [chat, isMuted]);

  const handleSearchPress = useCallback(() => {
    navigation.navigate('Chat', {
      chatId,
      chatTitle,
      startSearch: true,
    });
  }, [chatId, chatTitle, navigation]);

  const handleStartCallPress = useCallback(async () => {
    try {
      await startCall({
        userId,
        displayName,
        avatarUrl,
        chatId,
      });
    } catch (error) {
      Alert.alert(
        'Не удалось начать звонок',
        error instanceof Error ? error.message : 'Попробуй еще раз чуть позже.'
      );
    }
  }, [avatarUrl, chatId, displayName, startCall, userId]);

  const openMoreMenu = useCallback(() => {
    const target = moreButtonRef.current;
    if (!target) return;

    target.measureInWindow((left, top, width, height) => {
      moreMenuAnimation.setValue(0);
      setMoreMenu({ left, top, width, height });
    });
  }, [moreMenuAnimation]);

  const closeMoreMenu = useCallback(
    (onClosed?: unknown) => {
      const callback = typeof onClosed === 'function' ? onClosed : undefined;
      if (!moreMenu) {
        callback?.();
        return;
      }

      Animated.timing(moreMenuAnimation, {
        toValue: 0,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setMoreMenu(null);
        callback?.();
      });
    },
    [moreMenu, moreMenuAnimation]
  );

  const handleMorePress = useCallback(() => {
    openMoreMenu();
  }, [openMoreMenu]);

  const openThemePicker = useCallback(() => {
    closeMoreMenu(() => {
      setDraftThemeId(currentThemeId);
      setIsThemePickerVisible(true);
    });
  }, [closeMoreMenu, currentThemeId]);

  const handleApplyTheme = useCallback(() => {
    uiStore.getState().setChatTheme(chatId, draftThemeId);
    setIsThemePickerVisible(false);
  }, [chatId, draftThemeId]);

  const handleToggleBlocked = useCallback(() => {
    closeMoreMenu();
    const nextBlocked = !isBlocked;
    uiStore.getState().setUserBlocked(userId, nextBlocked);
    Alert.alert(
      nextBlocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован',
        nextBlocked
          ? `Локально заблокировали ${displayName}. Это состояние пока работает только на этом устройстве.`
          : `${displayName} снова доступен на этом устройстве.`
      );
  }, [closeMoreMenu, displayName, isBlocked, userId]);

  const deleteChatLocally = useCallback(async () => {
    try {
      await new ChatDao().delete(chatId);
      messageStore.getState().clearMessages(chatId);
      chatStore.getState().removeChat(chatId);
      navigation.navigate('ChatList');
    } catch {
      Alert.alert('Не удалось удалить чат', 'Попробуй еще раз чуть позже.');
    }
  }, [chatId, navigation]);

  const handleDeleteChatPress = useCallback(() => {
    closeMoreMenu();
    Alert.alert('Удалить чат?', 'Выбери, как удалить этот диалог.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: `Удалить у меня и у ${displayName}`,
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Пока недоступно',
            'Этот вариант потребует отдельного серверного удаления чата для обоих участников. Сейчас можно удалить чат только локально у себя.'
          );
        },
      },
      {
        text: 'Удалить у меня',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Удалить только у тебя?', 'Чат исчезнет только на этом устройстве.', [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Удалить',
              style: 'destructive',
              onPress: () => {
                void deleteChatLocally();
              },
            },
          ]);
        },
      },
    ]);
  }, [closeMoreMenu, deleteChatLocally, displayName]);

  const toggleHeroExpanded = useCallback(() => {
    if (!avatarUrl) return;
    setIsHeroExpanded((current) => !current);
  }, [avatarUrl]);

  const closeActionMenu = useCallback(
    (onClosed?: () => void) => {
      if (!actionMenu) {
        onClosed?.();
        return;
      }

      Animated.timing(actionMenuAnimation, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        setActionMenu(null);
        onClosed?.();
      });
    },
    [actionMenu, actionMenuAnimation]
  );

  const handleShowInChat = (messageId: string) => {
    closeActionMenu(() => {
      navigation.navigate('Chat', {
        chatId,
        chatTitle,
        focusMessageId: messageId,
      });
    });
  };

  const openActionMenu = useCallback((messageId: string, event: GestureResponderEvent) => {
    const menuWidth = 176;
    const estimatedHeight = 44;
    const sideGap = 12;
    const left = Math.max(
      sideGap,
      Math.min(
        event.nativeEvent.pageX - menuWidth / 2,
        PROFILE_SCREEN_WIDTH - menuWidth - sideGap
      )
    );
    const top = Math.max(92, event.nativeEvent.pageY - estimatedHeight - 14);
    actionMenuAnimation.setValue(0);
    setActionMenu({
      messageId,
      top,
      left,
    });
  }, [actionMenuAnimation]);

  useEffect(() => {
    if (!actionMenu) return;

    Animated.spring(actionMenuAnimation, {
      toValue: 1,
      damping: 18,
      mass: 0.8,
      stiffness: 240,
      useNativeDriver: true,
    }).start();
  }, [actionMenu, actionMenuAnimation]);

  useEffect(() => {
    if (!moreMenu) return;

    Animated.spring(moreMenuAnimation, {
      toValue: 1,
      damping: 17,
      stiffness: 230,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [moreMenu, moreMenuAnimation]);

  const moreMenuItems = useMemo<AnchoredPopoverMenuItem[]>(
    () => [
      {
        key: 'change-wallpaper',
        label: 'Изменить обои',
        icon: 'feather',
        color: '#2AA04F',
      },
      {
        key: 'toggle-block',
        label: isBlocked ? 'Разблокировать' : 'Заблокировать',
        icon: 'slash',
        color: isBlocked ? '#64748B' : '#F97316',
      },
      {
        key: 'delete-chat',
        label: 'Удалить чат',
        icon: 'trash-2',
        color: '#D04857',
      },
    ],
    [isBlocked]
  );

  const handleMoreMenuAction = useCallback(
    (key: string) => {
      if (key === 'change-wallpaper') {
        openThemePicker();
        return;
      }

      if (key === 'toggle-block') {
        handleToggleBlocked();
        return;
      }

      if (key === 'delete-chat') {
        handleDeleteChatPress();
      }
    },
    [handleDeleteChatPress, handleToggleBlocked, openThemePicker]
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <Animated.ScrollView
        bounces
        overScrollMode="always"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        contentContainerStyle={styles.scrollContent}
      >
        <ChatProfileHero
          avatarUrl={avatarUrl}
          avatarColor={avatarColor}
          initial={initial}
          displayName={displayName}
          statusLabel={statusLabel}
          handleLabel={handleLabel}
          loading={loading}
          error={error}
          isMuted={isMuted}
          isExpanded={isHeroExpanded}
          expandedHeroWidth={expandedHeroWidth}
          expandedHeroHeight={expandedHeroHeight}
          onToggleHeroExpanded={toggleHeroExpanded}
          onStartCallPress={handleStartCallPress}
          onMutePress={handleMutePress}
          onSearchPress={handleSearchPress}
          onMorePress={handleMorePress}
          moreButtonRef={moreButtonRef}
        />

        <ProfileInfoCard infoRows={infoRows} />

        <ChatProfileMediaSection
          activeTab={activeTab}
          mediaItems={mediaItems}
          fileItems={fileItems}
          voiceItems={voiceItems}
          linkItems={linkItems}
          onChangeTab={setActiveTab}
          onOpenMedia={setSelectedMediaUri}
          onOpenActionMenu={openActionMenu}
        />
      </Animated.ScrollView>
      <ChatProfileOverlayLayer
        moreMenu={moreMenu}
        moreMenuAnimation={moreMenuAnimation}
        moreMenuItems={moreMenuItems}
        onCloseMoreMenu={closeMoreMenu}
        onMoreMenuAction={handleMoreMenuAction}
        selectedMediaUri={selectedMediaUri}
        onCloseMedia={() => setSelectedMediaUri(null)}
        actionMenu={actionMenu}
        actionMenuAnimation={actionMenuAnimation}
        onCloseActionMenu={() => closeActionMenu()}
        onShowInChat={handleShowInChat}
      />
      <ChatThemePickerModal
        visible={isThemePickerVisible}
        selectedThemeId={draftThemeId}
        onSelectTheme={setDraftThemeId}
        onApply={handleApplyTheme}
        onClose={() => setIsThemePickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F7FC',
  },
  scrollContent: {
    paddingBottom: 28,
  },
  infoCard: {
    marginTop: 10,
    marginHorizontal: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  infoRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoRowTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.1)',
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E1E6EF',
  },
});
