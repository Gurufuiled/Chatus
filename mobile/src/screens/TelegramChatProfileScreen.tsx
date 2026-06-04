import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChatProfileHero,
} from '../components/ChatProfileHero';
import type { AnchoredMenuState, AnchoredPopoverMenuItem } from '../components/AnchoredPopoverMenu';
import { ChatThemePickerModal } from '../components/ChatThemePickerModal';
import {
  ChatProfileMediaSection,
  type ProfileTabKey,
  type VoiceItem,
} from '../components/ChatProfileMediaSection';
import { ChatProfileOverlayLayer } from '../components/ChatProfileOverlayLayer';
import { ChatProfileDeleteHistoryPanel } from '../components/ChatProfileDeleteHistoryPanel';
import { ChatProfileBlockSheet } from '../components/ChatProfileBlockSheet';
import type { ChatsStackParamList } from '../navigation/types';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import { useTheme } from '../contexts/ThemeContext';
import { uiStore } from '../stores/uiStore';
import { DEFAULT_CHAT_THEME_ID, type ChatThemeId } from '../theme/chatThemes';
import {
  createChatProfileScreenStyles,
  type ChatProfileScreenStyleSet,
} from './chatProfileScreen.styles';
import {
  getNestedRecord,
  loadLastReadOutboxMessageId,
  mapTdMessages,
} from './telegramChat/tdlibMapping';
import {
  tdlibBlockUser,
  tdlibDeleteChat,
  tdlibLeaveChat,
  tdlibSetChatMuted,
  tdlibUnblockUser,
  tdlibToggleChatIsPinned,
} from './telegramChat/tdlibChatActions';
import {
  fetchTdlibChatPhotoUri,
  fetchTdlibUserAvatarUri,
  formatTdUserStatus,
  isTdChatMuted,
  tdlibIsUserBlocked,
  tdlibResolveChatPeer,
} from './telegramChat/tdlibUserProfile';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { telegramRowsToProfileBuckets } from './telegramChat/telegramProfileMedia';
import { patchMessagesWithTdlibFile } from './telegramChat/telegramFileUpdates';
import type { TelegramMessageRow } from './telegramChat/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const WALLPAPER_MENU_ICON = require('../../assets/telegram-msg-background-wallpaper-icon.png');

type Route = RouteProp<ChatsStackParamList, 'TelegramChatProfile'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'TelegramChatProfile'>;

const PROFILE_SCREEN_WIDTH = Dimensions.get('window').width;

type ProfileActionMenuState = {
  messageId: string;
  top: number;
  left: number;
} | null;

type InfoRow = {
  id: string;
  label: string;
  value: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
};

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

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function buildTdlibInfoRows(
  user: Record<string, unknown> | null,
  fullInfo: Record<string, unknown> | null,
  extraDescription?: string | null,
): InfoRow[] {
  const rows: InfoRow[] = [];
  const phone =
    typeof user?.phone_number === 'string' ? user.phone_number.trim() : '';
  if (phone) {
    rows.push({ id: 'phone', label: 'Мобильный', value: phone, icon: 'phone' });
  }
  const usernamesObj = getNestedRecord(user?.usernames);
  const activeUsernames = Array.isArray(usernamesObj?.active_usernames) ? usernamesObj.active_usernames : [];
  const editableUsername = typeof usernamesObj?.editable_username === 'string' ? usernamesObj.editable_username : null;
  const fallbackUsername = typeof user?.username === 'string' ? user.username : null;
  
  const rawUsername = activeUsernames[0] || editableUsername || fallbackUsername || '';
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
  
  if (username) {
    rows.push({
      id: 'username',
      label: 'Имя пользователя',
      value: `@${username}`,
      icon: 'at-sign',
    });
  }
  const bioValue = fullInfo?.bio;
  const bioObj = getNestedRecord(bioValue);
  const bioText = typeof bioObj?.text === 'string' 
    ? bioObj.text.trim() 
    : typeof bioValue === 'string' 
      ? bioValue.trim() 
      : '';
  if (bioText) {
    rows.push({ id: 'bio', label: 'О себе', value: bioText });
  }
  if (extraDescription?.trim()) {
    rows.push({ id: 'desc', label: 'Описание', value: extraDescription.trim() });
  }
  return rows;
}

function ProfileInfoCard({
  infoRows,
  styles,
  accentColor,
}: {
  infoRows: InfoRow[];
  styles: ChatProfileScreenStyleSet;
  accentColor: string;
}) {
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
}

