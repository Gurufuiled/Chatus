import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
  Platform,
} from 'react-native';
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
import { ChatProfileMediaViewerModal } from '../components/ChatProfileMediaViewerModal';
import type { MediaTile } from '../components/ChatProfileMediaSection';
import { ChatDaySeparator } from '../components/ChatDaySeparator';
import { ChatScrollToBottomButton } from '../components/ChatScrollToBottomButton';
import { ChatTopBanners } from '../components/ChatTopBanners';
import { InteractiveChatBackShell } from '../components/InteractiveChatBackShell';
import { CustomAndroidChatHeader } from '../components/CustomAndroidChatHeader';
import { formatPresence, formatGroupSubtitle } from '../navigation/ChatsStack';
import { TelegramForwardSheet } from '../components/TelegramForwardSheet';
import { FileBubble } from '../components/FileBubble';
import { ImageBubble } from '../components/ImageBubble';
import { InputBar, type FilePickResult, type MediaAlbumPickResult, type MediaPickResult } from '../components/InputBar';
import { TelegramMediaAlbumBubble } from '../components/TelegramMediaAlbumBubble';
import { MessageTextBubbleBody } from '../components/MessageTextBubbleBody';
import { MessageTimeStatus } from '../components/MessageTimeStatus';
import { ReplySwipeWrapper } from '../components/ReplySwipeWrapper';
import { ReplyPreview } from '../components/ReplyPreview';
import { WebPagePreviewBubble } from '../components/WebPagePreviewBubble';
import { TelegramChannelCommentsBar } from '../components/TelegramChannelCommentsBar';
import { VideoBubble } from '../components/VideoBubble';
import { VideoNoteBubble } from '../components/VideoNoteBubble';
import { VoiceBubble } from '../components/VoiceBubble';
import { PendingVideoBubble, PendingVideoNoteBubble } from '../components/TelegramPendingMediaBubble';
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
import { useInvertedChatScrollFab } from '../hooks/useInvertedChatScrollFab';
import {
  formatChatDayLabel,
  getChatDayKey,
  isValidChatTimestamp,
} from '../utils/formatChatDayLabel';
import {
  isSquareVideoDimensions,
  probeLocalVideoDimensionsWithRetry,
} from '../utils/probeLocalVideoDimensions';
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
  getTelegramSearchHaystack,
  isSameTelegramChain,
  markMessageFailed,
  optimisticOutgoingMessage,
  telegramRowToInputReplyMessage,
  upsertMessage,
} from './telegramChat/messageRow';
import { useTelegramChatHeaderSubtitle } from './telegramChat/useTelegramChatHeaderSubtitle';
import {
  createTelegramChatStyles,
  createTelegramStackHeaderPresentationStyles,
} from './telegramChat/telegramChatStyles';
import {
  getLastReadOutboxMessageId,
  getNestedRecord,
  getPinnedMessageIdFromChat,
  loadLastReadOutboxMessageId,
  hydrateTelegramMediaRows,
  mapTdMessage,
  mapTdMessages,
  scheduleTdlibFileDownload,
} from './telegramChat/tdlibMapping';
import {
  collectPendingTdlibFileIds,
  patchMessagesWithTdlibFile,
} from './telegramChat/telegramFileUpdates';
import {
  getTelegramRowTdMessageIds,
  mergeTelegramFeedRows,
  normalizeTelegramFeedRows,
} from './telegramChat/telegramAlbumRows';
import type { TelegramAlbumMediaItem, TelegramMessageRow } from './telegramChat/types';
import {
  tdlibDeleteMessages,
  tdlibForwardMessages,
  tdlibUnpinChatMessage,
} from './telegramChat/tdlibChatActions';
import {
  deleteTelegramMessagesFromCache,
  loadTelegramMessagesFromCache,
  persistTelegramMessages,
} from './telegramChat/telegramMessageCache';
import {
  buildTelegramAlbumViewerTiles,
  findTelegramAlbumViewerIndex,
} from './telegramChat/telegramAlbumMediaTiles';
import { scheduleNeighborTelegramChatsPreload } from './telegramChat/telegramChatPreload';
import { useTelegramChatMenu } from './telegramChat/useTelegramChatMenu';
import { renderTextWithSearchHighlight } from '../utils/searchHighlightText';

