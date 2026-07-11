import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  InteractionManager,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { ChatProfileDeleteHistoryPanel } from '../components/ChatProfileDeleteHistoryPanel';
import { ChatProfileBlockSheet } from '../components/ChatProfileBlockSheet';
import { API_BASE_URL, resolveAvatarUrl } from '../config';
import { useCall } from '../contexts/CallContext';
import { ChatDao } from '../db';
import type { ChatsStackParamList } from '../navigation/types';
import type { ApiUser } from '../services/AuthService';
import { getUserProfile } from '../services/profileService';
import { createOrFindChat, deleteChat } from '../services/chatService';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import type { Message } from '../stores/types';
import { uiStore } from '../stores/uiStore';
import { useTheme } from '../contexts/ThemeContext';
import {
  createChatProfileScreenStyles,
  type ChatProfileScreenStyleSet,
} from './chatProfileScreen.styles';
import { resolveVoiceMessageUri } from '../utils/messageMediaUri';
import { DEFAULT_CHAT_THEME_ID, type ChatThemeId } from '../theme/chatThemes';
import { findPrivateChatWithPeer, getPrivateChatPeerUserId } from './chatScreen.shared';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const WALLPAPER_MENU_ICON = require('../../assets/telegram-msg-background-wallpaper-icon.png');

type ChatProfileRoute = RouteProp<ChatsStackParamList, 'ChatProfile'>;
type ChatProfileNavigation = NativeStackNavigationProp<ChatsStackParamList, 'ChatProfile'>;
const EMPTY_PROFILE_MESSAGES: Message[] = [];
/** Scan only recent messages for media/voice/links — full history blocks the JS thread. */
const PROFILE_MEDIA_SCAN_LIMIT = 500;

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
  const first = profile?.display_name?.trim() ?? '';
  const last = profile?.last_name?.trim() ?? '';
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return (
    combined ||
    profile?.username?.trim() ||
    fallbackTitle ||
    'Профиль'
  );
}

function splitContactName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
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

function mediaKindForProfileItem(
  message: Message,
  item: NonNullable<Message['media']>[number],
): 'image' | 'video' {
  const mt = (item.media_type ?? '').toLowerCase();
  if (mt === 'video') return 'video';
  if (mt === 'image') return 'image';
  return message.msg_type === 'video' ? 'video' : 'image';
}

