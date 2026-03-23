import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatDao } from '../db';
import { useCall } from '../contexts/CallContext';
import { useVoicePlayer } from '../contexts/VoicePlayerContext';
import { resolveAvatarUrl } from '../config';
import type { ChatsStackParamList } from '../navigation/types';
import type { ApiUser } from '../services/AuthService';
import { getUserProfile } from '../services/profileService';
import { buildUiWaveform } from '../services/waveformUtils';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import { uiStore } from '../stores/uiStore';
import type { Message } from '../stores/types';
import { colors } from '../theme/colors';

type ChatProfileRoute = RouteProp<ChatsStackParamList, 'ChatProfile'>;
type ChatProfileNavigation = NativeStackNavigationProp<ChatsStackParamList, 'ChatProfile'>;
type ProfileTabKey = 'media' | 'files' | 'voice' | 'links';

type MediaTile = {
  id: string;
  uri: string;
  durationMs?: number;
};

type FileItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string | null;
  extension: string;
};

type VoiceItem = {
  id: string;
  uri: string | null;
  durationMs: number;
  waveform: number[];
  dateLabel: string;
};

type LinkItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string;
};

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

const TAB_LABELS: Record<ProfileTabKey, string> = {
  media: 'Медиа',
  files: 'Файлы',
  voice: 'Голосовые',
  links: 'Ссылки',
};
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

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  const matches = content.match(/https?:\/\/[^\s]+/gi);
  return matches ?? [];
}

function buildVoiceSubtitle(message: Message) {
  const durationMs = message.media?.[0]?.duration_ms ?? 0;
  return `${formatDuration(durationMs)} • ${formatMessageDate(message.created_at)}`;
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

function sanitizePhoneForDial(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) return '';

  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  return hasLeadingPlus ? `+${digits}` : digits;
}

function buildVoicePreviewBars(waveform: number[]) {
  const base =
    waveform.length > 0
      ? buildUiWaveform(waveform, 28)
      : buildUiWaveform([0.22, 0.34, 0.58, 0.41, 0.27, 0.49, 0.31], 28);
  return base.map((value) => 4 + Math.pow(value, 1.15) * 16);
}

type QuickActionButtonProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
};