const TELEGRAM_PEER_AVATAR_COLORS = ['#5B8DEF', '#53B7A8', '#F2994A', '#BB6BD9', '#EB5757', '#2D9CDB'];

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
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
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
    startSearch,
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
  const [channelMemberStatus, setChannelMemberStatus] = useState<string | null>(null);
  /** Чат обсуждения канала (`getSupergroupFullInfo.linked_chat_id`), если у сообщения нет `reply_in_chat_id`. */
  const [channelLinkedDiscussionChatId, setChannelLinkedDiscussionChatId] = useState<number | null>(null);
  const [telegramAlbumViewer, setTelegramAlbumViewer] = useState<{
    items: MediaTile[];
    index: number;
  } | null>(null);
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
  const {
    showScrollToBottom,
    handleScroll: handleChatScroll,
    handleScrollEnd: handleChatScrollEnd,
    recheckFabVisibility,
    scrollToBottom,
  } = useInvertedChatScrollFab(listRef, chatId);
  const handleMessagesListScroll = useCallback(
    (event: Parameters<typeof handleChatScroll>[0]) => {
      handleChatScroll(event);
      bumpScrollTickThrottled();
    },
    [bumpScrollTickThrottled, handleChatScroll],
  );
  const handleMessagesListScrollEnd = useCallback(
    (event: Parameters<typeof handleChatScrollEnd>[0]) => {
      handleChatScrollEnd(event);
      bumpScrollTickImmediate();
    },
    [bumpScrollTickImmediate, handleChatScrollEnd],
  );

  const openTelegramAlbumViewer = useCallback(
    (albumMedia: TelegramAlbumMediaItem[], tappedMessageId: number, caption?: string) => {
      const tiles = buildTelegramAlbumViewerTiles(albumMedia, caption);
      if (tiles.length === 0) return;
      setTelegramAlbumViewer({
        items: tiles,
        index: findTelegramAlbumViewerIndex(tiles, tappedMessageId),
      });
    },
    [],
  );

  const closeTelegramAlbumViewer = useCallback(() => {
    setTelegramAlbumViewer(null);
  }, []);

  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActiveMatchIndex, setSearchActiveMatchIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const matchedMessageIdsRef = useRef<string[]>([]);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusMessageFetchIdRef = useRef<number | null>(null);

  const headerTitle = useMemo(() => title || `Telegram ${telegramChatId}`, [telegramChatId, title]);
  const { headerSubtitle, onComposerTextChange, onComposerMessageSent } =
    useTelegramChatHeaderSubtitle({
      chatId,
      isFocused,
      isGroupChat,
      isChannel,
      memberCount,
      messageThreadId,
    });
  const messageById = useMemo(() => {
    const map = new Map<number, TelegramMessageRow>();
    for (const message of messages) {
      map.set(message.messageId, message);
      if (message.kind === 'album' && message.albumMessageIds) {
        for (const albumId of message.albumMessageIds) {
          map.set(albumId, message);
        }
      }
    }
    return map;
  }, [messages]);
  const replyToRow = replyToMessageId != null ? messageById.get(replyToMessageId) ?? null : null;
  const replyToInputMessage = useMemo(
    () => (replyToRow ? telegramRowToInputReplyMessage(replyToRow, chatId) : null),
    [chatId, replyToRow],
  );
  const replyAuthorName = replyToRow ? (replyToRow.outgoing ? 'Вы' : headerTitle) : null;

  const pinnedRow = useMemo(() => {
    if (pinnedMessageId == null) return null;
    return messageById.get(pinnedMessageId) ?? null;
  }, [messageById, pinnedMessageId]);

  const pinnedMessageText = useMemo(() => {
    if (pinnedMessageId == null) return null;
    if (pinnedRow) return getTelegramReplyPreviewText(pinnedRow);
    return 'Закреплённое сообщение';
  }, [pinnedMessageId, pinnedRow]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const matchedMessageIds = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return messages
      .filter((row) => getTelegramSearchHaystack(row).includes(normalizedSearchQuery))
      .map((row) => row.id);
  }, [messages, normalizedSearchQuery]);
  matchedMessageIdsRef.current = matchedMessageIds;
  const searchMatchSignature = matchedMessageIds.join('|');

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
    const ids: number[] = [];
    for (const row of selectedTelegramRows) {
      ids.push(...getTelegramRowTdMessageIds(row));
    }
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
        selectedTelegramRows
          .filter((r) => r.outgoing)
          .flatMap((r) => getTelegramRowTdMessageIds(r)),
      ),
    ];
    const incomingIds = [
      ...new Set(
        selectedTelegramRows
          .filter((r) => !r.outgoing)
          .flatMap((r) => getTelegramRowTdMessageIds(r)),
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

  const handleCancelSearch = useCallback(() => {
    setIsSearchMode(false);
    setSearchQuery('');
    setSearchActiveMatchIndex(0);
    setHighlightedMessageId(null);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    Keyboard.dismiss();
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsSearchMode(true);
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    });
  }, []);

  const scrollToMessageRowId = useCallback(
    (
      rowId: string,
      missingTitle?: string,
      options?: { persistHighlight?: boolean },
    ) => {
      const targetIndex = messages.findIndex((m) => m.id === rowId);
      if (targetIndex < 0) {
        if (missingTitle) {
          Alert.alert(missingTitle, 'Нужное сообщение пока не загружено в этот экран.');
        }
        return false;
      }
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: targetIndex,
          animated: true,
          viewPosition: 0.45,
        });
      });
      setHighlightedMessageId(rowId);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      if (!options?.persistHighlight) {
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedMessageId(null);
          highlightTimeoutRef.current = null;
        }, 1800);
      }
      return true;
    },
    [messages],
  );

  const handleSearchMatchNext = useCallback(() => {
    setSearchActiveMatchIndex((i) => {
      const list = matchedMessageIdsRef.current;
      if (list.length === 0) return 0;
      return (i + 1) % list.length;
    });
  }, []);

  const handleSearchMatchPrev = useCallback(() => {
    setSearchActiveMatchIndex((i) => {
      const list = matchedMessageIdsRef.current;
      if (list.length === 0) return 0;
      return (i - 1 + list.length) % list.length;
    });
  }, []);

  const handlePinnedBannerPress = useCallback(() => {
    if (pinnedMessageId == null) return;
    const row = messageById.get(pinnedMessageId);
    if (row) {
      scrollToMessageRowId(row.id, 'Сообщение не найдено');
      return;
    }
    const byIndex = messages.find((m) => m.messageId === pinnedMessageId);
    if (byIndex) {
      scrollToMessageRowId(byIndex.id, 'Сообщение не найдено');
    } else {
      Alert.alert('Сообщение не найдено', 'Закреплённое сообщение пока не загружено в этот экран.');
    }
  }, [messageById, messages, pinnedMessageId, scrollToMessageRowId]);

  const handlePinnedBannerClose = useCallback(() => {
    if (pinnedMessageId == null || !Number.isFinite(chatId)) return;
    void (async () => {
      try {
        await ensureReady();
        await tdlibUnpinChatMessage(chatId, pinnedMessageId);
        setPinnedMessageId(null);
      } catch (err) {
        Alert.alert('Открепить', err instanceof Error ? err.message : String(err));
      }
    })();
  }, [chatId, ensureReady, pinnedMessageId]);

  const openTelegramChatProfile = useCallback(() => {
    navigation.navigate('TelegramChatProfile', {
      telegramChatId,
      title: headerTitle,
      avatarUri: avatarUri ?? null,
      chatType: routeChatType ?? null,
    });
  }, [avatarUri, headerTitle, navigation, routeChatType, telegramChatId]);

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
          onPress={openTelegramChatProfile}
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
      headerRight: isSearchMode
        ? undefined
        : () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Поиск в чате"
              onPress={() => handleOpenSearch()}
              style={({ pressed }) => ({
                opacity: pressed ? 0.65 : 1,
                paddingHorizontal: 12,
                paddingVertical: 8,
              })}
            >
              <Feather name="search" size={22} color={colors.textPrimary} />
            </Pressable>
          ),
    });
  }, [
    avatarUri,
    clearTelegramSelection,
    colors.accent,
    colors.textPrimary,
    handleOpenSearch,
    isSearchMode,
    openTelegramChatProfile,
    routeChatType,
    telegramChatId,
    headerChromeStyles,
    headerSubtitle,
    headerTitle,
    navigation,
    selectedTelegramMessageIds.length,
    telegramSelectionMode,
  ]);

  messagesRef.current = messages;

  useEffect(() => {
    if (!startSearch) return;
    setIsSearchMode(true);
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    });
    navigation.setParams({ startSearch: undefined });
    return () => task.cancel();
  }, [navigation, startSearch]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSearchMode) return;
    setSearchActiveMatchIndex(0);
  }, [normalizedSearchQuery, isSearchMode]);

  useEffect(() => {
    setSearchActiveMatchIndex((i) => {
      const L = matchedMessageIdsRef.current.length;
      if (L === 0) return 0;
      return Math.min(i, L - 1);
    });
  }, [searchMatchSignature]);

  useEffect(() => {
    if (isSearchMode && !normalizedSearchQuery) {
      setHighlightedMessageId(null);
    }
  }, [isSearchMode, normalizedSearchQuery]);

  useEffect(() => {
    if (!isSearchMode || !normalizedSearchQuery) return;
    const list = matchedMessageIdsRef.current;
    if (list.length === 0) {
      setHighlightedMessageId(null);
      return;
    }
    const idx = Math.min(searchActiveMatchIndex, list.length - 1);
    const id = list[idx];
    if (!id) return;
    const timer = setTimeout(() => {
      scrollToMessageRowId(id, undefined, { persistHighlight: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [
    isSearchMode,
    normalizedSearchQuery,
    scrollToMessageRowId,
    searchActiveMatchIndex,
    searchMatchSignature,
  ]);

  useEffect(() => {
    if (focusMessageId == null || !Number.isFinite(focusMessageId) || !Number.isFinite(chatId)) {
      focusMessageFetchIdRef.current = null;
      return;
    }

    const row = messages.find((m) => m.messageId === focusMessageId);
    if (row) {
      focusMessageFetchIdRef.current = null;
      const didScroll = scrollToMessageRowId(row.id, 'Сообщение не найдено');
      if (didScroll) {
        navigation.setParams({ focusMessageId: undefined });
      }
      return;
    }

    if (focusMessageFetchIdRef.current === focusMessageId) {
      return;
    }
    focusMessageFetchIdRef.current = focusMessageId;

    const fetchId = focusMessageId;
    let cancelled = false;
    void (async () => {
      try {
        await ensureReady();
        const raw = (await tdlibClient.send({
          '@type': 'getMessage',
          chat_id: chatId,
          message_id: fetchId,
        })) as Record<string, unknown>;
        throwIfTdError(raw);
        const mapped = await mapTdMessage(raw, lastReadOutboxMessageIdRef.current, {
          loadSenderAvatar: isGroupChat,
          mediaLocalOnly: false,
        });
        if (cancelled || !mountedRef.current || focusMessageId !== fetchId) {
          return;
        }
        if (!mapped) {
          focusMessageFetchIdRef.current = null;
          Alert.alert(
            'Сообщение не найдено',
            'Не удалось открыть сообщение в чате. Попробуй ещё раз чуть позже.',
          );
          navigation.setParams({ focusMessageId: undefined });
          return;
        }
        setMessages((prev) => normalizeTelegramFeedRows(upsertMessage(prev, mapped)));
      } catch {
        if (!cancelled && mountedRef.current) {
          focusMessageFetchIdRef.current = null;
          Alert.alert(
            'Сообщение не найдено',
            'Не удалось открыть сообщение в чате. Попробуй ещё раз чуть позже.',
          );
          navigation.setParams({ focusMessageId: undefined });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    chatId,
    ensureReady,
    focusMessageId,
    isGroupChat,
    messages,
    navigation,
    scrollToMessageRowId,
  ]);

  const pinnedMessageMissingInFeed = useMemo(() => {
    if (pinnedMessageId == null) return false;
    return !messages.some((m) => m.messageId === pinnedMessageId);
  }, [messages, pinnedMessageId]);

  useEffect(() => {
    if (!pinnedMessageMissingInFeed || !Number.isFinite(chatId) || pinnedMessageId == null) return;

    const fetchId = pinnedMessageId;
    let cancelled = false;
    void (async () => {
      try {
        await ensureReady();
        const raw = (await tdlibClient.send({
          '@type': 'getMessage',
          chat_id: chatId,
          message_id: fetchId,
        })) as Record<string, unknown>;
        throwIfTdError(raw);
        const row = await mapTdMessage(raw, lastReadOutboxMessageIdRef.current, {
          loadSenderAvatar: isGroupChat,
          mediaLocalOnly: false,
        });
        if (
          !row ||
          cancelled ||
          !mountedRef.current ||
          pinnedMessageId !== fetchId
        ) {
          return;
        }
        setMessages((prev) => normalizeTelegramFeedRows(upsertMessage(prev, row)));
      } catch {
        /* preview falls back to generic label */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, ensureReady, pinnedMessageId, pinnedMessageMissingInFeed]);

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
            if (!cancelled && sg.status != null) {
              const statusType = (sg.status as Record<string, unknown>)['@type'];
              if (typeof statusType === 'string') setChannelMemberStatus(statusType);
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

      const mergeMapped = (mapped: TelegramMessageRow[]) => {
        if (isStaleLoad() || mapped.length === 0) return;
        setMessages((prev) => {
          if (isStaleLoad()) return prev;
          const sorted = mergeTelegramFeedRows(prev, mapped);
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
          {
            loadSenderAvatar: isGroupChat,
            /** Локальный кэш TDLib — без блокирующих downloadFile; сеть — подтягиваем файлы. */
            mediaLocalOnly: onlyLocal,
          },
        );
      };

      try {
        if (!older) {
          try {
            const cached = await loadTelegramMessagesFromCache(chatId, threadParam);
            if (mountedRef.current && cached.length > 0) {
              mergeMapped(cached);
              for (const fileId of collectPendingTdlibFileIds(cached)) {
                scheduleTdlibFileDownload(fileId);
              }
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
              mergeMapped(localMapped);
              for (const fileId of collectPendingTdlibFileIds(localMapped)) {
                scheduleTdlibFileDownload(fileId);
              }
              setLoading(false);
            }
          } catch {
            /* local cache miss is fine */
          }
        }

        let mapped = await fetchBatch(false);
        if (!mountedRef.current || isStaleLoad()) return;
        if (!older && mapped.length > 0) {
          mapped = await hydrateTelegramMediaRows(
            chatId,
            normalizeTelegramFeedRows(mapped),
            lastReadOutboxMessageIdRef.current,
          );
          if (!mountedRef.current || isStaleLoad()) return;
        }
        mergeMapped(mapped);
        for (const fileId of collectPendingTdlibFileIds(mapped)) {
          scheduleTdlibFileDownload(fileId);
        }
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
      const unsubscribe = tdlibClient.subscribe((update) => {
        try {
          const type = update['@type'];

          if (type === 'updateFile') {
            const file = getNestedRecord(update.file);
            if (!file) return;
            setMessages((prev) => patchMessagesWithTdlibFile(prev, file));
            return;
          }

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
            setMessages((prev) =>
              normalizeTelegramFeedRows(
                prev.filter(
                  (m) =>
                    !idSet.has(m.messageId) &&
                    !m.albumMessageIds?.some((albumId) => idSet.has(albumId)),
                ),
              ),
            );
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
            loadSenderAvatar: isGroupChat,
            mediaLocalOnly: false,
          }).then((row) => {
            if (!row || !mountedRef.current) return;
            setMessages((prev) => normalizeTelegramFeedRows(upsertMessage(prev, row, oldMessageId)));
            for (const fileId of collectPendingTdlibFileIds([row])) {
              scheduleTdlibFileDownload(fileId);
            }
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
      onComposerMessageSent();
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
    [chatId, ensureReady, onComposerMessageSent, replyToMessageId],
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
      const probed = await probeLocalVideoDimensionsWithRetry(result.uri);
      if (!probed) {
        Alert.alert(
          'Не удалось отправить видеосообщение',
          'Не удалось определить размер видео. Запишите ещё раз через свайп вверх по микрофону.',
        );
        return;
      }
      if (!isSquareVideoDimensions(probed)) {
        Alert.alert(
          'Не удалось отправить видеосообщение',
          'Запись не квадратная — Telegram принимает только кружки. Запишите ещё раз через свайп вверх по микрофону.',
        );
        return;
      }
      const lengthPx = Math.min(
        640,
        Math.max(240, Math.round(Math.min(probed.width, probed.height))),
      );
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
        width: lengthPx,
        height: lengthPx,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      setReplyToMessageId(null);
      try {
        await ensureReady();
        const inputMessageContent = buildInputMessageVideoNoteContent({
          videoUri: result.uri,
          thumbnailUri: result.thumbnailUri,
          durationMs: result.durationMs,
          lengthPx,
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

  const sendMediaAlbum = useCallback(
    async (result: MediaAlbumPickResult) => {
      const items = result.items.slice(0, 10);
      if (items.length === 0) return;
      if (items.length === 1) {
        await sendMedia({ ...items[0]!, caption: result.caption });
        return;
      }
      if (!Number.isFinite(chatId)) return;

      const activeReplyToMessageId = replyToMessageId;
      const caption = result.caption?.trim() ?? '';
      const tempAnchorId = -Date.now();
      const albumItems: TelegramAlbumMediaItem[] = items.map((item, index) => ({
        messageId: tempAnchorId - index - 1,
        kind: item.kind,
        mediaUri: item.uri,
        thumbnailUri: item.previewUri,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
      }));
      const optimistic: TelegramMessageRow = {
        id: `temp-album-${Math.abs(tempAnchorId)}`,
        messageId: tempAnchorId,
        kind: 'album',
        text: caption,
        outgoing: true,
        dateMs: Date.now(),
        status: 'sending',
        replyToMessageId: activeReplyToMessageId,
        mediaAlbumId: tempAnchorId,
        albumMedia: albumItems,
        albumMessageIds: albumItems.map((part) => part.messageId),
      };
      setMessages((prev) => normalizeTelegramFeedRows(upsertMessage(prev, optimistic)));
      setReplyToMessageId(null);

      const contents = items.map((item, index) => {
        const isLast = index === items.length - 1;
        const cap = formattedText(isLast ? result.caption : undefined);
        if (item.kind === 'video') {
          return {
            '@type': 'inputMessageVideo',
            video: getLocalInputFile(item.uri),
            duration: Math.max(1, Math.round((item.durationMs ?? 1000) / 1000)),
            width: Math.max(1, Math.round(item.width ?? 1)),
            height: Math.max(1, Math.round(item.height ?? 1)),
            supports_streaming: true,
            caption: cap,
          };
        }
        return {
          '@type': 'inputMessagePhoto',
          photo: getLocalInputFile(item.uri),
          width: Math.max(1, Math.round(item.width ?? 1)),
          height: Math.max(1, Math.round(item.height ?? 1)),
          caption: cap,
        };
      });

      try {
        await ensureReady();
        const response = (await tdlibClient.send({
          '@type': 'sendMessageAlbum',
          chat_id: chatId,
          reply_to: getInputReplyTo(activeReplyToMessageId),
          input_message_contents: contents,
        })) as Record<string, unknown>;
        throwIfTdError(response);
        const rawMessages = Array.isArray(response.messages) ? response.messages : [];
        const mapped = await mapTdMessages(
          rawMessages.filter(
            (part): part is Record<string, unknown> => part != null && typeof part === 'object',
          ),
          lastReadOutboxMessageIdRef.current,
        );
        if (mapped.length === 0) {
          throw new Error('Telegram не вернул отправленный альбом.');
        }
        setMessages((prev) =>
          mergeTelegramFeedRows(
            prev.filter((row) => row.id !== optimistic.id),
            mapped,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((row) => (row.id === optimistic.id ? { ...row, status: 'failed' } : row)),
        );
        Alert.alert('Не удалось отправить альбом', message);
      }
    },
    [chatId, ensureReady, replyToMessageId, sendMedia],
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

  const renderMessageRow = useCallback(
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
          onPress={() => {
            if (replyTarget) {
              scrollToMessageRowId(replyTarget.id, 'Исходное сообщение не загружено', {
                persistHighlight: true,
              });
            }
          }}
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

      const isHighlighted = highlightedMessageId === item.id;
      const measureShellStyle = [
        styles.messageContentMeasure,
        channelIncoming
          ? styles.channelIncomingWrap
          : isChannel && isMe
            ? styles.channelOutgoingPostWrap
            : !isMe && isGroupChat
              ? styles.groupIncomingBubbleMeasure
              : contentMeasureStyle,
        isHighlighted && styles.messageContentHighlighted,
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

      const mediaStackStyle = channelIncoming
        ? styles.mediaStackChannel
        : !isMe && isGroupChat
          ? [styles.mediaStack, { maxWidth: '100%' as const }]
          : styles.mediaStack;

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
                  style={[{ alignSelf: 'flex-end' }, outgoingGradientBubbleStyle, { paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }]}
                >
                  <VoiceBubble
                    uri={item.voiceUri ?? null}
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
                    style={undefined}
                    loading={!item.voiceUri}
                  />
                </MeBubbleChrome>
              ) : (
                <VoiceBubble
                  uri={item.voiceUri ?? null}
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
                  loading={!item.voiceUri}
                />
              )}
            </View>
          </Pressable>,
        );
      }

      if (item.kind === 'video_note') {
        if (!item.mediaUri) {
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
                <PendingVideoNoteBubble
                  isMe={isMe}
                  thumbnailUri={item.thumbnailUri}
                  durationMs={item.durationMs ?? 0}
                  time={formatTime(item.dateMs)}
                  status={item.status}
                  header={bubbleHeader || undefined}
                  outgoingMetaColor={outgoingBubbleMetaColor}
                />
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

      if (item.kind === 'album' && item.albumMedia && item.albumMedia.length > 0) {
        const albumBubble = (
          <TelegramMediaAlbumBubble
            items={item.albumMedia}
            isMe={isMe}
            caption={item.text}
            time={formatTime(item.dateMs)}
            status={item.status}
            styles={styles}
            chatTheme={chatTheme}
            viewportOutgoingGradient={useViewportOutgoingGradient}
            scrollTick={scrollTick}
            incomingCaptionBg={isMe ? undefined : colors.bubbleOther}
            incomingCaptionBorder={isMe ? undefined : colors.bubbleOtherBorder}
            incomingCaptionText={isMe ? undefined : colors.textPrimary}
            incomingCaptionMeta={isMe ? undefined : colors.textSecondary}
            footer={discussionFooter}
            incomingChannelPost={channelIncoming}
            channelAlbumWidth={channelIncoming ? channelMediaClamp.maxWidth : undefined}
            onTilePress={(messageId) =>
              openTelegramAlbumViewer(item.albumMedia ?? [], messageId, item.text)
            }
          />
        );

        return wrapSelectionShell(
          <Pressable
            {...pressableA11y}
            style={pressableRowStyle}
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: альбом${item.text ? `, ${item.text}` : ''}`}
          >
            <View
              ref={(node) => setMessageContentRef(item.id, node)}
              collapsable={false}
              style={measureShellStyle}
            >
              {channelIncoming ? albumBubble : wrapTelegramMediaBubble(albumBubble)}
            </View>
          </Pressable>,
        );
      }

      if (item.kind === 'image' && !item.mediaUri && item.mediaFullFileId == null) {
        const placeholderBody = (
          <>
            {bubbleHeader}
            <MessageTextBubbleBody
              text={item.text?.trim() || 'Фото'}
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
            accessibilityLabel={`${isMe ? 'Я' : headerTitle}: фото${item.text ? `, ${item.text}` : ''}`}
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

      if (item.kind === 'image' && (item.mediaUri || item.mediaFullFileId != null)) {
        if (channelIncoming) {
          const channelSinglePhoto = (
            <TelegramMediaAlbumBubble
              items={[
                {
                  messageId: item.messageId,
                  kind: 'image',
                  mediaUri: item.mediaUri,
                  mediaFullFileId: item.mediaFullFileId,
                  width: item.width,
                  height: item.height,
                },
              ]}
              isMe={false}
              caption={item.text}
              time={formatTime(item.dateMs)}
              status={item.status}
              styles={styles}
              chatTheme={chatTheme}
              viewportOutgoingGradient={false}
              scrollTick={scrollTick}
              incomingCaptionBg={colors.bubbleOther}
              incomingCaptionBorder={colors.bubbleOtherBorder}
              incomingCaptionText={colors.textPrimary}
              incomingCaptionMeta={colors.textSecondary}
              footer={discussionFooter}
              incomingChannelPost
              channelAlbumWidth={channelMediaClamp.maxWidth}
              onTilePress={(messageId) =>
                openTelegramAlbumViewer(
                  [
                    {
                      messageId: item.messageId,
                      kind: 'image',
                      mediaUri: item.mediaUri,
                      mediaFullFileId: item.mediaFullFileId,
                      width: item.width,
                      height: item.height,
                    },
                  ],
                  messageId,
                  item.text,
                )
              }
            />
          );

          return wrapSelectionShell(
            <Pressable
              {...pressableA11y}
              style={pressableRowStyle}
              accessibilityLabel={`${headerTitle}: фото${item.text ? `, ${item.text}` : ''}`}
            >
              <View
                ref={(node) => setMessageContentRef(item.id, node)}
                collapsable={false}
                style={measureShellStyle}
              >
                {channelSinglePhoto}
              </View>
            </Pressable>,
          );
        }

        const imageBubble = (
          <ImageBubble
            uri={item.mediaUri ?? ''}
            loadingFullQuality={
              item.mediaFullFileId != null && !item.mediaUri?.trim().startsWith('file://')
            }
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
              {wrapTelegramMediaBubble(imageBubble)}
            </View>
          </Pressable>,
        );
      }

      if (item.kind === 'video') {
        if (!item.mediaUri) {
          const pendingVideoBubble = (
            <PendingVideoBubble
              isMe={isMe}
              thumbnailUri={item.thumbnailUri}
              width={item.width}
              height={item.height}
              durationMs={item.durationMs ?? 0}
              caption={item.text}
              time={formatTime(item.dateMs)}
              status={item.status}
              header={bubbleHeader}
              outgoingMetaColor={outgoingBubbleMetaColor}
              mediaClamp={channelPostMedia ? channelMediaClamp : undefined}
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
                {channelIncoming ? pendingVideoBubble : wrapTelegramMediaBubble(pendingVideoBubble)}
              </View>
            </Pressable>,
          );
        }

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
                  : !isMe && isGroupChat
                    ? [styles.fileBubbleWrap, styles.messageContentMeasure, { maxWidth: '100%' as const }, contentMeasureStyle]
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
        { alignSelf: 'flex-start' as const },
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
          viewCount={viewCountFormatted || undefined}
        />
      );

      const spacer = viewCountFormatted != null
        ? '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' 
        : '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';

      const textBubbleContent =
        normalizedSearchQuery && (item.text?.trim() ?? '').length > 0 ? (
          <View style={{ position: 'relative', alignSelf: 'stretch' }}>
            <Text style={outgoingMessageTextStyle}>
              {renderTextWithSearchHighlight(
                item.text ?? '',
                normalizedSearchQuery,
                outgoingMessageTextStyle,
              )}
              {spacer}
            </Text>
            <View style={{ position: 'absolute', bottom: 0, right: 0 }}>{metaNode}</View>
          </View>
        ) : (
          <MessageTextBubbleBody
            text={item.text ?? ''}
            textStyle={outgoingMessageTextStyle}
            rowStyle={styles.bubbleContentRow}
            hasViews={viewCountFormatted != null}
            meta={metaNode}
          />
        );

      const webPageNode = item.webPagePreview ? (
        <WebPagePreviewBubble
          preview={item.webPagePreview}
          accentColor={isMe ? chatTheme.bubbleMeAccent : colors.accent}
          textColor={isMe ? chatTheme.bubbleMeText : colors.textPrimary}
          peerFirstLineId={String(chatId)}
        />
      ) : null;

      const textBubbleBody = (
        <>
          {discussionFooter ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
              {bubbleHeader}
              {textBubbleContent}
              {webPageNode}
            </View>
          ) : (
            <>
              {bubbleHeader}
              {textBubbleContent}
              {webPageNode}
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
      openTelegramAlbumViewer,
      resolvedScheme,
      scrollTick,
      selectedTelegramIdSet,
      setMessageContentRef,
      styles,
      telegramSelectionMode,
      toggleTelegramSelection,
      windowWidth,
      normalizedSearchQuery,
      highlightedMessageId,
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <InteractiveChatBackShell
        navigation={navigation}
        gestureEnabled={
          !telegramSelectionMode &&
          menuState == null &&
          forwardMessageIds.length === 0 &&
          !isSearchMode
        }
      >
        {Platform.OS === 'android' ? (
          <CustomAndroidChatHeader
            title={title || 'Telegram'}
            subtitle={headerSubtitle ?? (isGroupChat ? formatGroupSubtitle(undefined) : formatPresence(undefined, undefined))}
            avatarUrl={avatarUri}
            isGroupChat={isGroupChat}
            peerId={routeChatType === 'private' ? telegramChatId : null}
            currentUserId={null}
            chatId={telegramChatId}
            members={null}
            navigation={navigation}
            telegramTitleOnly
            titleNavDisabled={telegramSelectionMode}
            onTitlePress={openTelegramChatProfile}
            onSearchPress={
              telegramSelectionMode || isSearchMode ? undefined : handleOpenSearch
            }
          />
        ) : null}

      <View style={{ flex: 1, backgroundColor: chatTheme.canvasColor }}>
        <BlurTargetView ref={blurTargetRef} collapsable={false} style={styles.flexChatBody}>
          <View style={styles.wallpaperLayer} pointerEvents="none">
            <ChatBackgroundPattern themeId={wallpaperThemeId} />
          </View>
          <ChatTopBanners
            selectionMode={telegramSelectionMode}
            selectedCount={selectedTelegramMessageIds.length}
            onClearSelection={clearTelegramSelection}
            activeVoiceVisible={false}
            activeVoiceAuthor={null}
            activeVoiceIsPlaying={false}
            activeVoiceRateLabel="1×"
            activeVoiceProgress={0}
            onToggleVoicePlayback={() => undefined}
            onCycleVoiceRate={() => undefined}
            onStopVoice={() => undefined}
            activeVideoNoteVisible={false}
            activeVideoNoteAuthor={null}
            activeVideoNoteIsPlaying={false}
            activeVideoNoteProgress={0}
            activeVideoNoteDurationLabel="0:00"
            onToggleVideoNotePlayback={() => undefined}
            onStopVideoNote={() => undefined}
            pinnedMessageText={telegramSelectionMode || isSearchMode ? null : pinnedMessageText}
            onPinnedPress={handlePinnedBannerPress}
            onPinnedClose={handlePinnedBannerClose}
            isSearchMode={isSearchMode}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onCancelSearch={handleCancelSearch}
            searchInputRef={searchInputRef}
          />

          <Reanimated.View style={[{ flex: 1 }, listKeyboardAnimatedStyle]}>
            {isSearchMode && normalizedSearchQuery.length > 0 && matchedMessageIds.length > 0 ? (
              <View style={styles.searchMatchOverlay} pointerEvents="box-none">
                <View
                  style={[
                    styles.searchMatchCounterPill,
                    { bottom: inputBarHeight + composerDockPaddingBottom + 6 },
                  ]}
                >
                  <Text style={styles.searchMatchCounterText}>
                    {`${searchActiveMatchIndex + 1} из ${matchedMessageIds.length}`}
                  </Text>
                </View>
                <View style={styles.searchMatchNavColumn}>
                  <Pressable
                    accessibilityLabel="Предыдущий результат поиска"
                    onPress={handleSearchMatchPrev}
                    style={({ pressed }) => [
                      styles.searchMatchNavButton,
                      pressed && styles.searchMatchNavButtonPressed,
                    ]}
                  >
                    <Feather name="chevron-up" size={22} color="#FFFFFF" />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Следующий результат поиска"
                    onPress={handleSearchMatchNext}
                    style={({ pressed }) => [
                      styles.searchMatchNavButton,
                      pressed && styles.searchMatchNavButtonPressed,
                    ]}
                  >
                    <Feather name="chevron-down" size={22} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
            ) : null}

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={(info) => {
                const rows = messagesRef.current;
                let olderComparableDateMs: number | null = null;
                for (let j = info.index + 1; j < rows.length; j += 1) {
                  const candidateMs = rows[j]!.dateMs;
                  if (isValidChatTimestamp(candidateMs)) {
                    olderComparableDateMs = candidateMs;
                    break;
                  }
                }
                const showDaySeparator =
                  isValidChatTimestamp(info.item.dateMs) &&
                  (olderComparableDateMs == null ||
                    getChatDayKey(info.item.dateMs) !== getChatDayKey(olderComparableDateMs));
                return (
                  <View>
                    {showDaySeparator ? (
                      <ChatDaySeparator label={formatChatDayLabel(info.item.dateMs)} />
                    ) : null}
                    {renderMessageRow(info)}
                  </View>
                );
              }}
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
              onScroll={handleMessagesListScroll}
              scrollEventThrottle={48}
              onMomentumScrollEnd={handleMessagesListScrollEnd}
              onScrollEndDrag={handleMessagesListScrollEnd}
              onContentSizeChange={recheckFabVisibility}
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
            {!isSearchMode && !telegramSelectionMode && !isVoiceRecording ? (
              <ChatScrollToBottomButton
                visible={showScrollToBottom}
                bottom={inputBarHeight + composerDockPaddingBottom + 12}
                onPress={scrollToBottom}
              />
            ) : null}
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
                  onSendMediaAlbum={sendMediaAlbum}
                  onSendFile={sendFile}
                  onInputChange={onComposerTextChange}
                  replyToMessage={replyToInputMessage}
                  replyAuthorName={replyAuthorName}
                  onCancelReply={() => setReplyToMessageId(null)}
                  onVoiceActiveChange={(active) => {
                    isVoiceRecordingShared.value = active;
                    setIsVoiceRecording(active);
                  }}
                  isScreenFocused={isFocused}
                  placeholder="Сообщение"
                  isChannelAdmin={isChannel}
                  channelSilentMode={false} // Placeholder for actual silent mode state
                  onToggleChannelSilentMode={() => {
                    Alert.alert('Информация', 'Функция беззвучной отправки будет реализована позже.');
                  }}
                />
              ) : (
                <View style={styles.readOnlyFooter} accessibilityLabel="Панель действий">
                  {isChannel ? (
                    channelMemberStatus === 'chatMemberStatusLeft' ? (
                      <Pressable 
                        onPress={() => {
                          tdlibClient.send({ '@type': 'joinChat', chat_id: chatId })
                            .then(() => setChannelMemberStatus('chatMemberStatusMember'))
                            .catch(() => Alert.alert('Ошибка', 'Не удалось подписаться на канал'));
                        }}
                        style={{ paddingHorizontal: 24, paddingVertical: 8 }}
                      >
                        <Text style={[styles.readOnlyText, { color: colors.accent, fontWeight: '500' }]}>
                          Подписаться
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable 
                        onPress={() => {
                          const nextMute = true; // Placeholder for toggle mute
                          Alert.alert('Звук', 'Переключение уведомлений будет реализовано позже.');
                        }}
                        style={{ paddingHorizontal: 24, paddingVertical: 8 }}
                      >
                        <Text style={[styles.readOnlyText, { color: colors.textSecondary }]}>
                          Убрать звук
                        </Text>
                      </Pressable>
                    )
                  ) : (
                    <Text style={styles.readOnlyText}>Только для чтения</Text>
                  )}
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
      <ChatProfileMediaViewerModal
        visible={telegramAlbumViewer != null}
        items={telegramAlbumViewer?.items ?? []}
        selectedIndex={telegramAlbumViewer?.index ?? 0}
        onChangeIndex={(index) =>
          setTelegramAlbumViewer((prev) => (prev ? { ...prev, index } : null))
        }
        onClose={closeTelegramAlbumViewer}
      />
    </View>
  );
}
