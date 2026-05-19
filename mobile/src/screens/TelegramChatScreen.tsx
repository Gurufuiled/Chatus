import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useChatComposerDockPaddingBottom,
  useChatComposerKeyboardLiftStyles,
} from '../utils/chatComposerKeyboard';
import Reanimated, { useAnimatedKeyboard, useSharedValue } from 'react-native-reanimated';
import type { ChatsStackParamList } from '../navigation/types';
import { ChatContextMenuOverlay } from '../components/ChatContextMenuOverlay';
import { InteractiveChatBackShell } from '../components/InteractiveChatBackShell';
import { TelegramForwardSheet } from '../components/TelegramForwardSheet';
import { FileBubble } from '../components/FileBubble';
import { ImageBubble } from '../components/ImageBubble';
import { InputBar, type FilePickResult, type MediaPickResult } from '../components/InputBar';
import { MessageTextBubbleBody } from '../components/MessageTextBubbleBody';
import { MessageTimeStatus } from '../components/MessageTimeStatus';
import { ReplySwipeWrapper } from '../components/ReplySwipeWrapper';
import { ReplyPreview } from '../components/ReplyPreview';
import { TelegramChannelCommentsBar } from '../components/TelegramChannelCommentsBar';
import { VideoBubble } from '../components/VideoBubble';
import { VideoNoteBubble } from '../components/VideoNoteBubble';
import { VoiceBubble } from '../components/VoiceBubble';
import {
  MeBubbleChrome,
  shouldUseDarkDefaultOutgoingBubbleGradient,
} from '../components/OutgoingBubbleViewportGradient';
import { useTheme } from '../contexts/ThemeContext';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import type { VideoNoteRecordingResult } from '../services/VideoNoteRecorderService';
import type { VoiceRecordingResult } from '../services/VoiceRecorderService';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { uiStore } from '../stores/uiStore';
import { telegramUiStore } from '../stores/telegramUiStore';
import { bubbleRadius } from '../theme/colors';
import { DEFAULT_CHAT_THEME_ID, getChatTheme } from '../theme/chatThemes';
import { ChatBackgroundPattern } from './chatScreen.shared';
import {
  CHAT_MSG_ROW_MARGIN_GROUPED,
  CHAT_MSG_ROW_MARGIN_ISOLATED,
  CHAT_MSG_VERTICAL_PADDING,
} from '../presentation/telegramChatUi';
import {
  buildInputMessageVideoNoteContent,
  fileUriToPath,
  formattedText,
  formatTime,
  getInputReplyTo,
  getLocalInputFile,
} from './telegramChat/composer';
import { computeTelegramChannelPostMediaMaxWidth } from './telegramChat/telegramChannelPostLayout';
import {
  applyReadOutboxStatus,
  canTelegramSwipeReply,
  getTelegramReplyPreviewText,
  getTelegramReplyThumbnailUri,
  isSameTelegramChain,
  markMessageFailed,
  optimisticOutgoingMessage,
  telegramRowToInputReplyMessage,
  upsertMessage,
} from './telegramChat/messageRow';
import {
  createTelegramChatStyles,
  createTelegramStackHeaderPresentationStyles,
} from './telegramChat/telegramChatStyles';
import {
  getLastReadOutboxMessageId,
  getNestedRecord,
  getPinnedMessageIdFromChat,
  loadLastReadOutboxMessageId,
  mapTdMessage,
  mapTdMessages,
} from './telegramChat/tdlibMapping';
import type { TelegramMessageRow } from './telegramChat/types';
import { tdlibDeleteMessages, tdlibForwardMessages } from './telegramChat/tdlibChatActions';
import {
  deleteTelegramMessagesFromCache,
  loadTelegramMessagesFromCache,
  persistTelegramMessages,
} from './telegramChat/telegramMessageCache';
import { scheduleNeighborTelegramChatsPreload } from './telegramChat/telegramChatPreload';
import { useTelegramChatMenu } from './telegramChat/useTelegramChatMenu';

const TELEGRAM_PEER_AVATAR_COLORS = ['#5B8DEF', '#53B7A8', '#F2994A', '#BB6BD9', '#EB5757', '#2D9CDB'];
/** TDLib `inputMessageVideoNote.length` — квадрат, ≤640, как у записи кружка в Chatus. */
const TELEGRAM_VIDEO_NOTE_SIDE_PX = 384;

function telegramPeerAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TELEGRAM_PEER_AVATAR_COLORS[Math.abs(hash) % TELEGRAM_PEER_AVATAR_COLORS.length];
}

/** When viewing a forum/discussion thread, ignore TDLib message updates from other threads in the same chat. */
function tdlibRawMessageMatchesActiveThread(
  rawMessage: Record<string, unknown>,
  activeThreadId: number | undefined,
): boolean {
  if (activeThreadId == null || activeThreadId === 0) return true;
  const mtid = rawMessage.message_thread_id;
  const tid = typeof mtid === 'number' && Number.isFinite(mtid) ? mtid : 0;
  return tid === activeThreadId;
}