function buildProfileMediaTile(
  message: Message,
  item: NonNullable<Message['media']>[number],
  mediaIndex: number,
): MediaTile | null {
  const uri = resolveAvatarUrl(item.remote_url?.trim() ?? null);
  if (!uri) return null;
  const kind = mediaKindForProfileItem(message, item);
  const thumb = resolveAvatarUrl(item.thumbnail_url ?? null);
  return {
    id: `${message.id}:${mediaIndex}`,
    kind,
    uri,
    previewUri:
      kind === 'video'
        ? thumb ?? undefined
        : thumb || resolveAvatarUrl(item.remote_url?.trim() ?? null) || uri,
    durationMs: kind === 'video' ? item.duration_ms ?? 0 : undefined,
  };
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

  if (profile?.birthday != null && profile.birthday > 0) {
    rows.push({
      id: 'birthday',
      label: 'День рождения',
      value: new Date(profile.birthday).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    });
  }

  if (profile?.bio?.trim()) {
    rows.push({
      id: 'bio',
      label: 'О себе',
      value: profile.bio.trim(),
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
  styles: ChatProfileScreenStyleSet;
  accentColor: string;
};

const ProfileInfoCard = React.memo(function ProfileInfoCard({
  infoRows,
  styles,
  accentColor,
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
                <Feather name={row.icon} size={16} color={accentColor} />
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
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileScreenStyles(themeColors),
    [themeColors],
  );
  const { startCall } = useCall();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('media');
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const [floatingVideoNote, setFloatingVideoNote] = useState<VoiceItem | null>(null);
  const [actionMenu, setActionMenu] = useState<ProfileActionMenuState>(null);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);
  const [moreMenu, setMoreMenu] = useState<AnchoredMenuState>(null);
  const [moreMenuPhase, setMoreMenuPhase] = useState<'list' | 'delete'>('list');
  const [blockSheetVisible, setBlockSheetVisible] = useState(false);
  const [isThemePickerVisible, setIsThemePickerVisible] = useState(false);
  const [draftThemeId, setDraftThemeId] = useState<ChatThemeId>(DEFAULT_CHAT_THEME_ID);
  const [isEditContactVisible, setIsEditContactVisible] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState('');
  const [lastNameDraft, setLastNameDraft] = useState('');
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
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const livePresence = uiStore((s) => s.presenceByUserId[userId]);
  const isBlocked = uiStore((s) => Boolean(s.blockedUserIds[userId]));
  const currentThemeId = uiStore(
    (s) => (s.chatThemeIdByChatId[chatId] as ChatThemeId | undefined) ?? DEFAULT_CHAT_THEME_ID
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
    const task = InteractionManager.runAfterInteractions(() => {
      void uiStore.getState().hydrateBlockedUsers();
    });
    return () => task.cancel();
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

  const chats = chatStore((s) => s.chats);
  const privateChatForContact = useMemo(
    () => findPrivateChatWithPeer(userId, currentUserId),
    [chats, userId, currentUserId],
  );

  const originalDisplayName = buildDisplayName(
    profile,
    chatTitle ?? chat?.peer_display_name ?? chat?.name ?? ''
  );
  const localContactName = privateChatForContact?.local_contact_name?.trim() ?? '';
  const displayName = localContactName || originalDisplayName;
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

  const profileMessagesSlice = useMemo(
    () =>
      chatMessages.length > PROFILE_MEDIA_SCAN_LIMIT
        ? chatMessages.slice(0, PROFILE_MEDIA_SCAN_LIMIT)
        : chatMessages,
    [chatMessages]
  );

  const mediaItems = useMemo<MediaTile[]>(() => {
    const tiles: MediaTile[] = [];
    for (const message of profileMessagesSlice) {
      if (message.is_deleted) continue;
      if (message.msg_type !== 'image' && message.msg_type !== 'video') continue;
      const entries = (message.media ?? []).filter((m) => m.remote_url?.trim());
      entries.forEach((m, idx) => {
        const tile = buildProfileMediaTile(message, m, idx);
        if (tile) tiles.push(tile);
      });
    }
    return tiles;
  }, [profileMessagesSlice]);

  const fileItems = useMemo<FileItem[]>(
    () =>
      profileMessagesSlice
        .filter((message) => !message.is_deleted && message.msg_type === 'file')
        .map((message) => ({
          id: message.id,
          title: message.media?.[0]?.file_name || 'Файл',
          subtitle: buildFileSubtitle(message),
          uri: extractMediaUri(message),
          extension: getFileExtension(message.media?.[0]?.file_name || 'FILE'),
        })),
    [profileMessagesSlice]
  );

  const voiceItems = useMemo<VoiceItem[]>(
    () =>
      profileMessagesSlice
        .filter(
          (message) =>
            !message.is_deleted &&
            (message.msg_type === 'voice' || message.msg_type === 'video_note')
        )
        .map((message) => ({
          id: message.id,
          kind: message.msg_type === 'video_note' ? 'video_note' : 'voice',
          uri: resolveVoiceMessageUri(message),
          thumbnailUri:
            message.msg_type === 'video_note'
              ? resolveAvatarUrl(message.media?.[0]?.thumbnail_url ?? null) ?? undefined
              : undefined,
          title: message.sender_id === currentUserId ? 'Вы' : displayName,
          durationMs: message.media?.[0]?.duration_ms ?? 0,
          waveform: message.msg_type === 'voice' ? message.media?.[0]?.waveform ?? [] : [],
          dateLabel: formatMessageDate(message.created_at),
        })),
    [profileMessagesSlice, currentUserId, displayName]
  );

  const linkItems = useMemo<LinkItem[]>(
    () =>
      profileMessagesSlice.flatMap((message) =>
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
    [profileMessagesSlice]
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
      chatTitle: displayName,
      startSearch: true,
    });
  }, [chatId, displayName, navigation]);

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

  const handleStartVideoCallPress = useCallback(async () => {
    try {
      await startCall({
        userId,
        displayName,
        avatarUrl,
        chatId,
        callKind: 'video',
      });
    } catch (error) {
      Alert.alert(
        'Не удалось начать видеозвонок',
        error instanceof Error ? error.message : 'Проверь камеру и попробуй еще раз.'
      );
    }
  }, [avatarUrl, chatId, displayName, startCall, userId]);

  const openMoreMenu = useCallback(() => {
    const target = moreButtonRef.current;
    if (!target) return;

    target.measureInWindow((left, top, width, height) => {
      moreMenuAnimation.setValue(0);
      setMoreMenuPhase('list');
      setMoreMenu({ left, top, width, height });
    });
  }, [moreMenuAnimation]);

  const closeMoreMenu = useCallback(
    (onClosed?: unknown) => {
      const callback = typeof onClosed === 'function' ? onClosed : undefined;
      if (!moreMenu) {
        setMoreMenuPhase('list');
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
        setMoreMenuPhase('list');
        callback?.();
      });
    },
    [moreMenu, moreMenuAnimation]
  );

  const handleMorePress = useCallback(() => {
    openMoreMenu();
  }, [openMoreMenu]);

  const openEditContact = useCallback(() => {
    const parts = splitContactName(localContactName || displayName);
    setFirstNameDraft(parts.firstName);
    setLastNameDraft(parts.lastName);
    setIsEditContactVisible(true);
  }, [displayName, localContactName]);

  const closeEditContact = useCallback(() => {
    setIsEditContactVisible(false);
  }, []);

  const handleSaveContactName = useCallback(async () => {
    if (!chat) {
      setIsEditContactVisible(false);
      return;
    }

    const nextName = [firstNameDraft.trim(), lastNameDraft.trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
    const localName = nextName.length > 0 ? nextName : null;

    let targetPrivate =
      chat.chat_type === 'private' && getPrivateChatPeerUserId(chat, currentUserId) === userId
        ? chat
        : findPrivateChatWithPeer(userId, currentUserId);

    try {
      if (!targetPrivate) {
        targetPrivate = await createOrFindChat(userId);
        chatStore.getState().addOrUpdateChat(targetPrivate);
      }
    } catch {
      setIsEditContactVisible(false);
      Alert.alert('Не удалось сохранить имя', 'Попробуй еще раз чуть позже.');
      return;
    }

    const updatedPrivate = {
      ...targetPrivate,
      local_contact_name: localName,
    };

    chatStore.getState().updateChat(updatedPrivate);
    setIsEditContactVisible(false);
    navigation.setParams({ chatTitle: localName ?? originalDisplayName });

    try {
      await new ChatDao().update({
        id: targetPrivate.id,
        local_contact_name: localName,
      });
    } catch {
      chatStore.getState().updateChat(targetPrivate);
      Alert.alert('Не удалось сохранить имя', 'Попробуй еще раз чуть позже.');
      return;
    }

    if (chat.chat_type !== 'private' && chat.id !== targetPrivate.id && chat.local_contact_name) {
      const clearedGroup = { ...chat, local_contact_name: null };
      chatStore.getState().updateChat(clearedGroup);
      try {
        await new ChatDao().update({ id: chat.id, local_contact_name: null });
      } catch {
        /* best-effort */
      }
    }
  }, [
    chat,
    currentUserId,
    firstNameDraft,
    lastNameDraft,
    navigation,
    originalDisplayName,
    userId,
  ]);

  const openThemePicker = useCallback(() => {
    closeMoreMenu(() => {
      setDraftThemeId(currentThemeId);
      setIsThemePickerVisible(true);
    });
  }, [closeMoreMenu, currentThemeId]);

  const handleApplyChatTheme = useCallback(() => {
    uiStore.getState().setChatTheme(chatId, draftThemeId);
    setIsThemePickerVisible(false);
  }, [chatId, draftThemeId]);

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

  const handleDeleteForMeOnlyFromPanel = useCallback(() => {
    closeMoreMenu(() => {
      void deleteChatLocally();
    });
  }, [closeMoreMenu, deleteChatLocally]);

  const handleDeleteForBothSides = useCallback(() => {
    if (!chat) {
      Alert.alert(
        'Чат ещё не загружен',
        'Повтори попытку через секунду или удали переписку только у себя.',
        [{ text: 'OK' }],
      );
      return;
    }
    if (chat.chat_type !== 'private') {
      handleDeleteForMeOnlyFromPanel();
      return;
    }
    void (async () => {
      try {
        await deleteChat(chatId);
        closeMoreMenu(() => {
          void deleteChatLocally();
        });
      } catch (e) {
        Alert.alert(
          'Не удалось удалить чат',
          e instanceof Error ? e.message : 'Попробуй еще раз чуть позже.',
        );
      }
    })();
  }, [chat, chatId, closeMoreMenu, deleteChatLocally, handleDeleteForMeOnlyFromPanel]);

  const handleConfirmBlockFromSheet = useCallback(() => {
    uiStore.getState().setUserBlocked(userId, true);
  }, [userId]);

  const handleBlockMenuItem = useCallback(() => {
    if (isBlocked) {
      closeMoreMenu(() => {
        Alert.alert(
          'Разблокировать?',
          `${displayName} снова сможет писать вам (локально на этом устройстве).`,
          [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Разблокировать',
              onPress: () => {
                uiStore.getState().setUserBlocked(userId, false);
                Alert.alert('Готово', `${displayName} разблокирован.`);
              },
            },
          ],
        );
      });
      return;
    }
    closeMoreMenu(() => setBlockSheetVisible(true));
  }, [closeMoreMenu, displayName, isBlocked, userId]);

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
        chatTitle: displayName,
        focusMessageId: messageId,
      });
    });
  };

  const openActionMenu = useCallback((rawMessageId: string, event: GestureResponderEvent) => {
    const messageId = rawMessageId.includes(':') ? (rawMessageId.split(':')[0] ?? rawMessageId) : rawMessageId;
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

  useEffect(() => {
    if (selectedMediaIndex != null && selectedMediaIndex >= mediaItems.length) {
      setSelectedMediaIndex(null);
    }
  }, [mediaItems.length, selectedMediaIndex]);

  const moreMenuItems = useMemo<AnchoredPopoverMenuItem[]>(
    () => [
      {
        key: 'change-wallpaper',
        label: 'Изменить обои',
        iconImage: WALLPAPER_MENU_ICON,
      },
      {
        key: 'delete-chat',
        label: 'Удалить чат',
        icon: 'trash-2',
      },
      {
        key: 'toggle-block',
        label: isBlocked ? 'Разблокировать' : 'Заблокировать',
        icon: 'slash',
        color: isBlocked ? undefined : '#D04857',
      },
    ],
    [isBlocked]
  );

  const moreMenuDeletePanelHeight = useMemo(
    () => (chat?.chat_type === 'private' ? 268 : 198),
    [chat?.chat_type],
  );

  const moreMenuCustomBody = useMemo(() => {
    if (moreMenuPhase !== 'delete') return null;
    return (
      <ChatProfileDeleteHistoryPanel
        peerName={displayName}
        showDeleteForBoth={chat?.chat_type === 'private'}
        onBack={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setMoreMenuPhase('list');
        }}
        onDeleteBoth={handleDeleteForBothSides}
        onDeleteMeOnly={handleDeleteForMeOnlyFromPanel}
      />
    );
  }, [
    moreMenuPhase,
    displayName,
    chat?.chat_type,
    handleDeleteForBothSides,
    handleDeleteForMeOnlyFromPanel,
  ]);

  const handleMoreMenuAction = useCallback(
    (key: string) => {
      if (key === 'change-wallpaper') {
        openThemePicker();
        return;
      }

      if (key === 'toggle-block') {
        handleBlockMenuItem();
        return;
      }

      if (key === 'delete-chat') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMoreMenuPhase('delete');
      }
    },
    [handleBlockMenuItem, openThemePicker]
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
          onStartVideoCallPress={handleStartVideoCallPress}
          onMutePress={handleMutePress}
          onSearchPress={handleSearchPress}
          onMorePress={handleMorePress}
          onBackPress={() => navigation.goBack()}
          onEditPress={openEditContact}
          moreButtonRef={moreButtonRef}
        />

        <ProfileInfoCard
          infoRows={infoRows}
          styles={styles}
          accentColor={themeColors.accent}
        />

        <ChatProfileMediaSection
          activeTab={activeTab}
          mediaItems={mediaItems}
          fileItems={fileItems}
          voiceItems={voiceItems}
          linkItems={linkItems}
          onChangeTab={setActiveTab}
          onOpenMedia={setSelectedMediaIndex}
          onOpenVideoNote={setFloatingVideoNote}
          onOpenActionMenu={openActionMenu}
          peerFirstLineId={chatId}
        />
      </Animated.ScrollView>
      <ChatProfileOverlayLayer
        moreMenu={moreMenu}
        moreMenuAnimation={moreMenuAnimation}
        moreMenuItems={moreMenuItems}
        moreMenuCustomBody={moreMenuCustomBody}
        moreMenuCustomBodyHeight={moreMenuDeletePanelHeight}
        onCloseMoreMenu={closeMoreMenu}
        onMoreMenuAction={handleMoreMenuAction}
        mediaItems={mediaItems}
        selectedMediaIndex={selectedMediaIndex}
        onChangeMediaIndex={setSelectedMediaIndex}
        onCloseMedia={() => setSelectedMediaIndex(null)}
        floatingVideoNote={floatingVideoNote}
        onCloseFloatingVideoNote={() => setFloatingVideoNote(null)}
        actionMenu={actionMenu}
        actionMenuAnimation={actionMenuAnimation}
        onCloseActionMenu={() => closeActionMenu()}
        onShowInChat={handleShowInChat}
      />

      <Modal
        visible={isEditContactVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeEditContact}
      >
        <KeyboardAvoidingView
          style={styles.editScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <StatusBar barStyle="dark-content" />
          <View style={[styles.editTopBar, { paddingTop: Math.max(insets.top + 8, 18) }]}>
            <Pressable
              onPress={closeEditContact}
              style={({ pressed }) => [styles.editNavPill, pressed && styles.editNavPillPressed]}
            >
              <Text style={styles.editNavText}>Отмена</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleSaveContactName();
              }}
              style={({ pressed }) => [styles.editNavPill, pressed && styles.editNavPillPressed]}
            >
              <Text style={[styles.editNavText, styles.editDoneText]}>Готово</Text>
            </Pressable>
          </View>

          <View style={styles.editAvatarWrap}>
            <View style={[styles.editAvatarFrame, !avatarUrl ? { backgroundColor: avatarColor } : null]}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.editAvatarImage}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <Text style={styles.editAvatarInitial}>{initial}</Text>
              )}
            </View>
          </View>

          <View style={styles.editFieldsCard}>
            <TextInput
              value={firstNameDraft}
              onChangeText={setFirstNameDraft}
              placeholder="Имя"
              placeholderTextColor={themeColors.textSecondary}
              style={styles.editInput}
              returnKeyType="next"
              autoFocus
            />
            <View style={styles.editInputDivider} />
            <TextInput
              value={lastNameDraft}
              onChangeText={setLastNameDraft}
              placeholder="Фамилия"
              placeholderTextColor={themeColors.textSecondary}
              style={styles.editInput}
              returnKeyType="done"
              onSubmitEditing={() => {
                void handleSaveContactName();
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ChatThemePickerModal
        visible={isThemePickerVisible}
        selectedThemeId={draftThemeId}
        onSelectTheme={setDraftThemeId}
        onApply={handleApplyChatTheme}
        onClose={() => setIsThemePickerVisible(false)}
      />

      <ChatProfileBlockSheet
        visible={blockSheetVisible}
        peerName={displayName}
        onClose={() => setBlockSheetVisible(false)}
        onConfirmBlock={handleConfirmBlockFromSheet}
      />
    </View>
  );
}