function QuickActionButton({
  icon,
  label,
  active = false,
  onPress,
}: QuickActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
    >
      <View style={[styles.quickActionIconWrap, active && styles.quickActionIconWrapActive]}>
        <Feather name={icon} size={18} color={active ? '#FFFFFF' : colors.accent} />
      </View>
      <Text style={[styles.quickActionLabel, active && styles.quickActionLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FileRow({
  item,
  onOpenMenu,
}: {
  item: FileItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const handlePress = () => {
    if (!item.uri) {
      Alert.alert('Файл недоступен', 'У этого файла пока нет ссылки для открытия.');
      return;
    }
    void Linking.openURL(item.uri).catch(() => {
      Alert.alert('Не удалось открыть файл', 'Проверь ссылку или попробуй позже.');
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={(event) => onOpenMenu(item.id, event)}
      delayLongPress={220}
      style={({ pressed }) => [styles.fileRow, pressed && styles.fileRowPressed]}
    >
      <View style={styles.fileBadge}>
        <Text style={styles.fileBadgeText}>{item.extension}</Text>
      </View>
      <View style={styles.fileTextWrap}>
        <Text style={styles.fileTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.fileSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color="#A6AFBC" />
    </Pressable>
  );
}

function VoiceRow({
  item,
  onOpenMenu,
}: {
  item: VoiceItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const { play, pause, currentVoiceUri, status } = useVoicePlayer();
  const isCurrent = currentVoiceUri === item.uri;
  const isPlaying = isCurrent && status.isPlaying;
  const bars = useMemo(() => buildVoicePreviewBars(item.waveform), [item.waveform]);
  const progress =
    isCurrent && status.durationMs > 0 ? status.positionMs / status.durationMs : 0;
  const effectiveDurationMs =
    isCurrent && item.durationMs > 0
      ? Math.max(item.durationMs - status.positionMs, 0)
      : item.durationMs;

  const handlePlayPress = async () => {
    if (!item.uri) {
      Alert.alert('Голосовое недоступно', 'У этого сообщения пока нет ссылки для воспроизведения.');
      return;
    }
    try {
      if (isPlaying) {
        await pause();
      } else {
        await play(item.uri);
      }
    } catch {
      Alert.alert('Не удалось воспроизвести', 'Попробуй еще раз чуть позже.');
    }
  };

  return (
    <Pressable
      onLongPress={(event) => onOpenMenu(item.id, event)}
      delayLongPress={220}
      style={styles.voiceRow}
    >
      <Pressable
        onPress={() => {
          void handlePlayPress();
        }}
        style={({ pressed }) => [
          styles.voicePlayButton,
          isPlaying && styles.voicePlayButtonActive,
          pressed && styles.voicePlayButtonPressed,
        ]}
      >
        <Feather
          name={isPlaying ? 'pause' : 'play'}
          size={16}
          color="#FFFFFF"
          style={!isPlaying ? styles.voicePlayIcon : undefined}
        />
      </Pressable>

      <View style={styles.voiceWaveWrap}>
        <View style={styles.voiceWaveTrack}>
          {bars.map((height, index) => {
            const isFilled = progress > 0 && index / bars.length <= progress;
            return (
              <View
                key={`${item.id}-${index}`}
                style={[
                  styles.voiceBar,
                  {
                    height,
                    backgroundColor: isFilled ? colors.accent : 'rgba(77,141,255,0.24)',
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.voiceMetaRow}>
          <Text style={styles.voiceDuration}>{formatDuration(effectiveDurationMs)}</Text>
          <Text style={styles.voiceDate}>{item.dateLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function LinkRow({
  item,
  onOpenMenu,
}: {
  item: LinkItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const handlePress = () => {
    void Linking.openURL(item.uri).catch(() => {
      Alert.alert('Не удалось открыть ссылку', 'Попробуй еще раз чуть позже.');
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={(event) => onOpenMenu(item.id.split('-')[0] ?? item.id, event)}
      delayLongPress={220}
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <View style={styles.linkIconWrap}>
        <Feather name="link" size={17} color={colors.accent} />
      </View>
      <View style={styles.linkTextWrap}>
        <Text style={styles.linkTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.linkSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Feather name="external-link" size={16} color="#A6AFBC" />
    </Pressable>
  );
}

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
  const [isMoreMenuVisible, setIsMoreMenuVisible] = useState(false);
  const actionMenuAnimation = useRef(new Animated.Value(0)).current;
  const heroAnimation = useRef(new Animated.Value(0)).current;

  const chats = useSyncExternalStore(
    (onStoreChange) => chatStore.subscribe(onStoreChange),
    () => chatStore.getState().chats,
    () => []
  );
  const messagesByChatId = useSyncExternalStore(
    (onStoreChange) => messageStore.subscribe(onStoreChange),
    () => messageStore.getState().messagesByChatId,
    () => ({})
  );
  const livePresence = uiStore((s) => s.presenceByUserId[userId]);
  const isBlocked = uiStore((s) => Boolean(s.blockedUserIds[userId]));

  const chat = chats.find((item) => item.id === chatId) ?? null;
  const chatMessages = messagesByChatId[chatId] ?? [];

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
    heroAnimation.stopAnimation();
    Animated.timing(heroAnimation, {
      toValue: isHeroExpanded ? 1 : 0,
      duration: isHeroExpanded ? 320 : 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
      isInteraction: false,
    }).start();
  }, [heroAnimation, isHeroExpanded]);

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
  const heroCardStyle: Animated.WithAnimatedObject<ViewStyle> = {
    paddingTop: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [24, 0],
    }),
    paddingBottom: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [18, 24],
    }),
  };
  const heroAvatarStyle: Animated.WithAnimatedObject<ImageStyle> = {
    width: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [108, expandedHeroWidth],
    }),
    height: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [108, expandedHeroHeight],
    }),
    borderRadius: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [54, 0],
    }),
    marginBottom: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [14, 18],
    }),
    borderWidth: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [3, 0],
    }),
  };
  const heroContentStyle: Animated.WithAnimatedObject<ViewStyle> = {
    paddingHorizontal: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [16, 18],
    }),
  };
  const heroActionsStyle: Animated.WithAnimatedObject<ViewStyle> = {
    marginTop: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 16],
    }),
  };

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
        extractLinks(message.content).map((link, index) => ({
          id: `${message.id}-${index}`,
          title: link.replace(/^https?:\/\//, ''),
          subtitle: formatMessageDate(message.created_at),
          uri: link,
        }))
      ),
    [chatMessages]
  );

  const tabCounts = {
    media: mediaItems.length,
    files: fileItems.length,
    voice: voiceItems.length,
    links: linkItems.length,
  };

  const handlePhoneCallPress = async () => {
    const phone = profile?.phone?.trim() ?? '';
    const dialNumber = sanitizePhoneForDial(phone);

    if (!dialNumber) {
      Alert.alert('Нет номера', 'У этого пользователя пока нет номера для звонка.');
      return;
    }

    const url = Platform.OS === 'ios' ? `telprompt:${dialNumber}` : `tel:${dialNumber}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Не удалось открыть звонок', 'Устройство не смогло открыть экран вызова.');
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert('Не удалось открыть звонок', 'Попробуй еще раз чуть позже.');
    }
  };

  const handleCallPress = () => {
    Alert.alert('Звонок', 'Когда появится звонок, эту кнопку можно будет привязать к audio call.');
  };

  const handleVideoPress = () => {
    Alert.alert('Видео', 'Здесь позже можно открыть видео-звонок или видео-профиль пользователя.');
  };

  const handleStartCallPress = async () => {
    await startCall({
      userId,
      chatId,
      displayName,
      avatarUrl,
    });
  };

  const handleSearchPressLegacy = () => {
    Alert.alert(
      'Поиск по чату',
      'Следующим шагом сюда можно привязать поиск сообщений прямо внутри этого диалога.'
    );
  };

  const handleMutePress = () => {
    if (!chat) return;
    chatStore.getState().updateChat({
      ...chat,
      is_muted: isMuted ? 0 : 1,
    });
  };

  const handleSearchPress = () => {
    navigation.navigate('Chat', {
      chatId,
      chatTitle,
      startSearch: true,
    });
  };

  const handleMorePressLegacy = () => {
    Alert.alert(
      'Скоро здесь',
      'В этот раздел можно вынести действия вроде "Заблокировать", "Очистить историю" и "Удалить чат".'
    );
  };

  const handleMorePress = () => {
    setIsMoreMenuVisible(true);
  };

  const closeMoreMenu = () => {
    setIsMoreMenuVisible(false);
  };

  const handleToggleBlocked = () => {
    closeMoreMenu();
    const nextBlocked = !isBlocked;
    uiStore.getState().setUserBlocked(userId, nextBlocked);
    Alert.alert(
      nextBlocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован',
      nextBlocked
        ? `Локально заблокировали ${displayName}. Это состояние пока работает только на этом устройстве.`
        : `${displayName} снова доступен на этом устройстве.`
    );
  };

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

  const handleDeleteChatPress = () => {
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
  };

  const toggleHeroExpanded = () => {
    if (!avatarUrl) return;
    setIsHeroExpanded((current) => !current);
  };

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

  const openActionMenu = (messageId: string, event: GestureResponderEvent) => {
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
  };

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

  const actionMenuBackdropOpacity = actionMenuAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const actionMenuCardStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: actionMenuAnimation,
    transform: [
      {
        translateY: actionMenuAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
      {
        scale: actionMenuAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };

  const renderTabContent = () => {
    if (activeTab === 'media') {
      if (mediaItems.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Пока нет медиа</Text>
            <Text style={styles.emptySubtitle}>
              Фото и видеосообщения из чата появятся здесь.
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.mediaGrid}>
          {mediaItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setSelectedMediaUri(item.uri)}
              onLongPress={(event) => openActionMenu(item.id, event)}
              delayLongPress={220}
              style={({ pressed }) => [styles.mediaTile, pressed && styles.mediaTilePressed]}
            >
              <Image source={{ uri: item.uri }} style={styles.mediaImage} />
              {item.durationMs ? (
                <View style={styles.mediaBadge}>
                  <Text style={styles.mediaBadgeText}>{formatDuration(item.durationMs)}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      );
    }

    if (activeTab === 'files') {
      if (fileItems.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Пока нет файлов</Text>
            <Text style={styles.emptySubtitle}>
              Документы и вложения из этого чата будут появляться здесь.
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.stackSection}>
          {fileItems.map((item) => (
            <FileRow key={item.id} item={item} onOpenMenu={openActionMenu} />
          ))}
        </View>
      );
    }

    if (activeTab === 'voice') {
      if (voiceItems.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Пока нет голосовых</Text>
            <Text style={styles.emptySubtitle}>
              Здесь будут собраны все голосовые сообщения из этого диалога.
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.stackSection}>
          {voiceItems.map((item) => (
            <VoiceRow key={item.id} item={item} onOpenMenu={openActionMenu} />
          ))}
        </View>
      );
    }

    if (linkItems.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Пока нет ссылок</Text>
          <Text style={styles.emptySubtitle}>
            Ссылки из переписки появятся на этой вкладке автоматически.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.stackSection}>
        {linkItems.map((item) => (
          <LinkRow key={item.id} item={item} onOpenMenu={openActionMenu} />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.heroCard, heroCardStyle]}>
          <Pressable
            onPress={toggleHeroExpanded}
            disabled={!avatarUrl}
            style={({ pressed }) => [
              styles.avatarPressable,
              pressed && avatarUrl ? styles.avatarPressablePressed : null,
            ]}
          >
            {avatarUrl ? (
              <Animated.Image source={{ uri: avatarUrl }} style={[styles.avatar, heroAvatarStyle]} />
            ) : (
              <Animated.View
                style={[
                  styles.avatarFallback,
                  heroAvatarStyle,
                  { backgroundColor: avatarColor },
                ]}
              >
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              </Animated.View>
            )}
          </Pressable>

          <Animated.View style={[styles.heroContent, heroContentStyle]}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.status}>{statusLabel}</Text>
            {handleLabel ? <Text style={styles.handle}>{handleLabel}</Text> : null}

            <Animated.View style={[styles.quickActionsRow, heroActionsStyle]}>
            <QuickActionButton
              icon="phone"
              label="Звонок"
              onPress={() => {
                void handleStartCallPress();
              }}
            />
            <QuickActionButton
              icon={isMuted ? 'bell-off' : 'bell'}
              label="Звук"
              active={isMuted}
              onPress={handleMutePress}
            />
            <QuickActionButton icon="search" label="Поиск" onPress={handleSearchPress} />
            <QuickActionButton icon="more-horizontal" label="Еще" onPress={handleMorePress} />
            </Animated.View>

          {loading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.loaderText}>Загружаем профиль...</Text>
            </View>
          ) : null}

          {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
          </Animated.View>
        </Animated.View>

        {infoRows.length > 0 ? (
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
        ) : null}

        <View style={styles.mediaSectionCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {(Object.keys(TAB_LABELS) as ProfileTabKey[]).map((tabKey) => {
              const isActive = activeTab === tabKey;
              return (
                <Pressable
                  key={tabKey}
                  onPress={() => setActiveTab(tabKey)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    isActive && styles.tabButtonActive,
                    pressed && styles.tabButtonPressed,
                  ]}
                >
                  <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                    {TAB_LABELS[tabKey]}
                  </Text>
                  <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                    {tabCounts[tabKey]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {renderTabContent()}
        </View>
      </ScrollView>

      <Modal
        visible={isMoreMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMoreMenu}
      >
        <View style={styles.moreMenuRoot}>
          <Pressable style={styles.moreMenuBackdrop} onPress={closeMoreMenu} />
          <View style={styles.moreMenuSheet}>
            <View style={styles.moreMenuHandle} />

            <Pressable
              onPress={handleToggleBlocked}
              style={({ pressed }) => [styles.moreMenuItem, pressed && styles.moreMenuItemPressed]}
            >
              <View
                style={[
                  styles.moreMenuIconWrap,
                  isBlocked ? styles.moreMenuIconWrapNeutral : styles.moreMenuIconWrapWarning,
                ]}
              >
                <Feather
                  name="slash"
                  size={18}
                  color={isBlocked ? '#64748B' : '#F97316'}
                />
              </View>
              <View style={styles.moreMenuTextWrap}>
                <Text style={styles.moreMenuLabel}>
                  {isBlocked ? 'Разблокировать' : 'Заблокировать'}
                </Text>
                <Text style={styles.moreMenuCaption}>Локально на этом устройстве</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handleDeleteChatPress}
              style={({ pressed }) => [styles.moreMenuItem, pressed && styles.moreMenuItemPressed]}
            >
              <View style={[styles.moreMenuIconWrap, styles.moreMenuIconWrapDanger]}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </View>
              <View style={styles.moreMenuTextWrap}>
                <Text style={[styles.moreMenuLabel, styles.moreMenuLabelDanger]}>Удалить чат</Text>
                <Text style={styles.moreMenuCaption}>С выбором способа удаления</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedMediaUri != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMediaUri(null)}
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setSelectedMediaUri(null)}>
          <View style={styles.viewerContent}>
            {selectedMediaUri ? (
              <Image source={{ uri: selectedMediaUri }} style={styles.viewerImage} resizeMode="contain" />
            ) : null}
            <Pressable
              onPress={() => setSelectedMediaUri(null)}
              style={styles.viewerClose}
              hitSlop={10}
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {actionMenu ? (
        <View style={styles.actionMenuRoot} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.actionMenuBackdrop,
              {
                opacity: actionMenuBackdropOpacity,
              },
            ]}
          >
            <Pressable style={styles.actionMenuBackdropPressable} onPress={() => closeActionMenu()} />
          </Animated.View>
          <Animated.View
            style={[
              styles.actionMenuCard,
              {
                top: actionMenu.top,
                left: actionMenu.left,
              },
              actionMenuCardStyle,
            ]}
          >
            <Pressable
              onPress={() => handleShowInChat(actionMenu.messageId)}
              style={({ pressed }) => [styles.actionMenuItem, pressed && styles.actionMenuItemPressed]}
            >
              <Feather name="message-circle" size={16} color="#111827" />
              <Text style={styles.actionMenuLabel}>Показать в чате</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
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
  heroCard: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 18,
    backgroundColor: '#F7F9FD',
    overflow: 'hidden',
  },
  avatarPressable: {
    width: '100%',
    alignItems: 'center',
  },
  avatarPressablePressed: {
    opacity: 0.96,
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarFallback: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarFallbackText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroContent: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  name: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  status: {
    marginTop: 4,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  handle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
  },
  quickActionsRow: {
    marginTop: 20,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickAction: {
    width: 64,
    alignItems: 'center',
  },
  quickActionPressed: {
    opacity: 0.76,
  },
  quickActionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(216,224,234,0.8)',
    shadowColor: '#89A8D8',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  quickActionIconWrapActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  quickActionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
  },
  quickActionLabelActive: {
    color: colors.accent,
  },
  loaderRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
    color: '#E05263',
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
  mediaSectionCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 320,
  },
  tabsRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F2F5FA',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(77,141,255,0.12)',
  },
  tabButtonPressed: {
    opacity: 0.8,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7D8795',
  },
  tabButtonTextActive: {
    color: colors.accent,
  },
  tabCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0A9B6',
  },
  tabCountActive: {
    color: colors.accent,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 3,
  },
  mediaTile: {
    width: '33.3333%',
    aspectRatio: 1,
    padding: 3,
  },
  mediaTilePressed: {
    opacity: 0.88,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#E6ECF5',
  },
  mediaBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(16,24,40,0.6)',
  },
  mediaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stackSection: {
    paddingHorizontal: 14,
    paddingTop: 4,
    gap: 10,
  },
  fileRow: {
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FD',
  },
  fileRowPressed: {
    opacity: 0.82,
  },
  fileBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.14)',
    marginRight: 12,
  },
  fileBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  fileTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  fileTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fileSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: colors.textSecondary,
  },
  voiceRow: {
    minHeight: 76,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FD',
  },
  voicePlayButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginRight: 12,
  },
  voicePlayButtonActive: {
    backgroundColor: '#4C84E8',
  },
  voicePlayButtonPressed: {
    opacity: 0.84,
  },
  voicePlayIcon: {
    marginLeft: 2,
  },
  voiceWaveWrap: {
    flex: 1,
  },
  voiceWaveTrack: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  voiceBar: {
    width: 3,
    borderRadius: 999,
  },
  voiceMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceDuration: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  voiceDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  linkRow: {
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FD',
  },
  linkRowPressed: {
    opacity: 0.82,
  },
  linkIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.12)',
    marginRight: 12,
  },
  linkTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  linkSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 46,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreMenuRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  moreMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  moreMenuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 22,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  moreMenuHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D5DCE7',
    marginBottom: 14,
  },
  moreMenuItem: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 4,
  },
  moreMenuItemPressed: {
    opacity: 0.78,
  },
  moreMenuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMenuIconWrapWarning: {
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
  },
  moreMenuIconWrapNeutral: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
  },
  moreMenuIconWrapDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  moreMenuTextWrap: {
    flex: 1,
  },
  moreMenuLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  moreMenuLabelDanger: {
    color: '#DC2626',
  },
  moreMenuCaption: {
    marginTop: 2,
    fontSize: 13,
    color: '#7A8699',
  },
  viewerContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    top: 54,
    right: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionMenuRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  actionMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
  },
  actionMenuBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  actionMenuCard: {
    position: 'absolute',
    minWidth: 164,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    overflow: 'hidden',
  },
  actionMenuItem: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionMenuItemPressed: {
    backgroundColor: 'rgba(77,141,255,0.08)',
  },
  actionMenuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
