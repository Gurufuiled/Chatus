import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { BlurTargetView } from 'expo-blur';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  InteractionManager,
  Keyboard,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import type { ChatsStackParamList } from '../navigation/types';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import { canForwardMessage, TransportService } from '../services/TransportService';
import { SyncService } from '../services/SyncService';
import { WebSocketService } from '../services/WebSocketService';
import { uiStore } from '../stores/uiStore';
import {
  ChatContextMenuOverlay,
  ChatForwardSheet,
  ChatInputDock,
  ChatMessageList,
  ChatTopBanners,
  FileBubble,
  ForwardHeader,
  ImageBubble,
  MessageTimeStatus,
  ReplyPreview,
  VideoNoteBubble,
  VoiceBubble,
  buildReplyPreviewText,
  getReplyPreviewThumbnailUri,
} from '../components';
import {
  useVoicePlayerControls,
  useVoicePlayerState,
} from '../contexts/VoicePlayerContext';
import type { Message } from '../stores/types';
import { bubbleRadius, colors } from '../theme/colors';
import { DEFAULT_CHAT_THEME_ID, getChatTheme } from '../theme/chatThemes';
import {
  ChatBackgroundPattern,
  EMPTY_MESSAGES,
  formatPlaybackRate,
  formatTime,
  getCopyableContent,
  getMessageAuthorPresentation,
  getDeletedPlaceholder,
  getMessageAuthorName,
  MENU_EDGE_GAP,
  MENU_HEIGHT,
  MENU_TO_MESSAGE_GAP,
  MENU_WIDTH,
  OVERLAY_BOTTOM_INSET,
  REPLIED_VOICE_BUBBLE_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from './chatScreen.shared';

type ChatRoute = RouteProp<ChatsStackParamList, 'Chat'>;
type ChatNavigation = NativeStackNavigationProp<ChatsStackParamList, 'Chat'>;
type MessageMenuActionKey = 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'select';
type OverlayActionKey = MessageMenuActionKey | 'delete_confirm' | 'delete_cancel';
type MenuMode = 'actions' | 'deleteConfirm';

type MenuState = {
  messageId: string;
  isMe: boolean;
  previewTop: number;
  previewLeft: number;
  previewWidth: number;
  previewHeight: number;
  menuTop: number;
  menuLeft: number;
  placement: 'above' | 'below';
} | null;

type MenuAction = {
  key: OverlayActionKey;
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'] | null;
  color: string;
  disabled: boolean;
  textOnly?: boolean;
};

function buildForwardPreview(message: Message): string {
  switch (message.msg_type) {
    case 'text':
      return message.content?.trim() || 'Сообщение';
    case 'image':
      return message.content?.trim() || 'Фото';
    case 'voice':
      return 'Голосовое сообщение';
    case 'video_note':
      return 'Видеосообщение';
    case 'file':
      return message.media?.[0]?.file_name?.trim() || 'Файл';
    default:
      return 'Сообщение';
  }
}

function cloneForwardMedia(message: Message): Message['media'] | undefined {
  if (!message.media?.length) return undefined;
  return message.media.map((item) => ({ ...item }));
}

export function ChatScreen() {
  const navigation = useNavigation<ChatNavigation>();
  const route = useRoute<ChatRoute>();
  const isFocused = useIsFocused();
  const { chatId, focusMessageId, startSearch } = route.params;
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const { play, pause, stop, setPlaybackRate } = useVoicePlayerControls();
  const { currentVoiceUri, status: voiceStatus } = useVoicePlayerState();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Message> | null>(null);
  const blurTargetRef = useRef<View | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const animatedKeyboard = useAnimatedKeyboard();
  const [inputBarHeight, setInputBarHeight] = useState(82);
  const [selectionActionBarHeight, setSelectionActionBarHeight] = useState(104);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>('actions');
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardSourceMessageIds, setForwardSourceMessageIds] = useState<string[]>([]);
  const [forwardFromSelection, setForwardFromSelection] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const menuAnim = useRef(new Animated.Value(0)).current;
  const messageContentRefs = useRef<Record<string, View | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentReadReceiptIdsRef = useRef<Set<string>>(new Set());

  const messages = messageStore(
    useCallback(
      (state) => state.messagesByChatId[chatId] ?? EMPTY_MESSAGES,
      [chatId]
    )
  );
  const chats = chatStore((state) => state.chats);
  const chatThemeId = uiStore((state) => state.chatThemeIdByChatId[chatId] ?? DEFAULT_CHAT_THEME_ID);
  const chatTheme = React.useMemo(() => getChatTheme(chatThemeId), [chatThemeId]);

  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of messages) {
      map.set(message.id, message);
    }
    return map;
  }, [messages]);

  const replyToMessage = replyToMessageId ? messageById.get(replyToMessageId) ?? null : null;
  const replyAuthorName = replyToMessage
    ? getMessageAuthorName(replyToMessage, chatId, currentUserId)
    : null;
  const activeMenuMessage = menuState ? messageById.get(menuState.messageId) ?? null : null;
  const selectionMode = selectedMessageIds.length > 0;
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds), [selectedMessageIds]);
  const selectedMessages = useMemo(
    () =>
      selectedMessageIds
        .map((id) => messageById.get(id) ?? null)
        .filter((message): message is Message => message != null),
    [messageById, selectedMessageIds]
  );
  const selectedMessagesSorted = useMemo(
    () => [...selectedMessages].sort((a, b) => a.created_at - b.created_at),
    [selectedMessages]
  );
  const currentChat = chats.find((chat) => chat.id === chatId) ?? null;
  const pinnedMessageId = currentChat?.pinned_message_id ?? null;
  const pinnedMessage = pinnedMessageId ? messageById.get(pinnedMessageId) ?? null : null;
  const forwardTargets = useMemo(
    () => chats.filter((chat) => chat.id !== chatId),
    [chatId, chats]
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const matchedMessageIds = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return messages
      .filter((message) => {
        if (message.is_deleted === 1) return false;
        const haystack = getCopyableContent(message).toLowerCase();
        return haystack.includes(normalizedSearchQuery);
      })
      .map((message) => message.id);
  }, [messages, normalizedSearchQuery]);
  const activeVoiceMessage = useMemo(() => {
    if (!currentVoiceUri) return null;
    return (
      messages.find((message) => {
        if (message.msg_type !== 'voice') return false;
        const remoteUri = message.media?.[0]?.remote_url ?? null;
        return remoteUri === currentVoiceUri || `file://${message.id}` === currentVoiceUri;
      }) ?? null
    );
  }, [currentVoiceUri, messages]);
  const activeVoiceAuthor = activeVoiceMessage
    ? getMessageAuthorName(activeVoiceMessage, chatId, currentUserId)
    : null;
  const activeVoiceProgress =
    voiceStatus.durationMs > 0 ? Math.min(voiceStatus.positionMs / voiceStatus.durationMs, 1) : 0;
  const canDeleteSelectedMessages =
    selectedMessages.length > 0 &&
    selectedMessages.every((message) => message.sender_id === currentUserId && message.is_deleted !== 1);
  const forwardableSelectedMessages = useMemo(
    () => selectedMessagesSorted.filter((message) => canForwardMessage(message)),
    [selectedMessagesSorted]
  );
  const canForwardSelectedMessages = forwardableSelectedMessages.length > 0;

  useEffect(() => {
    const existing = messageStore.getState().messagesByChatId[chatId];
    const hasOnlyOptimisticMessages =
      Array.isArray(existing) &&
      existing.length > 0 &&
      existing.every(
        (message) =>
          message.status === 'sending' &&
          !message.server_id &&
          typeof message.id === 'string' &&
          message.id.startsWith('temp-')
      );

    if (!existing?.length || hasOnlyOptimisticMessages) {
      const task = InteractionManager.runAfterInteractions(() => {
        SyncService.fetchMessagesForChat(chatId).catch(() => {});
      });

      return () => {
        task.cancel();
      };
    }
  }, [chatId]);

  useEffect(() => {
    if (pinnedMessageId && !messageById.has(pinnedMessageId)) {
      const task = InteractionManager.runAfterInteractions(() => {
        SyncService.fetchMessagesForChat(chatId).catch(() => {});
      });

      return () => {
        task.cancel();
      };
    }
  }, [chatId, messageById, pinnedMessageId]);

  useFocusEffect(
    useCallback(() => {
      chatStore.getState().setSelectedChat(chatId);
      chatStore.getState().clearUnread(chatId);

      return () => {
        if (chatStore.getState().selectedChatId === chatId) {
          chatStore.getState().setSelectedChat(null);
        }
      };
    }, [chatId])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsAppActive(nextState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    if (currentChat?.chat_type !== 'private' && currentChat?.chat_type !== 'group') return;
    if (!isFocused || !isAppActive) return;
    if (chatStore.getState().selectedChatId !== chatId) return;
    if (!WebSocketService.isConnected()) return;

    for (const message of messages) {
      if (message.sender_id === currentUserId || message.is_deleted === 1) {
        continue;
      }
      if (message.status === 'read') {
        sentReadReceiptIdsRef.current.add(message.id);
        continue;
      }
      if (sentReadReceiptIdsRef.current.has(message.id)) {
        continue;
      }

      WebSocketService.sendEvent('ack', {
        chat_id: chatId,
        message_id: message.id,
        status: 'read',
      });
      sentReadReceiptIdsRef.current.add(message.id);
    }
  }, [chatId, currentChat?.chat_type, currentUserId, isAppActive, isFocused, messages]);

  useEffect(() => {
    if (replyToMessageId && !messageById.has(replyToMessageId)) {
      setReplyToMessageId(null);
    }
  }, [messageById, replyToMessageId]);

  useEffect(() => {
    if (!startSearch) return;
    setIsSearchMode(true);
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    });
    navigation.setParams({ startSearch: undefined });
    return () => {
      task.cancel();
    };
  }, [navigation, startSearch]);

  const clearReplyState = useCallback(() => {
    setReplyToMessageId(null);
  }, []);

  const clearSelectionMode = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  const handleCancelSearch = useCallback(() => {
    setIsSearchMode(false);
    setSearchQuery('');
    Keyboard.dismiss();
  }, []);

  const handleToggleVoiceBannerPlayback = useCallback(() => {
    if (!currentVoiceUri) return;
    if (voiceStatus.isPlaying) {
      void pause();
      return;
    }
    void play(currentVoiceUri);
  }, [currentVoiceUri, pause, play, voiceStatus.isPlaying]);

  const handleCycleVoiceRate = useCallback(() => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.findIndex((rate) => Math.abs(rate - (voiceStatus.rate || 1)) < 0.01);
    const nextRate = rates[(currentIndex + 1 + rates.length) % rates.length];
    void setPlaybackRate(nextRate);
  }, [setPlaybackRate, voiceStatus.rate]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    sentReadReceiptIdsRef.current.clear();
  }, [chatId]);

  const scrollToMessageId = useCallback((messageId: string, missingMessageTitle?: string) => {
    const targetIndex = messages.findIndex((message) => message.id === messageId);
    if (targetIndex < 0) {
      Alert.alert(
        missingMessageTitle ?? 'Сообщение не найдено',
        'Нужное сообщение пока не загружено в этот экран.'
      );
      return false;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
        viewPosition: 0.45,
      });
    });

    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimeoutRef.current = null;
    }, 1800);

    return true;
  }, [messages]);

  const handlePinnedBannerPress = useCallback(() => {
    if (!pinnedMessageId) return;
    scrollToMessageId(pinnedMessageId, 'Сообщение не найдено');
  }, [pinnedMessageId, scrollToMessageId]);

  const handleReplyPreviewPress = useCallback((messageId: string) => {
    scrollToMessageId(messageId, 'Сообщение недоступно');
  }, [scrollToMessageId]);

  useEffect(() => {
    if (!focusMessageId) return;

    const didScroll = scrollToMessageId(focusMessageId, 'Сообщение недоступно');
    if (didScroll) {
      navigation.setParams({ focusMessageId: undefined });
    }
  }, [focusMessageId, navigation, scrollToMessageId]);

  useEffect(() => {
    if (!isSearchMode || !normalizedSearchQuery) return;
    if (matchedMessageIds.length === 0) return;

    const timer = setTimeout(() => {
      scrollToMessageId(matchedMessageIds[0]);
    }, 120);

    return () => clearTimeout(timer);
  }, [isSearchMode, matchedMessageIds, normalizedSearchQuery, scrollToMessageId]);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const fallbackOffset = Math.max(info.index * Math.max(info.averageItemLength, 72), 0);
      listRef.current?.scrollToOffset({ offset: fallbackOffset, animated: true });

      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: info.index,
          animated: true,
          viewPosition: 0.45,
        });
      }, 120);
    },
    []
  );

  const toggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    );
  }, []);

  const handleMessagePress = useCallback((messageId: string) => {
    if (!selectionMode) return;
    toggleSelectedMessage(messageId);
  }, [selectionMode, toggleSelectedMessage]);

  const setMessageContentRef = useCallback((messageId: string, node: View | null) => {
    if (node) {
      messageContentRefs.current[messageId] = node;
      return;
    }

    delete messageContentRefs.current[messageId];
  }, []);

  const openMessageMenu = useCallback((message: Message) => {
    const target = messageContentRefs.current[message.id];
    if (!target) return;

    Keyboard.dismiss();
    setMenuMode('actions');

    target.measureInWindow((pageX, pageY, width, height) => {
      const reactionBarHeight = 42;
      const reactionGap = 6;
      const bottomReserved = Math.max(
        OVERLAY_BOTTOM_INSET,
        inputBarHeight + insets.bottom + 22
      );
      const bottomLimit = SCREEN_HEIGHT - Math.max(MENU_EDGE_GAP + 8, insets.bottom + 18);
      const previewLeft = Math.max(
        MENU_EDGE_GAP,
        Math.min(pageX, SCREEN_WIDTH - width - MENU_EDGE_GAP)
      );
      const minPreviewTop = Math.max(
        insets.top + 12,
        MENU_EDGE_GAP + reactionBarHeight + reactionGap
      );
      const maxPreviewTop = bottomLimit - MENU_HEIGHT - MENU_TO_MESSAGE_GAP - height;
      const anchoredTop = Math.max(
        minPreviewTop,
        Math.min(pageY, Math.max(minPreviewTop, maxPreviewTop))
      );
      const menuLeftBase = message.sender_id === currentUserId
        ? previewLeft + width - MENU_WIDTH
        : previewLeft;
      const menuLeft = Math.max(
        MENU_EDGE_GAP,
        Math.min(menuLeftBase, SCREEN_WIDTH - MENU_WIDTH - MENU_EDGE_GAP)
      );

      let previewTop = anchoredTop;
      previewTop = Math.max(
        minPreviewTop,
        Math.min(previewTop, bottomLimit - MENU_HEIGHT - MENU_TO_MESSAGE_GAP - height)
      );
      const menuTop = previewTop + height + MENU_TO_MESSAGE_GAP;
      const placement: 'above' | 'below' = 'below';

      setMenuState({
        messageId: message.id,
        isMe: message.sender_id === currentUserId,
        previewTop,
        previewLeft,
        previewWidth: width,
        previewHeight: height,
        menuTop,
        menuLeft,
        placement,
      });
    });
  }, [currentUserId, insets.bottom, insets.top, inputBarHeight]);

  const closeMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMenuMode('actions');
        setMenuState(null);
      }
    });
  }, [menuAnim]);

  useEffect(() => {
    if (!menuState) {
      menuAnim.setValue(0);
      return;
    }

    Animated.spring(menuAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [menuAnim, menuState]);

  const handleSendText = useCallback(
    (text: string) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'text',
        content: text,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
      };
      messageStore.getState().prependMessage(chatId, msg);
      TransportService.sendMessage(chatId, text, 'text', tempId, activeReplyId);
      setReplyToMessageId(null);
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendVoice = useCallback(
    async (result: { uri: string; waveform: number[]; durationMs: number }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'voice',
        content: null,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: [{
          remote_url: result.uri,
          waveform: result.waveform,
          duration_ms: result.durationMs,
        }],
      };
      messageStore.getState().prependMessage(chatId, msg);
      setReplyToMessageId(null);
      await TransportService.sendVoiceMessage(
        chatId,
        { uri: result.uri, durationMs: result.durationMs, waveform: result.waveform },
        tempId,
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendVideoNote = useCallback(
    async (result: { uri: string; durationMs: number; thumbnailUri?: string }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'video_note',
        content: null,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: [
          {
            remote_url: result.uri,
            duration_ms: result.durationMs,
            thumbnail_url: result.thumbnailUri,
            is_round: true,
          },
        ],
      };
      messageStore.getState().prependMessage(chatId, msg);
      setReplyToMessageId(null);
      await TransportService.sendVideoNoteMessage(
        chatId,
        {
          uri: result.uri,
          durationMs: result.durationMs,
          thumbnailUri: result.thumbnailUri,
        },
        tempId,
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendImage = useCallback(
    async (result: { uri: string; width?: number; height?: number; fileName?: string; mimeType?: string; caption?: string }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'image',
        content: result.caption ?? null,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: [
          {
            remote_url: result.uri,
            width: result.width,
            height: result.height,
            file_name: result.fileName,
          },
        ],
      };
      messageStore.getState().prependMessage(chatId, msg);
      setReplyToMessageId(null);
      await TransportService.sendImageMessage(
        chatId,
        {
          uri: result.uri,
          width: result.width,
          height: result.height,
          fileName: result.fileName,
          mimeType: result.mimeType,
          caption: result.caption,
        },
        tempId,
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendFile = useCallback(
    async (result: { uri: string; name: string; size: number; mimeType?: string }) => {
      if (!currentUserId) return;
      const activeReplyId = replyToMessageId;
      setReplyToMessageId(null);
      await TransportService.sendFileMessage(
        chatId,
        {
          uri: result.uri,
          name: result.name,
          size: result.size,
          mimeType: result.mimeType,
        },
        `temp-${Date.now()}`,
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const confirmDeleteMessage = useCallback((message: Message) => {
    if (message.sender_id !== currentUserId) {
      closeMenu();
      Alert.alert('Удаление недоступно', 'Сейчас можно удалить только свои сообщения.');
      return;
    }

    closeMenu();
    messageStore.getState().updateMessage(chatId, message.id, {
      is_deleted: 1,
      content: null,
    });
    if (pinnedMessageId === message.id && currentChat) {
      chatStore.getState().updateChat({
        ...currentChat,
        pinned_message_id: null,
      });
    }
    TransportService.deleteMessage(chatId, message.id);
  }, [chatId, closeMenu, currentChat, currentUserId, pinnedMessageId]);

  const handleDeleteMessage = useCallback((message: Message) => {
    if (message.sender_id !== currentUserId) {
      closeMenu();
      Alert.alert('Удаление недоступно', 'Сейчас можно удалить только свои сообщения.');
      return;
    }

    setMenuMode('deleteConfirm');
  }, [chatId, closeMenu, currentChat, currentUserId, pinnedMessageId]);

  const handlePinToggle = useCallback((message: Message) => {
    const nextPinnedId = pinnedMessageId === message.id ? null : message.id;
    if (currentChat) {
      chatStore.getState().updateChat({
        ...currentChat,
        pinned_message_id: nextPinnedId,
      });
    }
    TransportService.pinMessage(chatId, nextPinnedId);
    closeMenu();
  }, [chatId, closeMenu, currentChat, pinnedMessageId]);

  const handleForwardMessage = useCallback((message: Message) => {
    closeMenu();
    setTimeout(() => {
      setForwardFromSelection(false);
      setForwardSourceMessageIds([message.id]);
    }, 150);
  }, [closeMenu]);

  const handleForwardToChat = useCallback((targetChatId: string) => {
    if (!currentUserId) {
      Alert.alert('Не удалось переслать', 'Сначала нужно заново авторизоваться.');
      setForwardSourceMessageIds([]);
      setForwardFromSelection(false);
      return;
    }

    const sourceMessages = forwardSourceMessageIds
      .map((id) => messageById.get(id) ?? null)
      .filter((message): message is Message => message != null)
      .sort((a, b) => a.created_at - b.created_at);

    if (sourceMessages.length === 0) {
      setForwardSourceMessageIds([]);
      setForwardFromSelection(false);
      return;
    }

    let sentCount = 0;
    for (const [index, message] of sourceMessages.entries()) {
      const sourceAuthorName = (() => {
        if (message.forwarded_from_name?.trim()) {
          return message.forwarded_from_name.trim();
        }
        if (message.sender_id === currentUserId) {
          return (
            authStore.getState().user?.display_name?.trim() ||
            authStore.getState().user?.username?.trim() ||
            'Вы'
          );
        }
        if (currentChat?.chat_type === 'private') {
          return getMessageAuthorName(message, chatId, currentUserId).trim();
        }
        return message.sender_id;
      })();
      const forwardedFromName =
        sourceAuthorName || null;
      const forwardedFromMessageId =
        message.forwarded_from_message_id ?? message.id;
      const forwardedFromChatId =
        message.forwarded_from_chat_id ?? message.chat_id;
      const forwardedFromSenderId =
        message.forwarded_from_sender_id ?? message.sender_id;
      const tempId = `temp-forward-${Date.now()}-${index}-${message.id}`;
      const now = Date.now();
      const optimisticMessage: Message = {
        id: tempId,
        chat_id: targetChatId,
        sender_id: currentUserId,
        msg_type: message.msg_type,
        content: message.content ?? null,
        reply_to_id: null,
        forwarded_from_message_id: forwardedFromMessageId,
        forwarded_from_name: forwardedFromName,
        forwarded_from_chat_id: forwardedFromChatId,
        forwarded_from_sender_id: forwardedFromSenderId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: cloneForwardMedia(message),
      };

      if (
        TransportService.forwardMessage(targetChatId, message, {
          messageId: forwardedFromMessageId,
          name: forwardedFromName,
          chatId: forwardedFromChatId,
          senderId: forwardedFromSenderId,
        }, tempId)
      ) {
        messageStore.getState().prependMessage(targetChatId, optimisticMessage);
        const targetChat = chats.find((chat) => chat.id === targetChatId);
        if (targetChat) {
          chatStore.getState().updateChat({
            ...targetChat,
            last_message_id: tempId,
            last_message_at: now,
            last_message_preview: buildForwardPreview(optimisticMessage),
          });
        }
        sentCount += 1;
      }
    }

    setForwardSourceMessageIds([]);

    if (forwardFromSelection) {
      setSelectedMessageIds([]);
      setForwardFromSelection(false);
    }

    if (sentCount === 0) {
      Alert.alert('Не удалось переслать', 'Этот тип сообщения пока нельзя переслать.');
      return;
    }

    setTimeout(() => {
      SyncService.fetchMessagesForChat(targetChatId).catch(() => {});
    }, 250);

    const targetChat = chats.find((chat) => chat.id === targetChatId);
    Alert.alert(
      'Переслано',
      sentCount === 1
        ? `Сообщение отправлено в чат «${targetChat?.peer_display_name || targetChat?.name || 'Чат'}».`
        : `${sentCount} сообщений отправлено в чат «${targetChat?.peer_display_name || targetChat?.name || 'Чат'}».`
    );
  }, [chatId, chats, currentChat?.chat_type, currentUserId, forwardFromSelection, forwardSourceMessageIds, messageById]);

  const handleForwardSheetClose = useCallback(() => {
    setForwardSourceMessageIds([]);
    setForwardFromSelection(false);
  }, []);

  const handleForwardHeaderPress = useCallback((message: Message) => {
    const sourceChatId = message.forwarded_from_chat_id ?? null;
    const sourceMessageId = message.forwarded_from_message_id ?? null;
    const sourceSenderId = message.forwarded_from_sender_id ?? null;

    if (!sourceChatId) {
      return;
    }

    const sourceChat = chats.find((chat) => chat.id === sourceChatId) ?? null;
    const sourceChatTitle =
      sourceChat?.peer_display_name?.trim() ||
      sourceChat?.name?.trim() ||
      message.forwarded_from_name?.trim() ||
      'Чат';

    if (sourceChatId === chatId && sourceMessageId) {
      scrollToMessageId(sourceMessageId, 'Исходное сообщение недоступно');
      return;
    }

    if (sourceChat) {
      navigation.navigate('Chat', {
        chatId: sourceChatId,
        chatTitle: sourceChatTitle,
        focusMessageId: sourceMessageId ?? undefined,
      });
      return;
    }

    if (sourceSenderId) {
      navigation.navigate('ChatProfile', {
        chatId: sourceChatId,
        userId: sourceSenderId,
        chatTitle: sourceChatTitle,
      });
    }
  }, [chatId, chats, navigation, scrollToMessageId]);

  const handleForwardSelectedMessages = useCallback(() => {
    if (!canForwardSelectedMessages) {
      Alert.alert('Нечего переслать', 'Среди выбранных сообщений нет поддерживаемых для пересылки.');
      return;
    }

    Keyboard.dismiss();
    setForwardFromSelection(true);
    setForwardSourceMessageIds(forwardableSelectedMessages.map((message) => message.id));
  }, [canForwardSelectedMessages, forwardableSelectedMessages]);

  const handleDeleteSelectedMessages = useCallback(() => {
    if (!canDeleteSelectedMessages) {
      Alert.alert('Удаление недоступно', 'Пока можно удалить только свои выбранные сообщения.');
      return;
    }

    const count = selectedMessages.length;
    Alert.alert(
      count > 1 ? 'Удалить выбранные сообщения?' : 'Удалить сообщение?',
      count > 1
        ? `Будет удалено ${count} сообщений из этого чата.`
        : 'Сообщение исчезнет из этого чата.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            for (const message of selectedMessages) {
              messageStore.getState().updateMessage(chatId, message.id, {
                is_deleted: 1,
                content: null,
              });
              if (pinnedMessageId === message.id && currentChat) {
                chatStore.getState().updateChat({
                  ...currentChat,
                  pinned_message_id: null,
                });
              }
              TransportService.deleteMessage(chatId, message.id);
            }
            setSelectedMessageIds([]);
          },
        },
      ]
    );
  }, [canDeleteSelectedMessages, chatId, currentChat, pinnedMessageId, selectedMessages]);

  const handleMenuAction = useCallback(async (key: MessageMenuActionKey) => {
    if (!activeMenuMessage) return;

    switch (key) {
      case 'reply':
        setReplyToMessageId(activeMenuMessage.id);
        closeMenu();
        return;
      case 'copy': {
        const value = getCopyableContent(activeMenuMessage);
        closeMenu();
        if (!value) {
          Alert.alert('Нечего копировать', 'В этом сообщении нет текста для копирования.');
          return;
        }
        await Clipboard.setStringAsync(value);
        return;
      }
      case 'pin':
        handlePinToggle(activeMenuMessage);
        return;
      case 'forward':
        handleForwardMessage(activeMenuMessage);
        return;
      case 'select':
        toggleSelectedMessage(activeMenuMessage.id);
        closeMenu();
        return;
      case 'delete':
        handleDeleteMessage(activeMenuMessage);
        return;
    }
  }, [activeMenuMessage, closeMenu, handleDeleteMessage, handleForwardMessage, handlePinToggle, toggleSelectedMessage]);

  const handleDeleteConfirmAction = useCallback((key: string) => {
    if (!activeMenuMessage) return;

    if (key === 'delete_confirm') {
      confirmDeleteMessage(activeMenuMessage);
      return;
    }

    if (key === 'delete_cancel') {
      setMenuMode('actions');
    }
  }, [activeMenuMessage, confirmDeleteMessage]);

  const handleInputBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== inputBarHeight) {
      setInputBarHeight(nextHeight);
    }
  }, [inputBarHeight]);

  const handleSelectionActionBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== selectionActionBarHeight) {
      setSelectionActionBarHeight(nextHeight);
    }
  }, [selectionActionBarHeight]);

  const inputBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(animatedKeyboard.height.value, 0) }],
  }));

  const listWrapAnimatedStyle = useAnimatedStyle(() => ({
    marginBottom: Math.max(animatedKeyboard.height.value, 0),
  }));

  const canSwipeReply = useCallback((message: Message) => {
    if (selectionMode) return false;
    if (message.is_deleted === 1) return false;
    return message.msg_type === 'text' || message.msg_type === 'voice' || message.msg_type === 'image';
  }, [selectionMode]);

  const handleSwipeReply = useCallback((message: Message) => {
    setReplyToMessageId((current) => (current === message.id ? current : message.id));
  }, []);

  const renderMenuPreviewBody = useCallback((item: Message, forcedWidth?: number) => {
    const isMe = item.sender_id === currentUserId;
    const fixedWidthStyle = forcedWidth ? { width: forcedWidth, maxWidth: forcedWidth } : null;

    const renderReplySnippet = () => {
      if (!item.reply_to_id) return null;
      const replied = messageById.get(item.reply_to_id);
      const author = replied
        ? getMessageAuthorName(replied, chatId, currentUserId)
        : 'Исходное сообщение';
      const text = replied
        ? buildReplyPreviewText(replied)
        : 'Исходное сообщение недоступно';

      return (
        <ReplyPreview
          author={author}
          text={text}
          accentColor={isMe ? '#DFF2A8' : '#F28C28'}
          backgroundColor={isMe ? '#6A9EFF' : '#F2F4D9'}
          textColor={isMe ? 'rgba(255,255,255,0.88)' : '#5F6368'}
          authorColor={isMe ? '#FFD08A' : '#D1782B'}
          thumbnailUri={getReplyPreviewThumbnailUri(replied)}
        />
      );
    };

    const renderForwardHeader = () => {
      if (!item.forwarded_from_name && !item.forwarded_from_message_id) {
        return null;
      }

      return (
        <ForwardHeader
          isMe={isMe}
          name={item.forwarded_from_name}
          onPress={() => handleForwardHeaderPress(item)}
        />
      );
    };

    if (item.is_deleted === 1) {
      return (
        <View
          style={[
            styles.deletedBubble,
            fixedWidthStyle,
            isMe ? styles.deletedBubbleMe : styles.deletedBubbleOther,
          ]}
        >
          <Text style={[styles.deletedText, isMe && styles.deletedTextMe]}>
            {getDeletedPlaceholder(isMe)}
          </Text>
          <MessageTimeStatus
            time={formatTime(item.created_at)}
            status={item.status}
            isMe={isMe}
            compact
          />
        </View>
      );
    }

    if (item.msg_type === 'text') {
      const rawContent = item.content ?? '';
      const displayContent = rawContent.trim() || ' ';

      return (
        <View style={[styles.bubble, fixedWidthStyle, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {renderForwardHeader()}
          {renderReplySnippet()}
          <View style={styles.bubbleContentRow}>
            <Text style={[styles.textContent, isMe && styles.textContentMe]}>
              {displayContent}
            </Text>
            <MessageTimeStatus
              time={formatTime(item.created_at)}
              status={item.status}
              isMe={isMe}
              compact
            />
          </View>
        </View>
      );
    }

    if (item.msg_type === 'voice' && item.media?.[0]) {
      const replySnippet = renderReplySnippet();
      const forwardHeader = replySnippet ? null : renderForwardHeader();
      const voiceContent = (
        <VoiceBubble
          uri={item.media[0].remote_url ?? `file://${item.id}`}
          waveform={item.media[0].waveform ?? []}
          durationMs={item.media[0].duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={forwardHeader}
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              styles.repliedVoiceBubble,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              fixedWidthStyle,
            ]}
          >
            {renderForwardHeader()}
            {replySnippet}
            {voiceContent}
          </View>
        );
      }

      return (
        <View style={[styles.mediaStack, fixedWidthStyle]}>
          {voiceContent}
        </View>
      );
    }

    if (item.msg_type === 'video_note' && item.media?.[0]) {
      const media = item.media[0];
      const videoUri = media.remote_url?.trim() ?? '';
      if (!videoUri) return null;

      const replySnippet = renderReplySnippet();
      const forwardHeader = replySnippet ? null : renderForwardHeader();
      const videoContent = (
        <VideoNoteBubble
          uri={videoUri}
          thumbnailUri={media.thumbnail_url ?? undefined}
          durationMs={media.duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={forwardHeader}
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              fixedWidthStyle,
            ]}
          >
            {renderForwardHeader()}
            {replySnippet}
            {videoContent}
          </View>
        );
      }

      return (
        <View style={[styles.mediaStack, fixedWidthStyle]}>
          {videoContent}
        </View>
      );
    }

    if (item.msg_type === 'image') {
      const media = item.media?.[0];
      const imageUri = media?.remote_url ?? '';
      if (!imageUri.trim()) return null;

      const replySnippet = renderReplySnippet();
      const forwardHeader = replySnippet ? null : renderForwardHeader();
      const imageContent = (
        <ImageBubble
          uri={imageUri}
          isMe={isMe}
          width={media?.width}
          height={media?.height}
          caption={item.content ?? undefined}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={forwardHeader}
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              fixedWidthStyle,
            ]}
          >
            {renderForwardHeader()}
            {replySnippet}
            {imageContent}
          </View>
        );
      }

      return (
        <View style={[styles.mediaStack, fixedWidthStyle]}>
          {imageContent}
        </View>
      );
    }

    if (item.msg_type === 'file' && item.media?.[0]) {
      const replySnippet = renderReplySnippet();
      return (
        <View style={[styles.mediaStack, fixedWidthStyle]}>
          {replySnippet}
          <FileBubble
            fileName={item.media[0].file_name ?? 'File'}
            fileSize={item.media[0].file_size}
            uri={item.media[0].remote_url ?? undefined}
            isMe={isMe}
            caption={item.content ?? undefined}
            time={formatTime(item.created_at)}
            status={item.status}
            header={renderForwardHeader()}
          />
        </View>
      );
    }

    return null;
  }, [chatId, currentUserId, handleForwardHeaderPress, messageById]);

  const menuActions = useMemo<MenuAction[]>(() => {
    if (!activeMenuMessage) return [];

    if (menuMode === 'deleteConfirm') {
      return [
        {
          key: 'delete_confirm',
          label: 'Удалить для всех',
          icon: null,
          color: '#E53935',
          disabled: false,
          textOnly: true,
        },
        {
          key: 'delete_cancel',
          label: 'Отмена',
          icon: null,
          color: '#111827',
          disabled: false,
          textOnly: true,
        },
      ];
    }

    const isPinned = pinnedMessageId === activeMenuMessage.id;
    const canForward = canForwardMessage(activeMenuMessage);

    return [
      { key: 'reply', label: 'Ответить', icon: 'corner-left-up', color: '#111827', disabled: false },
      { key: 'copy', label: 'Скопировать', icon: 'copy', color: '#111827', disabled: false },
      { key: 'pin', label: isPinned ? 'Открепить' : 'Закрепить', icon: 'bookmark', color: '#111827', disabled: false },
      { key: 'forward', label: 'Переслать', icon: 'corner-up-right', color: canForward ? '#111827' : '#9CA3AF', disabled: !canForward },
      { key: 'delete', label: 'Удалить', icon: 'trash-2', color: '#E53935', disabled: false },
      { key: 'select', label: 'Выбрать', icon: 'check-circle', color: '#111827', disabled: false },
    ];
  }, [activeMenuMessage, menuMode, pinnedMessageId]);

  return (
    <View style={[styles.container, { backgroundColor: chatTheme.canvasColor }]}>
      <BlurTargetView ref={blurTargetRef} collapsable={false} style={styles.chatContentLayer}>
        <ChatBackgroundPattern themeId={chatThemeId} />
        <ChatTopBanners
          selectionMode={selectionMode}
          selectedCount={selectedMessageIds.length}
          onClearSelection={clearSelectionMode}
          activeVoiceVisible={!!activeVoiceMessage}
          activeVoiceAuthor={activeVoiceAuthor}
          activeVoiceIsPlaying={voiceStatus.isPlaying}
          activeVoiceRateLabel={formatPlaybackRate(voiceStatus.rate || 1)}
          activeVoiceProgress={activeVoiceProgress}
          onToggleVoicePlayback={handleToggleVoiceBannerPlayback}
          onCycleVoiceRate={handleCycleVoiceRate}
          onStopVoice={() => {
            void stop();
          }}
          pinnedMessageText={pinnedMessage ? buildReplyPreviewText(pinnedMessage) : null}
          onPinnedPress={handlePinnedBannerPress}
          onPinnedClose={() => {
            if (currentChat) {
              chatStore.getState().updateChat({
                ...currentChat,
                pinned_message_id: null,
              });
            }
            TransportService.pinMessage(chatId, null);
          }}
          isSearchMode={isSearchMode}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onCancelSearch={handleCancelSearch}
          searchInputRef={searchInputRef}
        />

        <ChatMessageList
          chatId={chatId}
          isGroupChat={currentChat?.chat_type === 'group'}
          currentUserId={currentUserId}
          messages={messages}
          messageById={messageById}
          selectionMode={selectionMode}
          selectedMessageIdSet={selectedMessageIdSet}
          highlightedMessageId={highlightedMessageId}
          listRef={listRef}
          listAnimatedStyle={listWrapAnimatedStyle}
          contentPaddingTop={(selectionMode ? selectionActionBarHeight : inputBarHeight) + 8}
          canSwipeReply={canSwipeReply}
          onSwipeReply={handleSwipeReply}
          onMessagePress={handleMessagePress}
          onMessageLongPress={openMessageMenu}
          onForwardHeaderPress={selectionMode ? undefined : handleForwardHeaderPress}
          onReplyPreviewPress={selectionMode ? undefined : handleReplyPreviewPress}
          setContentRef={setMessageContentRef}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          formatTime={formatTime}
          getMessageAuthorPresentation={getMessageAuthorPresentation}
          getMessageAuthorName={getMessageAuthorName}
          getDeletedPlaceholder={getDeletedPlaceholder}
          repliedVoiceBubbleWidth={REPLIED_VOICE_BUBBLE_WIDTH}
          chatTheme={chatTheme}
        />

        {selectionMode ? (
          <Reanimated.View
            entering={FadeInDown.springify().damping(18).stiffness(220)}
            exiting={FadeOutDown.duration(150)}
            onLayout={handleSelectionActionBarLayout}
            style={[styles.selectionDockWrap, inputBarAnimatedStyle]}
          >
            <View
              style={[
                styles.selectionDockRow,
                { paddingBottom: Math.max(insets.bottom, 10) },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Удалить выбранные сообщения"
                disabled={!canDeleteSelectedMessages}
                onPress={handleDeleteSelectedMessages}
                style={({ pressed }) => [
                  styles.selectionDockAction,
                  styles.selectionDockActionLeft,
                  !canDeleteSelectedMessages && styles.selectionDockActionDisabled,
                  pressed && canDeleteSelectedMessages && styles.selectionDockActionPressed,
                ]}
              >
                <View
                  style={[
                    styles.selectionDockIconCircle,
                    styles.selectionDockDeleteCircle,
                    !canDeleteSelectedMessages && styles.selectionDockIconCircleDisabled,
                  ]}
                >
                  <Feather
                    name="trash-2"
                    size={20}
                    color={canDeleteSelectedMessages ? '#DB4F55' : '#A0A9B8'}
                  />
                </View>
                <Text
                  style={[
                    styles.selectionDockActionLabel,
                    !canDeleteSelectedMessages && styles.selectionDockActionLabelDisabled,
                  ]}
                >
                  Удалить
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Переслать выбранные сообщения"
                disabled={!canForwardSelectedMessages}
                onPress={handleForwardSelectedMessages}
                style={({ pressed }) => [
                  styles.selectionDockAction,
                  styles.selectionDockActionRight,
                  !canForwardSelectedMessages && styles.selectionDockActionDisabled,
                  pressed && canForwardSelectedMessages && styles.selectionDockActionPressed,
                ]}
              >
                <View
                  style={[
                    styles.selectionDockIconCircle,
                    styles.selectionDockForwardCircle,
                    !canForwardSelectedMessages && styles.selectionDockIconCircleDisabled,
                  ]}
                >
                  <Feather
                    name="corner-up-right"
                    size={20}
                    color={canForwardSelectedMessages ? '#4D8DFF' : '#A0A9B8'}
                  />
                </View>
                <Text
                  style={[
                    styles.selectionDockActionLabel,
                    !canForwardSelectedMessages && styles.selectionDockActionLabelDisabled,
                  ]}
                >
                  Переслать
                </Text>
              </Pressable>
            </View>
          </Reanimated.View>
        ) : (
          <ChatInputDock
            onLayout={handleInputBarLayout}
            animatedStyle={[styles.inputBarWrap, inputBarAnimatedStyle]}
            onSendText={handleSendText}
            onSendVoice={handleSendVoice}
            onSendVideoNote={handleSendVideoNote}
            onSendImage={handleSendImage}
            onSendFile={handleSendFile}
            blurTargetRef={blurTargetRef}
            replyToMessage={replyToMessage}
            replyAuthorName={replyAuthorName}
            onCancelReply={clearReplyState}
          />
        )}
      </BlurTargetView>

      <ChatContextMenuOverlay
        menuState={menuState}
        activeMenuMessage={activeMenuMessage}
        menuActions={menuActions}
        menuAnim={menuAnim}
        blurTargetRef={blurTargetRef}
        screenWidth={SCREEN_WIDTH}
        onClose={closeMenu}
        showReactions={menuMode === 'actions'}
        menuCardWidth={menuMode === 'deleteConfirm' ? 224 : undefined}
        onMenuAction={(key) => {
          if (menuMode === 'deleteConfirm') {
            handleDeleteConfirmAction(key);
            return;
          }
          void handleMenuAction(key as MessageMenuActionKey);
        }}
        renderMenuPreviewBody={renderMenuPreviewBody}
      />

      <ChatForwardSheet
        visible={forwardSourceMessageIds.length > 0}
        chats={forwardTargets}
        onClose={handleForwardSheetClose}
        onSelectChat={handleForwardToChat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F4D6' },
  chatContentLayer: {
    flex: 1,
  },
  inputBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  selectionDockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  selectionDockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  selectionDockAction: {
    alignItems: 'center',
    minWidth: 90,
    paddingBottom: 2,
  },
  selectionDockActionLeft: {
    alignSelf: 'flex-start',
    marginLeft: 2,
  },
  selectionDockActionRight: {
    alignSelf: 'flex-start',
    marginRight: 2,
  },
  selectionDockActionPressed: {
    opacity: 0.74,
  },
  selectionDockActionDisabled: {
    opacity: 0.45,
  },
  selectionDockIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
    borderWidth: 1,
    borderColor: 'rgba(248,251,255,0.95)',
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  selectionDockDeleteCircle: {
    borderColor: 'rgba(248,207,212,0.98)',
  },
  selectionDockForwardCircle: {
    borderColor: 'rgba(198,222,255,0.98)',
  },
  selectionDockIconCircleDisabled: {
    backgroundColor: 'rgba(231,236,243,0.96)',
    shadowOpacity: 0,
    elevation: 0,
    borderColor: 'rgba(214,221,230,0.92)',
  },
  selectionDockActionLabel: {
    marginTop: 9,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    color: '#163047',
  },
  selectionDockActionLabelDisabled: {
    color: '#94A3B8',
  },
  messagePressable: {
    width: '100%',
  },
  replyGestureContainer: {
    width: '100%',
    justifyContent: 'center',
  },
  replyGestureContent: {
    width: '100%',
  },
  messageWrap: {
    paddingHorizontal: 12,
    marginVertical: 4,
    width: '100%',
  },
  messageWrapMe: {
    alignItems: 'flex-end',
  },
  messageWrapOther: {
    alignItems: 'flex-start',
  },
  messageContentMeasure: {
    flexShrink: 1,
  },
  messageContentHighlighted: {
    borderRadius: 22,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    maxWidth: '82%',
  },
  bubbleMe: { backgroundColor: '#007AFF' },
  bubbleOther: { backgroundColor: '#E5E5EA' },
  bubbleContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  textContent: {
    fontSize: 16,
    lineHeight: 20,
    color: '#000',
    flexShrink: 1,
  },
  textContentMe: { color: '#fff' },
  selectedBubble: {
    borderWidth: 2,
    borderColor: '#F28C28',
    borderRadius: 18,
  },
  mediaStack: {
    maxWidth: '82%',
  },
  repliedMediaBubble: {
    maxWidth: '82%',
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  repliedVoiceBubble: {
    width: REPLIED_VOICE_BUBBLE_WIDTH,
    maxWidth: '82%',
  },
  repliedMediaBubbleMe: {
    backgroundColor: colors.bubbleMe,
    ...bubbleRadius.mine,
  },
  repliedMediaBubbleOther: {
    backgroundColor: colors.bubbleOther,
    ...bubbleRadius.other,
  },
  deletedBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '82%',
  },
  deletedBubbleMe: {
    backgroundColor: '#D8E8F9',
  },
  deletedBubbleOther: {
    backgroundColor: '#ECEDEF',
  },
  deletedText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#4B5563',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  deletedTextMe: {
    color: '#426789',
  },
  replySwipeAction: {
    position: 'absolute',
    right: 16,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  replySwipeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(77, 141, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});