export function TelegramChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList, 'TelegramChat'>>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const composerDockPaddingBottom = useChatComposerDockPaddingBottom(insets.bottom);
  const isVoiceRecordingShared = useSharedValue(false);
  const { dockAnimatedStyle: inputDockAnimatedStyle, listWrapAnimatedStyle: listKeyboardAnimatedStyle } =
    useChatComposerKeyboardLiftStyles(useAnimatedKeyboard(), isVoiceRecordingShared);
  const blurTargetRef = useRef<View>(null);
  const { colors, resolvedScheme } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createTelegramChatStyles(colors), [colors]);
  const headerChromeStyles = useMemo(
    () => createTelegramStackHeaderPresentationStyles(colors),
    [colors],
  );
  const route = useRoute<RouteProp<ChatsStackParamList, 'TelegramChat'>>();
  const {
    telegramChatId,
    title,
    avatarUri,
    chatType: routeChatType,
    focusMessageId,
    messageThreadId,
  } = route.params;
  const telegramWallpaperKey = `telegram:${telegramChatId}`;
  const storedWallpaperThemeId = uiStore((s) => s.chatThemeIdByChatId[telegramWallpaperKey]);
  const wallpaperThemeId = storedWallpaperThemeId ?? DEFAULT_CHAT_THEME_ID;
  const chatTheme = useMemo(
    () => getChatTheme(wallpaperThemeId, resolvedScheme),
    [resolvedScheme, wallpaperThemeId],
  );
  const chatId = useMemo(() => Number.parseInt(telegramChatId, 10), [telegramChatId]);

  useFocusEffect(
    useCallback(() => {
      telegramUiStore.getState().setActiveTelegramChatId(telegramChatId);
      return () => telegramUiStore.getState().setActiveTelegramChatId(null);
    }, [telegramChatId]),
  );

  const isChannel = routeChatType === 'channel';
  const isGroupChat = routeChatType === 'group' || routeChatType === 'supergroup';
  const [messages, setMessages] = useState<TelegramMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [replyToMessageId, setReplyToMessageId] = useState<number | null>(null);
  const [forwardMessageIds, setForwardMessageIds] = useState<number[]>([]);
  const [forwardPending, setForwardPending] = useState(false);
  const telegramDialogs = telegramAccountStore((s) => s.dialogs);
  const [pinnedMessageId, setPinnedMessageId] = useState<number | null>(null);
  const [selectedTelegramMessageIds, setSelectedTelegramMessageIds] = useState<string[]>([]);
  const [canPost, setCanPost] = useState(true);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  /** Чат обсуждения канала (`getSupergroupFullInfo.linked_chat_id`), если у сообщения нет `reply_in_chat_id`. */
  const [channelLinkedDiscussionChatId, setChannelLinkedDiscussionChatId] = useState<number | null>(null);
  const oldestMessageIdRef = useRef<number>(0);
  const lastReadOutboxMessageIdRef = useRef<number>(0);
  const loadingOlderRef = useRef(false);
  const historyLoadGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const messagesRef = useRef<TelegramMessageRow[]>([]);
  const listRef = useRef<FlatList<TelegramMessageRow>>(null);
  const [inputBarHeight, setInputBarHeight] = useState(88);
  const [scrollTick, setScrollTick] = useState(0);
  const lastScrollBumpAtRef = useRef(0);
  const bumpScrollTickThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollBumpAtRef.current < 48) return;
    lastScrollBumpAtRef.current = now;
    setScrollTick((t) => (t + 1) & 0xffff);
  }, []);
  const bumpScrollTickImmediate = useCallback(() => {
    setScrollTick((t) => (t + 1) & 0xffff);
  }, []);

  const headerTitle = useMemo(() => title || `Telegram ${telegramChatId}`, [telegramChatId, title]);
  const headerSubtitle = useMemo(() => {
    if (memberCount != null && memberCount > 0) {
      return isChannel
        ? `${memberCount.toLocaleString()} подписчиков`
        : `${memberCount.toLocaleString()} участников`;
    }
    return null;
  }, [isChannel, memberCount]);
  const messageById = useMemo(() => {
    const map = new Map<number, TelegramMessageRow>();
    for (const message of messages) {
      map.set(message.messageId, message);
    }
    return map;
  }, [messages]);
  const replyToRow = replyToMessageId != null ? messageById.get(replyToMessageId) ?? null : null;
  const replyToInputMessage = useMemo(
    () => (replyToRow ? telegramRowToInputReplyMessage(replyToRow, chatId) : null),
    [chatId, replyToRow],
  );
  const replyAuthorName = replyToRow ? (replyToRow.outgoing ? 'Вы' : headerTitle) : null;

  const telegramSelectionMode = selectedTelegramMessageIds.length > 0;

  const channelMediaClamp = useMemo(
    () => ({
      maxWidth: computeTelegramChannelPostMediaMaxWidth({
        screenWidth: windowWidth,
        telegramSelectionMode,
      }),
      maxHeight: Math.min(windowHeight * 0.52, 520),
    }),
    [telegramSelectionMode, windowWidth, windowHeight],
  );

  const selectedTelegramIdSet = useMemo(
    () => new Set(selectedTelegramMessageIds),
    [selectedTelegramMessageIds],
  );

  const enterTelegramSelection = useCallback((rowId: string) => {
    setSelectedTelegramMessageIds([rowId]);
  }, []);

  const toggleTelegramSelection = useCallback((rowId: string) => {
    setSelectedTelegramMessageIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId],
    );
  }, []);

  const clearTelegramSelection = useCallback(() => {
    setSelectedTelegramMessageIds([]);
  }, []);

  const selectedTelegramRows = useMemo(() => {
    const rows: TelegramMessageRow[] = [];
    for (const sid of selectedTelegramMessageIds) {
      const row = messages.find((m) => m.id === sid);
      if (row) rows.push(row);
    }
    return rows;
  }, [messages, selectedTelegramMessageIds]);

  const selectedTdMessageIds = useMemo(() => {
    const ids = selectedTelegramRows.filter((r) => r.messageId > 0).map((r) => r.messageId);
    return [...new Set(ids)].sort((a, b) => a - b);
  }, [selectedTelegramRows]);

  const canBatchTdLib = selectedTdMessageIds.length > 0;

  const ensureReady = useCallback(async () => {
    await applyTdlibParameters();
    const { ready, state } = await waitForTdlibAuthorizationReady();
    if (!ready) {
      throw new Error(`Сессия Telegram не готова (${state ?? 'таймаут'})`);
    }
  }, []);

  const handleOpenDiscussion = useCallback(
    (item: TelegramMessageRow) => {
      const cid =
        item.discussionChatId != null && item.discussionChatId !== 0
          ? item.discussionChatId
          : channelLinkedDiscussionChatId;
      if (cid == null || cid === 0) return;
      const threadId =
        item.messageThreadId != null && item.messageThreadId !== 0
          ? item.messageThreadId
          : item.messageId;
      navigation.navigate({
        name: 'TelegramChat',
        params: {
          telegramChatId: String(cid),
          title: 'Обсуждение',
          avatarUri: null,
          chatType: 'supergroup',
          messageThreadId: threadId,
        },
      });
    },
    [navigation, channelLinkedDiscussionChatId],
  );

  const handleStartForward = useCallback((messageIds: number[]) => {
    const ids = [...new Set(messageIds.filter((id) => id > 0))].sort((a, b) => a - b);
    if (ids.length === 0) return;
    setForwardMessageIds(ids);
  }, []);

  const handleForwardSheetClose = useCallback(() => {
    setForwardMessageIds([]);
    setForwardPending(false);
  }, []);

  const handleForwardToTelegramChat = useCallback(
    async (destChatIdStr: string) => {
      if (forwardPending) return;
      const destChatId = Number.parseInt(destChatIdStr, 10);
      if (!Number.isFinite(destChatId) || !Number.isFinite(chatId) || forwardMessageIds.length === 0) {
        return;
      }
      setForwardPending(true);
      try {
        await ensureReady();
        await tdlibForwardMessages(chatId, destChatId, forwardMessageIds);
        setForwardMessageIds([]);
        clearTelegramSelection();
      } catch (err) {
        Alert.alert('Переслать', err instanceof Error ? err.message : String(err));
      } finally {
        setForwardPending(false);
      }
    },
    [chatId, clearTelegramSelection, ensureReady, forwardMessageIds, forwardPending],
  );

  const handleTelegramBatchForward = useCallback(() => {
    if (!canBatchTdLib) return;
    handleStartForward(selectedTdMessageIds);
  }, [canBatchTdLib, handleStartForward, selectedTdMessageIds]);

  const handleTelegramBatchDelete = useCallback(() => {
    if (!canBatchTdLib || !Number.isFinite(chatId)) return;
    const outgoingIds = [
      ...new Set(
        selectedTelegramRows.filter((r) => r.messageId > 0 && r.outgoing).map((r) => r.messageId),
      ),
    ];
    const incomingIds = [
      ...new Set(
        selectedTelegramRows.filter((r) => r.messageId > 0 && !r.outgoing).map((r) => r.messageId),
      ),
    ];

    let body = '';
    if (outgoingIds.length > 0 && incomingIds.length > 0) {
      body = 'Свои сообщения будут удалены у всех участников, чужие — только у вас.';
    } else if (outgoingIds.length > 0) {
      body = 'Сообщения будут удалены у всех участников.';
    } else {
      body = 'Сообщения будут удалены только у вас.';
    }

    Alert.alert('Удалить выбранные?', body, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await ensureReady();
              if (outgoingIds.length > 0) {
                await tdlibDeleteMessages(chatId, outgoingIds, true);
              }
              if (incomingIds.length > 0) {
                await tdlibDeleteMessages(chatId, incomingIds, false);
              }
              clearTelegramSelection();
            } catch (err) {
              Alert.alert('Удаление', err instanceof Error ? err.message : String(err));
            }
          })();
        },
      },
    ]);
  }, [canBatchTdLib, chatId, clearTelegramSelection, ensureReady, selectedTelegramRows]);

  const {
    menuState,
    menuMode,
    menuAnim,
    telegramMenuActions,
    activeMenuMessage,
    setMessageContentRef,
    closeMenu,
    openTelegramMessageMenu,
    handleTelegramMenuAction,
    handleTelegramDeleteConfirmAction,
    handleTelegramPickReaction,
    renderTelegramMenuPreviewBody,
  } = useTelegramChatMenu({
    chatId,
    messages,
    messagesRef,
    messageById,
    colors,
    styles,
    headerTitle,
    isGroupChat,
    inputBarHeight,
    insets,
    setReplyToMessageId,
    pinnedMessageId,
    setPinnedMessageId,
    ensureReady,
    showMenuReactions: true,
    onEnterSelection: enterTelegramSelection,
    onStartForward: handleStartForward,
    chatTheme,
    resolvedScheme,
    scrollTick,
  });

  const handleOpenTelegramMemberProfile = useCallback(
    async (row: TelegramMessageRow) => {
      if (row.senderUserId == null) return;
      try {
        await ensureReady();
        const chat = (await tdlibClient.send({
          '@type': 'createPrivateChat',
          user_id: row.senderUserId,
          force: false,
        })) as Record<string, unknown>;
        throwIfTdError(chat);
        const cid = typeof chat.id === 'number' ? chat.id : null;
        if (cid == null || !Number.isFinite(cid)) return;
        navigation.navigate('TelegramChatProfile', {
          telegramChatId: String(cid),
          title: row.senderName ?? undefined,
          avatarUri: row.senderAvatarUri ?? null,
          chatType: 'private',
        });
      } catch (e) {
        Alert.alert('Профиль', e instanceof Error ? e.message : String(e));
      }
    },
    [ensureReady, navigation],
  );

  useLayoutEffect(() => {
    const initialChar = (headerTitle.trim()[0] || '?').toUpperCase();
    if (telegramSelectionMode) {
      navigation.setOptions({
        headerTitle: () => (
          <Text style={headerChromeStyles.headerTitleText}>
            {selectedTelegramMessageIds.length === 1
              ? '1 сообщение'
              : `${selectedTelegramMessageIds.length} сообщ.`}
          </Text>
        ),
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отменить выбор"
            onPress={clearTelegramSelection}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
          >
            <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '600' }}>Отмена</Text>
          </Pressable>
        ),
      });
      return;
    }
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={headerTitle}
          accessibilityHint="Открывает профиль"
          onPress={() =>
            navigation.navigate('TelegramChatProfile', {
              telegramChatId,
              title: headerTitle,
              avatarUri: avatarUri ?? null,
              chatType: routeChatType ?? null,
            })
          }
          style={({ pressed }) => [
            headerChromeStyles.pressableRow,
            pressed ? headerChromeStyles.pressablePressed : null,
          ]}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={headerChromeStyles.avatar} />
          ) : (
            <View style={headerChromeStyles.avatarPlaceholder}>
              <Text style={headerChromeStyles.avatarPlaceholderLetter}>{initialChar}</Text>
            </View>
          )}
          <View style={headerChromeStyles.titleWrap}>
            <Text style={headerChromeStyles.headerTitleText} numberOfLines={1} ellipsizeMode="tail">
              {headerTitle}
            </Text>
            {headerSubtitle ? (
              <Text style={headerChromeStyles.headerSubtitleText} numberOfLines={1} ellipsizeMode="tail">
                {headerSubtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ),
      headerRight: undefined,
    });
  }, [
    avatarUri,
    clearTelegramSelection,
    routeChatType,
    telegramChatId,
    colors.accent,
    headerChromeStyles,
    headerSubtitle,
    headerTitle,
    navigation,
    selectedTelegramMessageIds.length,
    telegramSelectionMode,
  ]);

  messagesRef.current = messages;

  useEffect(() => {
    if (focusMessageId == null || !Number.isFinite(focusMessageId)) return;
    const ix = messages.findIndex((m) => m.messageId === focusMessageId);
    if (ix < 0) return;
    const frame = requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({
          index: ix,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {
        /* scrollToIndex can throw before layout */
      }
      navigation.setParams({ focusMessageId: undefined });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusMessageId, messages, navigation]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    historyLoadGenerationRef.current += 1;
    setMessages([]);
    oldestMessageIdRef.current = 0;
    lastReadOutboxMessageIdRef.current = 0;
    setLoading(true);
    setLastError(null);
  }, [chatId, messageThreadId]);

  useEffect(() => {
    if (!isFocused || telegramDialogs.length === 0) return;
    scheduleNeighborTelegramChatsPreload(telegramChatId, telegramDialogs);
  }, [isFocused, telegramChatId, telegramDialogs]);

  useEffect(() => {
    if (!Number.isFinite(chatId)) return;
    setChannelLinkedDiscussionChatId(null);
    let cancelled = false;

    async function loadChatMeta() {
      try {
        await ensureReady();
        const chat = (await tdlibClient.send({
          '@type': 'getChat',
          chat_id: chatId,
        })) as Record<string, unknown>;
        throwIfTdError(chat);
        if (!cancelled) {
          setPinnedMessageId(getPinnedMessageIdFromChat(chat));
        }
        const type = getNestedRecord(chat.type);
        const isBroadcastChannel =
          type?.['@type'] === 'chatTypeSupergroup' && type?.is_channel === true;
        const perms = getNestedRecord(chat.permissions);
        if (!cancelled) {
          setCanPost(!isBroadcastChannel || perms?.can_send_basic_messages !== false);
        }
        const typeKind = type?.['@type'];
        if (typeKind === 'chatTypeSupergroup') {
          const sgId = typeof type?.supergroup_id === 'number' ? type.supergroup_id : null;
          if (sgId != null) {
            const sg = (await tdlibClient.send({
              '@type': 'getSupergroup',
              supergroup_id: sgId,
            })) as Record<string, unknown>;
            throwIfTdError(sg);
            if (!cancelled && typeof sg.member_count === 'number') {
              setMemberCount(sg.member_count);
            }
            if (isBroadcastChannel && !cancelled) {
              try {
                const sgf = (await tdlibClient.send({
                  '@type': 'getSupergroupFullInfo',
                  supergroup_id: sgId,
                })) as Record<string, unknown>;
                throwIfTdError(sgf);
                const lid = sgf.linked_chat_id;
                const linked =
                  typeof lid === 'number' && Number.isFinite(lid) && lid !== 0 ? lid : null;
                if (!cancelled) setChannelLinkedDiscussionChatId(linked);
              } catch {
                if (!cancelled) setChannelLinkedDiscussionChatId(null);
              }
            } else if (!cancelled) {
              setChannelLinkedDiscussionChatId(null);
            }
          } else if (!cancelled) {
            setChannelLinkedDiscussionChatId(null);
          }
        } else if (typeKind === 'chatTypeBasicGroup') {
          const bgId = typeof type?.basic_group_id === 'number' ? type.basic_group_id : null;
          if (bgId != null) {
            const bg = (await tdlibClient.send({
              '@type': 'getBasicGroup',
              basic_group_id: bgId,
            })) as Record<string, unknown>;
            throwIfTdError(bg);
            if (!cancelled && typeof bg.member_count === 'number') {
              setMemberCount(bg.member_count);
            }
          }
          if (!cancelled) setChannelLinkedDiscussionChatId(null);
        } else if (!cancelled) {
          setChannelLinkedDiscussionChatId(null);
        }
      } catch {
        /* best-effort */
      }
    }

    void loadChatMeta();
    return () => {
      cancelled = true;
    };
  }, [chatId, ensureReady]);

  const loadHistory = useCallback(
    async (older = false) => {
      if (!Number.isFinite(chatId)) return;
      const loadGeneration = historyLoadGenerationRef.current;
      const isStaleLoad = () => loadGeneration !== historyLoadGenerationRef.current;

      if (older) {
        if (loadingOlderRef.current || oldestMessageIdRef.current === 0) return;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
      } else {
        setLoading(true);
      }

      const threadParam =
        typeof messageThreadId === 'number' &&
        Number.isFinite(messageThreadId) &&
        messageThreadId !== 0
          ? messageThreadId
          : 0;

      const mapHistoryOptions = {
        loadSenderAvatar: false,
        mediaLocalOnly: true,
      } as const;

      const mergeMapped = (mapped: TelegramMessageRow[], appendOlder: boolean) => {
        if (isStaleLoad() || mapped.length === 0) return;
        setMessages((prev) => {
          if (isStaleLoad()) return prev;
          const merged = [...prev];
          for (const item of mapped) {
            const idx = merged.findIndex((existing) => existing.id === item.id);
            if (idx >= 0) merged[idx] = item;
            else merged.push(item);
          }
          const sorted = merged.sort((a, b) => b.messageId - a.messageId);
          oldestMessageIdRef.current = sorted.length > 0 ? sorted[sorted.length - 1].messageId : 0;
          return sorted;
        });
        void persistTelegramMessages(chatId, threadParam, mapped).catch(() => {});
      };

      const fetchBatch = async (onlyLocal: boolean) => {
        const [lastReadOutboxMessageId, response] = await Promise.all([
          older
            ? Promise.resolve(lastReadOutboxMessageIdRef.current)
            : loadLastReadOutboxMessageId(chatId),
          tdlibClient.send({
            '@type': 'getChatHistory',
            chat_id: chatId,
            from_message_id: older ? oldestMessageIdRef.current : 0,
            offset: 0,
            limit: 50,
            only_local: onlyLocal,
            message_thread_id: threadParam,
          }) as Promise<Record<string, unknown>>,
        ]);
        throwIfTdError(response);
        lastReadOutboxMessageIdRef.current = Math.max(
          lastReadOutboxMessageIdRef.current,
          lastReadOutboxMessageId,
        );
        const rawMessages = Array.isArray(response.messages) ? response.messages : [];
        return mapTdMessages(
          rawMessages.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object'),
          lastReadOutboxMessageIdRef.current,
          8,
          mapHistoryOptions,
        );
      };

      try {
        if (!older) {
          try {
            const cached = await loadTelegramMessagesFromCache(chatId, threadParam);
            if (mountedRef.current && cached.length > 0) {
              mergeMapped(cached, false);
              setLoading(false);
            }
          } catch {
            /* sqlite cache miss */
          }
        }

        await ensureReady();

        if (!older) {
          try {
            const localMapped = await fetchBatch(true);
            if (mountedRef.current && localMapped.length > 0) {
              mergeMapped(localMapped, false);
              setLoading(false);
            }
          } catch {
            /* local cache miss is fine */
          }
        }

        const mapped = await fetchBatch(false);
        if (!mountedRef.current || isStaleLoad()) return;
        mergeMapped(mapped, older);
        if (!isStaleLoad()) setLastError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!mountedRef.current || isStaleLoad()) return;
        setLastError(message);
        if (!older) Alert.alert('Telegram', message);
      } finally {
        if (!mountedRef.current || isStaleLoad()) return;
        setLoading(false);
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      }
    },
    [chatId, ensureReady, messageThreadId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadHistory(false);
      const unsubscribe = tdlibClient.subscribe((json) => {
        try {
          const update = JSON.parse(json) as Record<string, unknown>;
          const type = update['@type'];

          if (type === 'updateChatPinnedMessage') {
            if (update.chat_id !== chatId) return;
            const pid = update.pinned_message_id;
            const next =
              typeof pid === 'number' && Number.isFinite(pid) && pid > 0 ? pid : null;
            setPinnedMessageId(next);
            return;
          }

          if (type === 'updateDeleteMessages') {
            if (update.chat_id !== chatId) return;
            const rawIds = update.message_ids;
            if (!Array.isArray(rawIds)) return;
            const idSet = new Set(
              rawIds.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)),
            );
            if (idSet.size === 0) return;
            const threadParam =
              typeof messageThreadId === 'number' &&
              Number.isFinite(messageThreadId) &&
              messageThreadId !== 0
                ? messageThreadId
                : 0;
            setMessages((prev) => prev.filter((m) => !idSet.has(m.messageId)));
            void deleteTelegramMessagesFromCache(chatId, threadParam, [...idSet]).catch(() => {});
            return;
          }

          if (type === 'updateChatReadOutbox') {
            if (update.chat_id !== chatId) return;
            const lastReadOutboxMessageId = getLastReadOutboxMessageId(update);
            if (lastReadOutboxMessageId <= lastReadOutboxMessageIdRef.current) return;
            lastReadOutboxMessageIdRef.current = lastReadOutboxMessageId;
            setMessages((prev) => applyReadOutboxStatus(prev, lastReadOutboxMessageId));
            return;
          }

          if (
            type !== 'updateNewMessage' &&
            type !== 'updateMessageSendSucceeded' &&
            type !== 'updateMessageSendFailed'
          ) {
            return;
          }

          const rawMessage = getNestedRecord(update.message);
          const oldMessageId =
            typeof update.old_message_id === 'number' && Number.isFinite(update.old_message_id)
              ? update.old_message_id
              : null;
          if (!rawMessage || rawMessage.chat_id !== chatId) {
            if (type === 'updateMessageSendFailed' && oldMessageId != null) {
              setMessages((prev) => markMessageFailed(prev, oldMessageId));
            }
            return;
          }

          const activeThreadFilterId =
            typeof messageThreadId === 'number' && Number.isFinite(messageThreadId) && messageThreadId !== 0
              ? messageThreadId
              : undefined;
          if (!tdlibRawMessageMatchesActiveThread(rawMessage, activeThreadFilterId)) {
            if (type === 'updateMessageSendFailed' && oldMessageId != null) {
              setMessages((prev) => markMessageFailed(prev, oldMessageId));
            }
            return;
          }

          const threadParam =
            typeof messageThreadId === 'number' &&
            Number.isFinite(messageThreadId) &&
            messageThreadId !== 0
              ? messageThreadId
              : 0;
          void mapTdMessage(rawMessage, lastReadOutboxMessageIdRef.current, {
            loadSenderAvatar: false,
            mediaLocalOnly: true,
          }).then((row) => {
            if (!row || !mountedRef.current) return;
            setMessages((prev) => upsertMessage(prev, row, oldMessageId));
            void persistTelegramMessages(chatId, threadParam, [row]).catch(() => {});
          });
        } catch {
          /* ignore malformed TDLib updates */
        }
      });
      return unsubscribe;
    }, [chatId, isGroupChat, loadHistory, messageThreadId]),
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !Number.isFinite(chatId)) return;
      const tempId = -Date.now();
      const activeReplyToMessageId = replyToMessageId;
      const optimistic: TelegramMessageRow = {
        id: `temp-${Math.abs(tempId)}`,
        messageId: tempId,
        kind: 'text',
        text: trimmed,
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
        replyToMessageId: activeReplyToMessageId,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_content: {
            '@type': 'inputMessageText',
            text: {
              '@type': 'formattedText',
              text: trimmed,
              entities: [],
            },
          },
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const mapped = await mapTdMessage(response, lastReadOutboxMessageIdRef.current);
        if (mapped) {
          setMessages((prev) => upsertMessage(prev.filter((item) => item.id !== optimistic.id), mapped));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, status: 'failed' } : item)));
        Alert.alert('Не удалось отправить', message);
      }
    },
    [chatId, ensureReady, replyToMessageId],
  );

  const sendVoice = useCallback(
    async (result: VoiceRecordingResult) => {
      if (!Number.isFinite(chatId)) return;
      const tempId = -Date.now();
      const activeReplyToMessageId = replyToMessageId;
      const localPath = fileUriToPath(result.uri);
      const optimistic: TelegramMessageRow = {
        id: `temp-${Math.abs(tempId)}`,
        messageId: tempId,
        kind: 'voice',
        text: 'Голосовое',
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
        replyToMessageId: activeReplyToMessageId,
        voiceUri: result.uri,
        durationMs: result.durationMs,
        waveform: result.waveform,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_content: {
            '@type': 'inputMessageVoiceNote',
            voice_note: {
              '@type': 'inputFileLocal',
              path: localPath,
            },
            duration: Math.max(1, Math.round(result.durationMs / 1000)),
          },
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const mapped = await mapTdMessage(response, lastReadOutboxMessageIdRef.current);
        if (mapped) {
          setMessages((prev) => upsertMessage(prev.filter((item) => item.id !== optimistic.id), {
            ...mapped,
            voiceUri: mapped.voiceUri ?? result.uri,
            waveform: mapped.waveform && mapped.waveform.length > 0 ? mapped.waveform : result.waveform,
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, status: 'failed' } : item)));
        Alert.alert('Не удалось отправить голосовое', message);
      }
    },
    [chatId, ensureReady, replyToMessageId],
  );

  const sendVideoNote = useCallback(
    async (result: VideoNoteRecordingResult) => {
      if (!Number.isFinite(chatId)) return;
      const tempId = -Date.now();
      const activeReplyToMessageId = replyToMessageId;
      const optimistic: TelegramMessageRow = {
        id: `temp-${Math.abs(tempId)}`,
        messageId: tempId,
        kind: 'video_note',
        text: 'Видеосообщение',
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
        replyToMessageId: activeReplyToMessageId,
        mediaUri: result.uri,
        thumbnailUri: result.thumbnailUri,
        durationMs: result.durationMs,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const inputMessageContent = buildInputMessageVideoNoteContent({
          videoUri: result.uri,
          thumbnailUri: result.thumbnailUri,
          durationMs: result.durationMs,
          lengthPx: TELEGRAM_VIDEO_NOTE_SIDE_PX,
        });
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_content: inputMessageContent,
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const mapped = await mapTdMessage(response, lastReadOutboxMessageIdRef.current);
        if (!mapped) {
          throw new Error('Telegram не вернул отправленное сообщение.');
        }
        if (mapped.kind === 'video') {
          const sentId = typeof response.id === 'number' ? response.id : null;
          if (sentId != null) {
            await tdlibDeleteMessages(chatId, [sentId], true).catch(() => undefined);
          }
          throw new Error(
            'Файл не подошёл для кружка (нужно квадратное видео). Запишите ещё раз: свайп вверх по кнопке микрофона → удержание → отпустите.',
          );
        }
        setMessages((prev) => upsertMessage(prev.filter((item) => item.id !== optimistic.id), {
          ...mapped,
          mediaUri: mapped.mediaUri ?? result.uri,
          thumbnailUri: mapped.thumbnailUri ?? result.thumbnailUri,
          durationMs: mapped.durationMs ?? result.durationMs,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, status: 'failed' } : item)));
        Alert.alert('Не удалось отправить видеосообщение', message);
      }
    },
    [chatId, ensureReady, replyToMessageId],
  );

  const sendInputMessageContent = useCallback(
    async (
      inputMessageContent: Record<string, unknown>,
      optimisticText: string,
      failureTitle: string,
      optimisticKind: TelegramMessageRow['kind'] = 'text',
      optimisticExtras?: Partial<Pick<TelegramMessageRow, 'mediaUri' | 'fileName' | 'fileSize'>>,
    ) => {
      if (!Number.isFinite(chatId)) return;
      const activeReplyToMessageId = replyToMessageId;
      const optimistic = optimisticOutgoingMessage(
        optimisticText,
        -Date.now(),
        activeReplyToMessageId,
        optimisticKind,
        optimisticExtras,
      );
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessage',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_content: inputMessageContent,
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const mapped = await mapTdMessage(response, lastReadOutboxMessageIdRef.current);
        if (mapped) {
          setMessages((prev) => upsertMessage(prev.filter((item) => item.id !== optimistic.id), mapped));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) => prev.map((item) => (item.id === optimistic.id ? { ...item, status: 'failed' } : item)));
        Alert.alert(failureTitle, message);
      }
    },
    [chatId, ensureReady, replyToMessageId],
  );

  const sendMedia = useCallback(
    async (result: MediaPickResult) => {
      if (result.kind === 'video') {
        await sendInputMessageContent(
          {
            '@type': 'inputMessageVideo',
            video: getLocalInputFile(result.uri),
            duration: Math.max(1, Math.round((result.durationMs ?? 1000) / 1000)),
            width: Math.max(1, Math.round(result.width ?? 1)),
            height: Math.max(1, Math.round(result.height ?? 1)),
            supports_streaming: true,
            caption: formattedText(result.caption),
          },
          result.caption?.trim() ? `Видео: ${result.caption.trim()}` : 'Видео',
          'Не удалось отправить видео',
          'video',
          { mediaUri: result.uri },
        );
        return;
      }

      await sendInputMessageContent(
        {
          '@type': 'inputMessagePhoto',
          photo: getLocalInputFile(result.uri),
          width: Math.max(1, Math.round(result.width ?? 1)),
          height: Math.max(1, Math.round(result.height ?? 1)),
          caption: formattedText(result.caption),
        },
        result.caption?.trim() ? `Фото: ${result.caption.trim()}` : 'Фото',
        'Не удалось отправить фото',
        'image',
        { mediaUri: result.uri },
      );
    },
    [sendInputMessageContent],
  );

  const sendFile = useCallback(
    async (result: FilePickResult) => {
      await sendInputMessageContent(
        {
          '@type': 'inputMessageDocument',
          document: getLocalInputFile(result.uri),
          disable_content_type_detection: false,
          caption: formattedText(),
        },
        result.name.trim() || 'Файл',
        'Не удалось отправить файл',
        'file',
        { mediaUri: result.uri, fileName: result.name, fileSize: result.size },
      );
    },
    [sendInputMessageContent],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: TelegramMessageRow; index: number }) => {
      const isMe = item.outgoing;
      const useViewportOutgoingGradient =
        isMe && shouldUseDarkDefaultOutgoingBubbleGradient(chatTheme, resolvedScheme);
      const meBubbleFill =
        isMe && useViewportOutgoingGradient ? '#00000000' : chatTheme.bubbleMe;
      const outgoingBubbleTextColor = isMe ? chatTheme.bubbleMeText : '#FFFFFF';
      const outgoingBubbleMetaColor = isMe ? chatTheme.bubbleMeMeta : colors.textSecondary;
      const outgoingBubbleAccentColor = isMe ? chatTheme.bubbleMeAccent : colors.accent;
      const outgoingMessageTextStyle = isMe
        ? [styles.messageText, { color: chatTheme.bubbleMeText }]
        : styles.messageText;

      const msgs = messagesRef.current;
      const isGroupedAbove = isSameTelegramChain(msgs[index + 1], item, isGroupChat);
      const isGroupedBelow = isSameTelegramChain(msgs[index - 1], item, isGroupChat);
      const isLastInGroup = !isGroupedBelow;
      const marginTop = isGroupedAbove ? CHAT_MSG_ROW_MARGIN_GROUPED : CHAT_MSG_ROW_MARGIN_ISOLATED;
      const marginBottom = isGroupedBelow ? CHAT_MSG_ROW_MARGIN_GROUPED : CHAT_MSG_ROW_MARGIN_ISOLATED;

      const replyTarget = item.replyToMessageId != null ? messageById.get(item.replyToMessageId) ?? null : null;
      const replySnippet = item.replyToMessageId != null ? (
        <ReplyPreview
          author={
            replyTarget
              ? replyTarget.outgoing
                ? 'Вы'
                : isGroupChat && replyTarget.senderName
                  ? replyTarget.senderName
                  : headerTitle
              : 'Исходное сообщение'
          }
          text={replyTarget ? getTelegramReplyPreviewText(replyTarget) : 'Исходное сообщение недоступно'}
          accentColor={isMe ? chatTheme.replyAccentMe : colors.accent}
          backgroundColor={
            isMe
              ? resolvedScheme === 'dark'
                ? 'rgba(255,255,255,0.14)'
                : chatTheme.replyBubbleMe
              : colors.inputBackground
          }
          textColor={isMe ? chatTheme.replyTextMe : colors.textSecondary}
          authorColor={isMe ? chatTheme.replyAuthorMe : colors.accent}
          thumbnailUri={getTelegramReplyThumbnailUri(replyTarget)}
        />
      ) : null;
      const handleOpenMessageMenu = () => {
        openTelegramMessageMenu(item);
      };

      // Ник показываем только на ПЕРВОМ сообщении цепочки (!isGroupedAbove)
      const senderNameNode =
        !isMe && item.senderName && isGroupChat && !isGroupedAbove ? (
          <Text style={styles.senderNameText} numberOfLines={1}>
            {item.senderName}
          </Text>
        ) : null;

      const bubbleHeader =
        senderNameNode || replySnippet ? (
          <>
            {senderNameNode}
            {replySnippet}
          </>
        ) : null;

      const viewCountFormatted =
        item.viewCount != null
          ? item.viewCount >= 1_000_000
            ? `${(item.viewCount / 1_000_000).toFixed(1)}M`
            : item.viewCount >= 1_000
              ? `${(item.viewCount / 1_000).toFixed(1)}K`
              : String(item.viewCount)
          : null;

      const channelIncoming = isChannel && !isMe;
      const resolvedDiscussionChatId =
        item.discussionChatId != null && item.discussionChatId !== 0
          ? item.discussionChatId
          : channelLinkedDiscussionChatId;
      const showDiscussionFooter =
        isChannel &&
        resolvedDiscussionChatId != null &&
        resolvedDiscussionChatId !== 0;

      const discussionFooter = showDiscussionFooter ? (
        <TelegramChannelCommentsBar
          replyCount={item.discussionReplyCount}
          accentColor={colors.accent}
          mutedColor={colors.textSecondary}
          borderColor={colors.separator}
          onPress={() => handleOpenDiscussion(item)}
        />
      ) : null;

      /** Как в `ChatMessageList`: полная ширина строки → `messageWrap` с боковым padding и `alignItems` для своих/чужих. */
      const pressableRowStyle =
        !isMe && isGroupChat
          ? ({ flex: 1, minWidth: 0 } as const)
          : ({ width: '100%' } as const);
      const pressableA11y = telegramSelectionMode
        ? {
            accessibilityRole: 'button' as const,
            accessibilityHint: 'Нажмите, чтобы отметить сообщение',
            onPress: () => toggleTelegramSelection(item.id),
          }
        : {
            accessibilityRole: 'button' as const,
            accessibilityHint: 'Удерживайте для меню сообщения',
            onLongPress: handleOpenMessageMenu,
            delayLongPress: 260,
          };

      const wrapGroupIncoming = (element: React.ReactElement) => {
        if (isMe || !isGroupChat) return element;
        const seed = String(item.senderUserId ?? item.senderName ?? item.id);
        const avatarInitial = (item.senderName?.trim()[0] || '?').toUpperCase();
        // Аватар — только на ПОСЛЕДНЕМ сообщении цепочки (isLastInGroup)
        const showAvatar = isLastInGroup;
        const openProfile =
          showAvatar && item.senderUserId != null && !telegramSelectionMode
            ? () => void handleOpenTelegramMemberProfile(item)
            : undefined;
        return (
          <View style={styles.groupIncomingRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showAvatar && item.senderUserId != null
                  ? `Профиль: ${item.senderName ?? 'Участник'}`
                  : undefined
              }
              disabled={!showAvatar || item.senderUserId == null || telegramSelectionMode}
              hitSlop={showAvatar ? 10 : 0}
              onPress={openProfile}
              style={styles.groupAvatarSlot}
            >
              {showAvatar ? (
                item.senderAvatarUri ? (
                  <Image source={{ uri: item.senderAvatarUri }} style={styles.groupAvatarImage} />
                ) : (
                  <View style={[styles.groupAvatarFallback, { backgroundColor: telegramPeerAvatarColor(seed) }]}>
                    <Text style={styles.groupAvatarInitial}>{avatarInitial}</Text>
                  </View>
                )
              ) : null}
            </Pressable>
            <View style={styles.groupIncomingContent}>{element}</View>
          </View>
        );
      };

      const wrapMessageChrome = (omitOuterMargins: boolean, body: React.ReactNode) => (
        <View style={[styles.messagePressable, !omitOuterMargins && { marginTop, marginBottom }]}>
          <View style={styles.messageRowShell}>
            <View style={styles.messageCardColumn}>{body}</View>
          </View>
        </View>
      );

      const handleSwipeReply = () => {
        if (item.messageId > 0) {
          setReplyToMessageId((current) => (current === item.messageId ? current : item.messageId));
        }
      };

      const wrapSelectionShell = (inner: React.ReactElement) => {
        const wrappedBubble = (
          <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
            {wrapGroupIncoming(inner)}
          </View>
        );
        const layered = wrapMessageChrome(false, wrappedBubble);
        const withSwipe =
          !telegramSelectionMode && canTelegramSwipeReply(item) ? (
            <ReplySwipeWrapper enabled onReply={handleSwipeReply}>
              {layered}
            </ReplySwipeWrapper>
          ) : (
            layered
          );
        if (!telegramSelectionMode) return withSwipe;
        const selected = selectedTelegramIdSet.has(item.id);
        return (
          <View style={[styles.selectionOuterRow, { marginTop, marginBottom }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggleTelegramSelection(item.id)}
              style={styles.selectionCheckboxHit}
            >
              <View style={[styles.selectionCheckboxOuter, selected && styles.selectionCheckboxOuterOn]}>
                {selected ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
            <View style={[styles.selectionBubbleColumn, isMe && styles.selectionBubbleColumnMe]}>
              {wrapMessageChrome(true, wrappedBubble)}
            </View>
          </View>
        );
      };

      /** Чтобы пузырь не растягивался на всю ширину `Pressable` с `width: '100%'` — как в Chatus. */
      const contentMeasureStyle: ViewStyle = isMe
        ? { alignSelf: 'flex-end' }
        : { alignSelf: 'flex-start' };

      const measureShellStyle = [
        styles.messageContentMeasure,
        channelIncoming
          ? styles.channelIncomingWrap
          : isChannel && isMe
            ? styles.channelOutgoingPostWrap
            : !isMe && isGroupChat
              ? styles.groupIncomingBubbleMeasure
              : contentMeasureStyle,
      ];

      const channelPostMedia = isChannel;

      const outgoingBubbleSurfaceStyle = isMe
        ? {
            backgroundColor: chatTheme.bubbleMe,
            ...(isLastInGroup ? { borderBottomRightRadius: 6 } : null),
          }
        : null;

      const textBubbleColorStyle = isMe
        ? outgoingBubbleSurfaceStyle
        : [
            isLastInGroup ? styles.bubbleOther : styles.bubbleOtherChained,
            isGroupChat && styles.groupMessageSurface,
          ];

      const outgoingGradientBubbleStyle = [
        styles.bubble,
        isLastInGroup ? { borderBottomRightRadius: 6 } : null,
      ];

      const mediaStackStyle = channelIncoming ? styles.mediaStackChannel : styles.mediaStack;

      const wrapTelegramMediaBubble = (content: React.ReactNode) => (
        <View style={mediaStackStyle}>
          {isMe && useViewportOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={styles.mediaOutgoingChrome}
            >
              {content}
            </MeBubbleChrome>
          ) : (
            content
          )}
        </View>
      );

      if (item.kind === 'voice') {
        if (!item.voiceUri) {
          const placeholderBody = (
            <>
              {bubbleHeader}
              <MessageTextBubbleBody
                text="Голосовое"
                textStyle={outgoingMessageTextStyle}
                rowStyle={styles.bubbleContentRow}
                meta={
                  <MessageTimeStatus
                    time={formatTime(item.dateMs)}
                    status={item.status}
                    isMe={isMe}
                    compact
                    timeColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
                    iconColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
                  />
                }
              />
            </>
          );
          return wrapSelectionShell(
            <Pressable
              {...pressableA11y}
              style={pressableRowStyle}
              accessibilityLabel={`${isMe ? 'Я' : headerTitle}: голосовое сообщение`}
            >
              <View
                ref={(node) => setMessageContentRef(item.id, node)}
                collapsable={false}
                style={measureShellStyle}
              >
                {isMe ? (
                  <MeBubbleChrome
                    active={useViewportOutgoingGradient}
                    scrollTick={scrollTick}
                    fillColor={chatTheme.bubbleMe}
                    style={[
                      styles.bubble,
                      isLastInGroup ? { borderBottomRightRadius: 6 } : null,
                      !useViewportOutgoingGradient ? outgoingBubbleSurfaceStyle : null,
                    ]}
                  >
                    {placeholderBody}
                  </MeBubbleChrome>
                ) : (
                  <View style={[styles.bubble, textBubbleColorStyle]}>{placeholderBody}</View>
                )}
              </View>
            </Pressable>,
          );
        }
        return wrapSelectionShell(
          <Pressable
            {...pressableA11y}
            style={pressableRowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: голосовое сообщение`}
          >
            <View
              ref={(node) => setMessageContentRef(item.id, node)}
              collapsable={false}
              style={measureShellStyle}
            >
              {isMe && useViewportOutgoingGradient ? (
                <MeBubbleChrome
                  active
                  scrollTick={scrollTick}
                  fillColor={chatTheme.bubbleMe}
                  style={[{ alignSelf: 'flex-end' }, outgoingGradientBubbleStyle, { overflow: 'hidden' }]}
                >
                  <VoiceBubble
                    uri={item.voiceUri}
                    waveform={item.waveform ?? []}
                    durationMs={item.durationMs ?? 0}
                    isMe={isMe}
                    time={formatTime(item.dateMs)}
                    status={item.status}
                    header={bubbleHeader}
                    bubbleMeColor={meBubbleFill}
                    outgoingTextColor={outgoingBubbleTextColor}
                    outgoingMetaColor={outgoingBubbleMetaColor}
                    outgoingAccentColor={outgoingBubbleAccentColor}
                    incomingBubbleBackground={colors.bubbleOther}
                    incomingBubbleBorderColor={colors.bubbleOtherBorder}
                    incomingDurationColor={colors.textSecondary}
                    style={outgoingGradientBubbleStyle}
                  />
                </MeBubbleChrome>
              ) : (
                <VoiceBubble
                  uri={item.voiceUri}
                  waveform={item.waveform ?? []}
                  durationMs={item.durationMs ?? 0}
                  isMe={isMe}
                  time={formatTime(item.dateMs)}
                  status={item.status}
                  header={bubbleHeader}
                  bubbleMeColor={isMe ? meBubbleFill : colors.bubbleMe}
                  outgoingTextColor={outgoingBubbleTextColor}
                  outgoingMetaColor={outgoingBubbleMetaColor}
                  outgoingAccentColor={outgoingBubbleAccentColor}
                  incomingBubbleBackground={colors.bubbleOther}
                  incomingBubbleBorderColor={colors.bubbleOtherBorder}
                  incomingDurationColor={colors.textSecondary}
                  style={
                    isMe
                      ? [styles.bubble, outgoingBubbleSurfaceStyle, { alignSelf: 'flex-end' as const }]
                      : textBubbleColorStyle
                  }
                />
              )}
            </View>
          </Pressable>,
        );
      }

      if (item.kind === 'video_note') {
        if (!item.mediaUri) {
          const placeholderBody = (
            <>
              {bubbleHeader}
              <MessageTextBubbleBody
                text="Видеосообщение"
                textStyle={outgoingMessageTextStyle}
                rowStyle={styles.bubbleContentRow}
                meta={
                  <MessageTimeStatus
                    time={formatTime(item.dateMs)}
                    status={item.status}
                    isMe={isMe}
                    compact
                    timeColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
                    iconColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
                  />
                }
              />
            </>
          );
          return wrapSelectionShell(
            <Pressable
              {...pressableA11y}
              style={pressableRowStyle}
              accessibilityLabel={`${isMe ? 'Я' : headerTitle}: видеосообщение`}
            >
              <View
                ref={(node) => setMessageContentRef(item.id, node)}
                collapsable={false}
                style={measureShellStyle}
              >
                {isMe ? (
                  <MeBubbleChrome
                    active={useViewportOutgoingGradient}
                    scrollTick={scrollTick}
                    fillColor={chatTheme.bubbleMe}
                    style={[
                      styles.bubble,
                      isLastInGroup ? { borderBottomRightRadius: 6 } : null,
                      !useViewportOutgoingGradient ? outgoingBubbleSurfaceStyle : null,
                    ]}
                  >
                    {placeholderBody}
                  </MeBubbleChrome>
                ) : (
                  <View style={[styles.bubble, textBubbleColorStyle]}>{placeholderBody}</View>
                )}
              </View>
            </Pressable>,
          );
        }
        return wrapSelectionShell(
          <Pressable
            {...pressableA11y}
            style={pressableRowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: видеосообщение`}
          >
            <View
              ref={(node) => setMessageContentRef(item.id, node)}
              collapsable={false}
              style={measureShellStyle}
            >
              <VideoNoteBubble
                messageId={item.id}
                uri={item.mediaUri}
                thumbnailUri={item.thumbnailUri ?? undefined}
                durationMs={item.durationMs ?? 0}
                isMe={isMe}
                time={formatTime(item.dateMs)}
                status={item.status}
                header={bubbleHeader || undefined}
                outgoingMetaColor={outgoingBubbleMetaColor}
                outgoingAccentColor={outgoingBubbleAccentColor}
                viewportOutgoingGradient={
                  isMe && useViewportOutgoingGradient && item.replyToMessageId == null
                }
                scrollTick={scrollTick}
                registerPlaybackState
              />
            </View>
          </Pressable>,
        );
      }

      if (item.kind === 'image' && item.mediaUri) {
        const imageBubble = (
          <ImageBubble
            uri={item.mediaUri}
            isMe={isMe}
            width={item.width}
            height={item.height}
            caption={item.text}
            time={formatTime(item.dateMs)}
            status={item.status}
            header={bubbleHeader}
            bubbleMeColor={isMe ? meBubbleFill : colors.bubbleMe}
            outgoingTextColor={isMe ? outgoingBubbleTextColor : '#FFFFFF'}
            incomingBubbleBackground={colors.bubbleOther}
            incomingBubbleBorderColor={colors.bubbleOtherBorder}
            incomingCaptionTextColor={colors.textPrimary}
            viewCount={item.viewCount}
            viewCountShortLabel={viewCountFormatted ?? undefined}
            mediaClamp={channelPostMedia ? channelMediaClamp : undefined}
            incomingChannelPost={channelIncoming}
            footer={discussionFooter}
          />
        );

        return wrapSelectionShell(
          <Pressable
            {...pressableA11y}
            style={pressableRowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: фото${item.text ? `, ${item.text}` : ''}`}
          >
            <View
              ref={(node) => setMessageContentRef(item.id, node)}
              collapsable={false}
              style={measureShellStyle}
            >
              {channelIncoming ? imageBubble : wrapTelegramMediaBubble(imageBubble)}
            </View>
          </Pressable>,
        );
      }

      if (item.kind === 'video' && item.mediaUri) {
        const videoBubble = (
          <VideoBubble
            uri={item.mediaUri}
            thumbnailUri={item.thumbnailUri ?? undefined}
            isMe={isMe}
            width={item.width}
            height={item.height}
            durationMs={item.durationMs ?? 0}
            caption={item.text}
            time={formatTime(item.dateMs)}
            status={item.status}
            header={bubbleHeader}
            bubbleMeColor={isMe ? meBubbleFill : colors.bubbleMe}
            outgoingTextColor={isMe ? outgoingBubbleTextColor : '#FFFFFF'}
            incomingBubbleBackground={colors.bubbleOther}
            incomingBubbleBorderColor={colors.bubbleOtherBorder}
            incomingCaptionTextColor={colors.textPrimary}
            viewCount={item.viewCount}
            viewCountShortLabel={viewCountFormatted ?? undefined}
            mediaClamp={channelPostMedia ? channelMediaClamp : undefined}
            incomingChannelPost={channelIncoming}
            footer={discussionFooter}
          />
        );

        return wrapSelectionShell(
          <Pressable
            {...pressableA11y}
            style={pressableRowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: видео${item.text ? `, ${item.text}` : ''}`}
          >
            <View
              ref={(node) => setMessageContentRef(item.id, node)}
              collapsable={false}
              style={measureShellStyle}
            >
              {channelIncoming ? videoBubble : wrapTelegramMediaBubble(videoBubble)}
            </View>
          </Pressable>,
        );
      }

      if (item.kind === 'file') {
        return wrapSelectionShell(
          <Pressable
            {...pressableA11y}
            style={pressableRowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: файл ${item.fileName ?? ''}`}
          >
            <View
              ref={(node) => setMessageContentRef(item.id, node)}
              collapsable={false}
              style={
                channelIncoming
                  ? measureShellStyle
                  : [styles.fileBubbleWrap, styles.messageContentMeasure, contentMeasureStyle]
              }
            >
              {isMe && useViewportOutgoingGradient ? (
                <MeBubbleChrome
                  active
                  scrollTick={scrollTick}
                  fillColor={chatTheme.bubbleMe}
                  style={[
                    {
                      alignSelf: 'flex-end',
                      width: Math.min(windowWidth * 0.76, 320),
                      maxWidth: '100%',
                    },
                    outgoingGradientBubbleStyle,
                    { overflow: 'hidden' },
                  ]}
                >
                  <FileBubble
                    fileName={item.fileName ?? 'File'}
                    fileSize={item.fileSize}
                    uri={item.mediaUri ?? undefined}
                    isMe={isMe}
                    caption={item.text}
                    time={formatTime(item.dateMs)}
                    status={item.status}
                    header={bubbleHeader}
                    bubbleMeColor={meBubbleFill}
                    outgoingTextColor={outgoingBubbleTextColor}
                    outgoingMetaColor={outgoingBubbleMetaColor}
                    outgoingAccentColor={outgoingBubbleAccentColor}
                    incomingBubbleBackground={colors.bubbleOther}
                    incomingBubbleBorderColor={colors.bubbleOtherBorder}
                    incomingFileNameColor={colors.textPrimary}
                    incomingSecondaryTextColor={colors.textSecondary}
                    incomingCaptionColor={colors.textPrimary}
                    style={outgoingGradientBubbleStyle}
                  />
                </MeBubbleChrome>
              ) : (
                <FileBubble
                  fileName={item.fileName ?? 'File'}
                  fileSize={item.fileSize}
                  uri={item.mediaUri ?? undefined}
                  isMe={isMe}
                  caption={item.text}
                  time={formatTime(item.dateMs)}
                  status={item.status}
                  header={bubbleHeader}
                  bubbleMeColor={isMe ? meBubbleFill : colors.bubbleMe}
                  outgoingTextColor={outgoingBubbleTextColor}
                  outgoingMetaColor={outgoingBubbleMetaColor}
                  outgoingAccentColor={outgoingBubbleAccentColor}
                  incomingBubbleBackground={colors.bubbleOther}
                  incomingBubbleBorderColor={colors.bubbleOtherBorder}
                  incomingFileNameColor={colors.textPrimary}
                  incomingSecondaryTextColor={colors.textSecondary}
                  incomingCaptionColor={colors.textPrimary}
                  style={
                    isMe
                      ? [styles.bubble, outgoingBubbleSurfaceStyle, { alignSelf: 'flex-end' as const }]
                      : textBubbleColorStyle
                  }
                />
              )}
            </View>
          </Pressable>,
        );
      }

      const discussionFooterPaddingReset =
        discussionFooter != null
          ? ({ paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' as const } satisfies ViewStyle)
          : null;

      const incomingTextBubbleSolidStyle = [
        styles.bubble,
        textBubbleColorStyle,
        isChannel && styles.channelPostTextBubble,
        discussionFooterPaddingReset,
      ];

      const outgoingTextBubbleChromeStyle = [
        styles.bubble,
        { alignSelf: 'flex-end' as const },
        isLastInGroup ? { borderBottomRightRadius: 6 } : null,
        isChannel && styles.channelPostTextBubble,
        discussionFooterPaddingReset,
        !useViewportOutgoingGradient ? outgoingBubbleSurfaceStyle : null,
      ];

      const metaNode = (
        <MessageTimeStatus
          time={formatTime(item.dateMs)}
          status={item.status}
          isMe={isMe}
          compact
          timeColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
          iconColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
        />
      );

      const viewCountNode = viewCountFormatted ? (
        <Text
          style={[
            styles.viewCountText,
            isMe ? { color: chatTheme.bubbleMeMeta } : null,
          ]}
        >{` \uD83D\uDC41 ${viewCountFormatted}`}</Text>
      ) : null;

      const textBubbleContent = (
        <MessageTextBubbleBody
          text={item.text ?? ''}
          textStyle={outgoingMessageTextStyle}
          rowStyle={styles.bubbleContentRow}
          viewCountNode={viewCountNode}
          meta={metaNode}
        />
      );

      const textBubbleBody = (
        <>
          {discussionFooter ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
              {bubbleHeader}
              {textBubbleContent}
            </View>
          ) : (
            <>
              {bubbleHeader}
              {textBubbleContent}
            </>
          )}
          {discussionFooter}
        </>
      );

      return wrapSelectionShell(
        <Pressable
          {...pressableA11y}
          style={pressableRowStyle}
          accessibilityLabel={`${isMe ? 'Я' : headerTitle}: ${item.text || 'сообщение'}`}
        >
          <View
            ref={(node) => setMessageContentRef(item.id, node)}
            collapsable={false}
            style={measureShellStyle}
          >
            {isMe ? (
              <MeBubbleChrome
                active={useViewportOutgoingGradient}
                scrollTick={scrollTick}
                fillColor={chatTheme.bubbleMe}
                style={outgoingTextBubbleChromeStyle}
              >
                {textBubbleBody}
              </MeBubbleChrome>
            ) : (
              <View style={incomingTextBubbleSolidStyle}>{textBubbleBody}</View>
            )}
          </View>
        </Pressable>,
      );
    },
    [
      channelLinkedDiscussionChatId,
      channelMediaClamp,
      chatTheme,
      colors,
      handleOpenDiscussion,
      handleOpenTelegramMemberProfile,
      headerTitle,
      isChannel,
      isGroupChat,
      messageById,
      openTelegramMessageMenu,
      resolvedScheme,
      scrollTick,
      selectedTelegramIdSet,
      setMessageContentRef,
      styles,
      telegramSelectionMode,
      toggleTelegramSelection,
      windowWidth,
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <InteractiveChatBackShell
        navigation={navigation}
        gestureEnabled={!telegramSelectionMode && menuState == null && forwardMessageIds.length === 0}
      >
      <View style={{ flex: 1, backgroundColor: chatTheme.canvasColor }}>
        <BlurTargetView ref={blurTargetRef} collapsable={false} style={styles.flexChatBody}>
          <View style={styles.wallpaperLayer} pointerEvents="none">
            <ChatBackgroundPattern themeId={wallpaperThemeId} />
          </View>
          <Reanimated.View style={[{ flex: 1 }, listKeyboardAnimatedStyle]}>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              inverted
              style={styles.messagesList}
              contentContainerStyle={[
                styles.listContent,
                { paddingTop: CHAT_MSG_VERTICAL_PADDING + inputBarHeight },
              ]}
              keyboardShouldPersistTaps="handled"
              refreshing={loading}
              onRefresh={() => void loadHistory(false)}
              onEndReached={() => void loadHistory(true)}
              onEndReachedThreshold={0.3}
              onScroll={bumpScrollTickThrottled}
              onMomentumScrollEnd={bumpScrollTickImmediate}
              onScrollEndDrag={bumpScrollTickImmediate}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  listRef.current?.scrollToIndex({
                    index: info.index,
                    animated: true,
                    viewPosition: 0.5,
                  });
                }, 120);
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>
                    {lastError ?? (loading ? 'Загружаем историю Telegram...' : 'История пуста')}
                  </Text>
                </View>
              }
            />
          </Reanimated.View>
          <Reanimated.View style={[styles.composerDockAbsolute, inputDockAnimatedStyle]}>
            <View
              style={[styles.bottomChrome, !telegramSelectionMode ? { paddingBottom: composerDockPaddingBottom } : null]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0) setInputBarHeight(Math.ceil(h));
              }}
            >
              {loadingOlder ? (
                <Text style={styles.loadingOlder}>Загружаем старые сообщения...</Text>
              ) : null}
              {telegramSelectionMode ? (
                <View
                  style={[styles.selectionBatchWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
                >
                  <View style={styles.selectionBatchRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Удалить выбранные сообщения"
                      disabled={!canBatchTdLib}
                      onPress={handleTelegramBatchDelete}
                      style={({ pressed }) => [
                        styles.selectionBatchAction,
                        !canBatchTdLib && styles.selectionBatchActionDisabled,
                        pressed && canBatchTdLib && styles.selectionBatchActionPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.selectionBatchIconCircle,
                          styles.selectionBatchIconCircleDanger,
                          !canBatchTdLib && styles.selectionBatchIconCircleMuted,
                        ]}
                      >
                        <Feather
                          name="trash-2"
                          size={20}
                          color={canBatchTdLib ? '#DB4F55' : colors.textSecondary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.selectionBatchLabel,
                          !canBatchTdLib && styles.selectionBatchLabelDisabled,
                        ]}
                      >
                        Удалить
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Переслать выбранные в другой чат"
                      disabled={!canBatchTdLib}
                      onPress={handleTelegramBatchForward}
                      style={({ pressed }) => [
                        styles.selectionBatchAction,
                        !canBatchTdLib && styles.selectionBatchActionDisabled,
                        pressed && canBatchTdLib && styles.selectionBatchActionPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.selectionBatchIconCircle,
                          styles.selectionBatchIconCircleAccent,
                          !canBatchTdLib && styles.selectionBatchIconCircleMuted,
                        ]}
                      >
                        <Feather
                          name="corner-up-right"
                          size={20}
                          color={canBatchTdLib ? colors.accent : colors.textSecondary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.selectionBatchLabel,
                          !canBatchTdLib && styles.selectionBatchLabelDisabled,
                        ]}
                      >
                        Переслать
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : canPost ? (
                <InputBar
                  onSendText={sendText}
                  onSendVoice={sendVoice}
                  onSendVideoNote={sendVideoNote}
                  onSendMedia={sendMedia}
                  onSendFile={sendFile}
                  replyToMessage={replyToInputMessage}
                  replyAuthorName={replyAuthorName}
                  onCancelReply={() => setReplyToMessageId(null)}
                  onVoiceActiveChange={(active) => {
                    isVoiceRecordingShared.value = active;
                  }}
                  placeholder="Сообщение"
                />
              ) : (
                <View style={styles.readOnlyFooter} accessibilityLabel="Только для чтения">
                  <Text style={styles.readOnlyText}>Только для чтения</Text>
                </View>
              )}
            </View>
          </Reanimated.View>
        </BlurTargetView>
      </View>
      </InteractiveChatBackShell>
      <ChatContextMenuOverlay
        menuState={menuState}
        activeMenuMessage={activeMenuMessage}
        menuActions={telegramMenuActions}
        menuAnim={menuAnim}
        screenWidth={windowWidth}
        showReactions={menuMode === 'actions'}
        menuCardWidth={menuMode === 'deleteConfirm' ? 224 : undefined}
        blurTargetRef={blurTargetRef}
        onClose={closeMenu}
        onMenuAction={(key) => {
          if (menuMode === 'deleteConfirm') {
            handleTelegramDeleteConfirmAction(
              key as 'delete_confirm' | 'delete_cancel' | 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'select',
            );
            return;
          }
          void handleTelegramMenuAction(
            key as 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'select',
          );
        }}
        onPickReaction={handleTelegramPickReaction}
        renderMenuPreviewBody={renderTelegramMenuPreviewBody}
      />
      <TelegramForwardSheet
        visible={forwardMessageIds.length > 0}
        dialogs={telegramDialogs}
        excludeChatId={chatId}
        pending={forwardPending}
        onClose={handleForwardSheetClose}
        onSelectChat={(destChatId) => {
          void handleForwardToTelegramChat(destChatId);
        }}
      />
    </View>
  );
}