export function TelegramChatProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { telegramChatId, title: routeTitle, avatarUri: routeAvatarUri, chatType: routeChatTypeParam } =
    route.params;
  const chatId = Number.parseInt(telegramChatId, 10);
  const wallpaperKey = `telegram:${telegramChatId}`;

  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createChatProfileScreenStyles(themeColors), [themeColors]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(routeTitle ?? 'Профиль');
  const [handleLabel, setHandleLabel] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState('…');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(routeAvatarUri ?? null);
  const [isMuted, setIsMuted] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isPinned, setIsPinned] = useState(() => {
    return telegramAccountStore.getState().dialogs.find((d) => d.chatId === telegramChatId)?.isPinned ?? false;
  });
  const [infoRows, setInfoRows] = useState<InfoRow[]>([]);
  const [peerUserId, setPeerUserId] = useState<number | null>(null);
  const [isGroupPeer, setIsGroupPeer] = useState(false);
  const [isBroadcastChannel, setIsBroadcastChannel] = useState(routeChatTypeParam === 'channel');

  const [userRecord, setUserRecord] = useState<Record<string, unknown> | null>(null);
  const [isEditContactVisible, setIsEditContactVisible] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState('');
  const [lastNameDraft, setLastNameDraft] = useState('');

  useEffect(() => {
    const t = routeTitle?.trim();
    if (t) setDisplayName(t);
  }, [routeTitle]);

  const [historyRows, setHistoryRows] = useState<TelegramMessageRow[]>([]);
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

  const actionMenuAnimation = useRef(new Animated.Value(0)).current;
  const moreMenuAnimation = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const moreButtonRef = useRef<View | null>(null);

  const currentThemeId =
    (uiStore.getState().chatThemeIdByChatId[wallpaperKey] as ChatThemeId | undefined) ??
    DEFAULT_CHAT_THEME_ID;

  const avatarColor = useMemo(() => getAvatarColor(displayName), [displayName]);
  const initial =
    routeChatTypeParam === 'channel' || isBroadcastChannel
      ? '📢'
      : (displayName.trim()[0] || '?').toUpperCase();
  const expandedHeroWidth = PROFILE_SCREEN_WIDTH;
  const expandedHeroHeight = Math.min(Math.max(PROFILE_SCREEN_WIDTH * 0.92, 280), 360);

  const ensureReady = useCallback(async () => {
    await applyTdlibParameters();
    const { ready, state } = await waitForTdlibAuthorizationReady();
    if (!ready) {
      throw new Error(`Сессия Telegram не готова (${state ?? 'таймаут'})`);
    }
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (!Number.isFinite(chatId)) {
      setLoading(false);
      setError('Некорректный чат');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await ensureReady();

        const loadRichHistory = async (lastRead: number) => {
          const fetchHistoryBatch = async (fromId: number, limit: number) => {
            try {
              const res = (await tdlibClient.send({
                '@type': 'getChatHistory',
                chat_id: chatId,
                from_message_id: fromId,
                offset: 0,
                limit,
                only_local: false,
              })) as Record<string, unknown>;
              throwIfTdError(res);
              return Array.isArray(res.messages) ? res.messages : [];
            } catch (e) {
              return [];
            }
          };

          const fetchSearchBatch = async (filterType: string, limit: number) => {
            try {
              const res = (await tdlibClient.send({
                '@type': 'searchChatMessages',
                chat_id: chatId,
                query: '',
                sender_id: null,
                from_message_id: 0,
                offset: 0,
                limit,
                filter: { '@type': filterType },
                message_thread_id: 0,
              })) as Record<string, unknown>;
              throwIfTdError(res);
              return Array.isArray(res.messages) ? res.messages : [];
            } catch (e) {
              return [];
            }
          };

          const allRawMap = new Map<number, Record<string, unknown>>();

          // 1. Fetch recent general history (3 batches of 100)
          let lastMsgId = 0;
          for (let b = 0; b < 3; b++) {
            const batch = await fetchHistoryBatch(lastMsgId, 100);
            if (batch.length === 0) break;
            for (const msg of batch) {
              if (msg && typeof msg.id === 'number') {
                allRawMap.set(msg.id, msg);
              }
            }
            const oldest = batch[batch.length - 1];
            if (oldest && typeof oldest.id === 'number') {
              lastMsgId = oldest.id;
            } else {
              break;
            }
          }

          // 2. Fetch media, files, voice, links in parallel using TDLib search filters
          const searchFilters = [
            'searchMessagesFilterPhotoAndVideo',
            'searchMessagesFilterDocument',
            'searchMessagesFilterVoiceAndVideoNote',
            'searchMessagesFilterUrl',
          ];
          const searchPromises = searchFilters.map(f => fetchSearchBatch(f, 100));
          const searchResults = await Promise.all(searchPromises);

          for (const batch of searchResults) {
            for (const msg of batch) {
              if (msg && typeof msg.id === 'number') {
                allRawMap.set(msg.id, msg);
              }
            }
          }

          const rawMerged = Array.from(allRawMap.values());
          const mapped = await mapTdMessages(
            rawMerged.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object'),
            lastRead,
          );
          mapped.sort((a, b) => b.dateMs - a.dateMs);
          return mapped;
        };

        const peer = await tdlibResolveChatPeer(chatId);
        if (cancelled) return;

        if (peer.kind === 'supergroup') {
          setIsBroadcastChannel(peer.isChannel);
        } else if (peer.kind === 'unknown' && routeChatTypeParam === 'channel') {
          setIsBroadcastChannel(true);
        } else {
          setIsBroadcastChannel(false);
        }

        const chat = (await tdlibClient.send({
          '@type': 'getChat',
          chat_id: chatId,
        })) as Record<string, unknown>;
        throwIfTdError(chat);
        setIsMuted(isTdChatMuted(chat));

        const chatTitle = typeof chat.title === 'string' ? chat.title.trim() : '';
        if (chatTitle) setDisplayName(chatTitle);

        const chatPhotoUri = await fetchTdlibChatPhotoUri(chat);
        if (!cancelled && chatPhotoUri) setAvatarUrl(chatPhotoUri);
        else if (!cancelled && routeAvatarUri) setAvatarUrl(routeAvatarUri);

        if (peer.kind === 'user' || peer.kind === 'secret') {
          const userId = peer.userId;
          setPeerUserId(userId);
          setIsGroupPeer(false);

          const [blocked, user, full] = await Promise.all([
            tdlibIsUserBlocked(userId),
            tdlibClient.send({ '@type': 'getUser', user_id: userId }),
            tdlibClient.send({ '@type': 'getUserFullInfo', user_id: userId }),
          ]);
          if (cancelled) return;
          throwIfTdError(user);
          throwIfTdError(full);

          const u = user as Record<string, unknown>;
          setUserRecord(u);
          const f = full as Record<string, unknown>;
          const fn = typeof u.first_name === 'string' ? u.first_name.trim() : '';
          const ln = typeof u.last_name === 'string' ? u.last_name.trim() : '';
          const combined = [fn, ln].filter(Boolean).join(' ').trim();
          if (combined) setDisplayName(combined);
          
          const unameObj = getNestedRecord(u.usernames);
          const activeUnames = Array.isArray(unameObj?.active_usernames) ? unameObj.active_usernames : [];
          const editableUname = typeof unameObj?.editable_username === 'string' ? unameObj.editable_username : null;
          const fallbackUname = typeof u.username === 'string' ? u.username : null;
          const rawUname = activeUnames[0] || editableUname || fallbackUname || '';
          const uname = typeof rawUname === 'string' ? rawUname.trim() : '';
          
          setHandleLabel(uname ? `@${uname}` : null);
          setStatusLabel(formatTdUserStatus(getNestedRecord(u.status)));
          setInfoRows(buildTdlibInfoRows(u, f));

          const av = await fetchTdlibUserAvatarUri(u);
          if (!cancelled && av) setAvatarUrl(av);
          else if (!cancelled && routeAvatarUri) setAvatarUrl(routeAvatarUri);

          setIsBlocked(blocked);

          const lastRead = await loadLastReadOutboxMessageId(chatId);
          const mapped = await loadRichHistory(lastRead);
          if (!cancelled) setHistoryRows(mapped);
          return;
        }

        setPeerUserId(null);
        setIsGroupPeer(true);
        setHandleLabel(null);
        setIsBlocked(false);

        let description: string | null = null;
        let memberLine = '';

        if (peer.kind === 'supergroup' && peer.supergroupId != null) {
          const sg = (await tdlibClient.send({
            '@type': 'getSupergroup',
            supergroup_id: peer.supergroupId,
          })) as Record<string, unknown>;
          throwIfTdError(sg);
          if (typeof sg.member_count === 'number' && sg.member_count > 0) {
            memberLine = peer.isChannel
              ? `${sg.member_count.toLocaleString()} подписчиков`
              : `${sg.member_count.toLocaleString()} участников`;
          }
          try {
            const sgf = (await tdlibClient.send({
              '@type': 'getSupergroupFullInfo',
              supergroup_id: peer.supergroupId,
            })) as Record<string, unknown>;
            throwIfTdError(sgf);
            const d = typeof sgf.description === 'string' ? sgf.description.trim() : '';
            description = d.length > 0 ? d : null;
          } catch {
            /* optional */
          }
        } else if (peer.kind === 'basicGroup' && peer.basicGroupId != null) {
          const bg = (await tdlibClient.send({
            '@type': 'getBasicGroup',
            basic_group_id: peer.basicGroupId,
          })) as Record<string, unknown>;
          throwIfTdError(bg);
          if (typeof bg.member_count === 'number' && bg.member_count > 0) {
            memberLine = `${bg.member_count.toLocaleString()} участников`;
          }
        }

        setStatusLabel(
          memberLine ||
            (peer.kind === 'supergroup' && peer.isChannel ? 'Канал' : 'Групповой чат'),
        );
        setInfoRows(buildTdlibInfoRows(null, null, description));

        const lastRead = await loadLastReadOutboxMessageId(chatId);
        const mapped = await loadRichHistory(lastRead);
        if (!cancelled) setHistoryRows(mapped);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, ensureReady, routeAvatarUri, routeChatTypeParam]);

  useEffect(() => {
    if (!isHeroExpanded) return;
    const id = scrollY.addListener(({ value }) => {
      if (value > 24) setIsHeroExpanded(false);
    });
    return () => scrollY.removeListener(id);
  }, [isHeroExpanded, scrollY]);
  useEffect(() => {
    const unsubscribe = tdlibClient.subscribe((update) => {
      try {
        const type = update['@type'];
        if (type === 'updateFile') {
          const file = getNestedRecord(update.file);
          if (!file) return;
          setHistoryRows((prev) => patchMessagesWithTdlibFile(prev, file));
        }
      } catch (e) {
        // ignore
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const { mediaItems, fileItems, voiceItems, linkItems } = useMemo(
    () => telegramRowsToProfileBuckets(historyRows, displayName),
    [historyRows, displayName],
  );

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

  useEffect(() => {
    if (!isThemePickerVisible) {
      setDraftThemeId(currentThemeId);
    }
  }, [currentThemeId, isThemePickerVisible]);

  const handleMutePress = useCallback(() => {
    void (async () => {
      try {
        await ensureReady();
        const next = !isMuted;
        await tdlibSetChatMuted(chatId, next);
        setIsMuted(next);
      } catch (e) {
        Alert.alert('Уведомления', e instanceof Error ? e.message : String(e));
      }
    })();
  }, [chatId, ensureReady, isMuted]);

  const handleSearchPress = useCallback(() => {
    navigation.navigate({
      name: 'TelegramChat',
      params: {
        telegramChatId,
        title: displayName,
        avatarUri: avatarUrl ?? routeAvatarUri ?? null,
        chatType: route.params.chatType ?? null,
        startSearch: true,
      },
      merge: true,
    });
  }, [
    avatarUrl,
    displayName,
    navigation,
    routeAvatarUri,
    route.params.chatType,
    telegramChatId,
  ]);

  const handleStartCallPress = useCallback(() => {
    Alert.alert(
      'Звонок',
      'Звонки Chatus (WebRTC) доступны в обычных чатах. В Telegram-диалоге используйте звонки в приложении Telegram.',
    );
  }, []);

  const handleStartVideoCallPress = useCallback(() => {
    handleStartCallPress();
  }, [handleStartCallPress]);

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
      const cb = typeof onClosed === 'function' ? onClosed : undefined;
      if (!moreMenu) {
        setMoreMenuPhase('list');
        cb?.();
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
        cb?.();
      });
    },
    [moreMenu, moreMenuAnimation],
  );

  const handleMorePress = useCallback(() => {
    openMoreMenu();
  }, [openMoreMenu]);

  const handleApplyChatTheme = useCallback(() => {
    uiStore.getState().setChatTheme(wallpaperKey, draftThemeId);
    setIsThemePickerVisible(false);
  }, [draftThemeId, wallpaperKey]);

  const openThemePicker = useCallback(() => {
    closeMoreMenu(() => {
      setDraftThemeId(currentThemeId);
      setIsThemePickerVisible(true);
    });
  }, [closeMoreMenu, currentThemeId]);

  const handleDeleteChatPress = useCallback(() => {
    closeMoreMenu(() => {
      void (async () => {
        try {
          await ensureReady();
          if (isGroupPeer) {
            await tdlibLeaveChat(chatId);
          } else {
            await tdlibDeleteChat(chatId);
          }
          navigation.navigate('ChatList');
        } catch (e) {
          Alert.alert('Не удалось удалить', e instanceof Error ? e.message : String(e));
        }
      })();
    });
  }, [chatId, closeMoreMenu, ensureReady, isGroupPeer, navigation]);

  const handleBlockMenuItem = useCallback(() => {
    if (peerUserId == null) return;
    if (isBlocked) {
      closeMoreMenu(() => {
        void (async () => {
          try {
            await ensureReady();
            await tdlibUnblockUser(peerUserId);
            setIsBlocked(false);
            Alert.alert('Готово', `${displayName} разблокирован.`);
          } catch (e) {
            Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
          }
        })();
      });
      return;
    }
    closeMoreMenu(() => setBlockSheetVisible(true));
  }, [closeMoreMenu, displayName, ensureReady, isBlocked, peerUserId]);

  const handleConfirmBlockFromSheet = useCallback(() => {
    if (peerUserId == null) return;
    void (async () => {
      try {
        await ensureReady();
        await tdlibBlockUser(peerUserId);
        setIsBlocked(true);
        setBlockSheetVisible(false);
      } catch (e) {
        Alert.alert('Блокировка', e instanceof Error ? e.message : String(e));
      }
    })();
  }, [ensureReady, peerUserId]);

  const toggleHeroExpanded = useCallback(() => {
    if (!avatarUrl) return;
    setIsHeroExpanded((v) => !v);
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
    [actionMenu, actionMenuAnimation],
  );

  const handleShowInChat = useCallback(
    (messageId: string) => {
      closeActionMenu(() => {
        const id = Number.parseInt(messageId, 10);
        navigation.navigate({
          name: 'TelegramChat',
          params: {
            telegramChatId,
            title: displayName,
            avatarUri: avatarUrl ?? routeAvatarUri ?? null,
            chatType: route.params.chatType ?? null,
            focusMessageId: Number.isFinite(id) ? id : undefined,
          },
          merge: true,
        });
      });
    },
    [
      avatarUrl,
      closeActionMenu,
      displayName,
      navigation,
      route.params.chatType,
      routeAvatarUri,
      telegramChatId,
    ],
  );

  const openActionMenu = useCallback(
    (rawMessageId: string, event: GestureResponderEvent) => {
      const messageId = rawMessageId.includes(':')
        ? (rawMessageId.split(':')[0] ?? rawMessageId)
        : rawMessageId;
      const menuWidth = 176;
      const estimatedHeight = 44;
      const sideGap = 12;
      const left = Math.max(
        sideGap,
        Math.min(
          event.nativeEvent.pageX - menuWidth / 2,
          PROFILE_SCREEN_WIDTH - menuWidth - sideGap,
        ),
      );
      const top = Math.max(92, event.nativeEvent.pageY - estimatedHeight - 14);
      actionMenuAnimation.setValue(0);
      setActionMenu({ messageId, top, left });
    },
    [actionMenuAnimation],
  );

  const moreMenuItems = useMemo<AnchoredPopoverMenuItem[]>(() => {
    const items: AnchoredPopoverMenuItem[] = [
      {
        key: 'change-wallpaper',
        label: 'Изменить обои',
        iconImage: WALLPAPER_MENU_ICON,
      },
      {
        key: 'toggle-pin',
        label: isPinned ? 'Открепить' : 'Закрепить',
        icon: 'pin' as any,
      },
      {
        key: 'delete-chat',
        label: isBroadcastChannel ? 'Покинуть канал' : isGroupPeer ? 'Выйти из чата' : 'Удалить чат',
        icon: 'trash-2',
      },
    ];
    if (peerUserId != null) {
      items.push({
        key: 'toggle-block',
        label: isBlocked ? 'Разблокировать' : 'Заблокировать',
        icon: 'slash',
        color: isBlocked ? undefined : '#D04857',
      });
    }
    return items;
  }, [isBlocked, isBroadcastChannel, isGroupPeer, peerUserId, isPinned]);

  const moreMenuDeletePanelHeight = isGroupPeer ? 198 : 198;

  const moreMenuCustomBody = useMemo(() => {
    if (moreMenuPhase !== 'delete') return null;
    return (
      <ChatProfileDeleteHistoryPanel
        peerName={displayName}
        showDeleteForBoth={false}
        onBack={() => setMoreMenuPhase('list')}
        onDeleteBoth={handleDeleteChatPress}
        onDeleteMeOnly={handleDeleteChatPress}
      />
    );
  }, [displayName, handleDeleteChatPress, moreMenuPhase]);

  const handleMoreMenuAction = useCallback(
    (key: string) => {
      if (key === 'change-wallpaper') {
        openThemePicker();
        return;
      }
      if (key === 'toggle-pin') {
        closeMoreMenu(() => {
          const nextPinned = !isPinned;
          setIsPinned(nextPinned);
          tdlibToggleChatIsPinned(chatId, nextPinned).catch(() => setIsPinned(isPinned));
        });
        return;
      }
      if (key === 'toggle-block') {
        handleBlockMenuItem();
        return;
      }
      if (key === 'delete-chat') {
        setMoreMenuPhase('delete');
      }
    },
    [handleBlockMenuItem, openThemePicker],
  );

  const openEditContact = useCallback(() => {
    let fn = '';
    let ln = '';
    if (userRecord) {
      fn = typeof userRecord.first_name === 'string' ? userRecord.first_name.trim() : '';
      ln = typeof userRecord.last_name === 'string' ? userRecord.last_name.trim() : '';
    } else {
      const parts = displayName.trim().split(/\s+/).filter(Boolean);
      fn = parts[0] ?? '';
      ln = parts.slice(1).join(' ');
    }
    setFirstNameDraft(fn);
    setLastNameDraft(ln);
    setIsEditContactVisible(true);
  }, [displayName, userRecord]);

  const closeEditContact = useCallback(() => {
    setIsEditContactVisible(false);
  }, []);

  const handleSaveContactName = useCallback(async () => {
    if (peerUserId == null) {
      setIsEditContactVisible(false);
      return;
    }

    try {
      await ensureReady();
      const phone = userRecord && typeof userRecord.phone_number === 'string'
        ? userRecord.phone_number.trim()
        : '';

      const res = await tdlibClient.send({
        '@type': 'addContact',
        contact: {
          '@type': 'contact',
          phone_number: phone,
          first_name: firstNameDraft.trim(),
          last_name: lastNameDraft.trim(),
          user_id: peerUserId,
          vcard: '',
        },
        share_phone_number: false,
      });
      throwIfTdError(res);

      const nextName = [firstNameDraft.trim(), lastNameDraft.trim()]
        .filter(Boolean)
        .join(' ')
        .trim();
      setDisplayName(nextName || 'Профиль');

      // Update userRecord so next edit doesn't revert
      setUserRecord((prev) => prev ? {
        ...prev,
        first_name: firstNameDraft.trim(),
        last_name: lastNameDraft.trim(),
      } : null);

      setIsEditContactVisible(false);
    } catch (e) {
      setIsEditContactVisible(false);
      Alert.alert('Не удалось сохранить имя', e instanceof Error ? e.message : String(e));
    }
  }, [peerUserId, userRecord, firstNameDraft, lastNameDraft, ensureReady]);

  const handleEditPress = useCallback(() => {
    if (peerUserId != null) {
      openEditContact();
    } else {
      Alert.alert(
        'Имя в Telegram',
        isBroadcastChannel
          ? 'Название канала можно отредактировать в приложении Telegram.'
          : 'Название группы можно отредактировать в приложении Telegram.',
      );
    }
  }, [peerUserId, openEditContact, isBroadcastChannel]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <Animated.ScrollView
        bounces
        overScrollMode="always"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
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
          onEditPress={handleEditPress}
          moreButtonRef={moreButtonRef}
          hideCallAndVideoActions={isBroadcastChannel}
        />

        <ProfileInfoCard infoRows={infoRows} styles={styles} accentColor={themeColors.accent} />

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
                <Image source={{ uri: avatarUrl }} style={styles.editAvatarImage} />
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
