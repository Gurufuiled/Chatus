import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { BlurTargetView } from 'expo-blur';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Alert,
  Animated,
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
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Reanimated, {
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
import {
  ChatContextMenuOverlay,
  ChatForwardSheet,
  ChatInputDock,
  ChatMessageList,
  ChatTopBanners,
  FileBubble,
  ImageBubble,
  MessageTimeStatus,
  ReplyPreview,
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
import {
  ChatBackgroundPattern,
  EMPTY_MESSAGES,
  formatPlaybackRate,
  formatTime,
  getCopyableContent,
  getDeletedPlaceholder,
  getMessageAuthorName,
  MENU_EDGE_GAP,
  MENU_HEIGHT,
  MENU_TO_MESSAGE_GAP,
  MENU_WIDTH,
  OVERLAY_BOTTOM_INSET,
  OVERLAY_TOP_INSET,
  REPLIED_VOICE_BUBBLE_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from './chatScreen.shared';

type ChatRoute = RouteProp<ChatsStackParamList, 'Chat'>;
type ChatNavigation = NativeStackNavigationProp<ChatsStackParamList, 'Chat'>;
type MessageMenuActionKey = 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'select';

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
  key: MessageMenuActionKey;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  disabled: boolean;
};

export function ChatScreen() {
  const navigation = useNavigation<ChatNavigation>();
  const route = useRoute<ChatRoute>();
  const { chatId, focusMessageId, startSearch } = route.params;
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const { play, pause, stop, setPlaybackRate } = useVoicePlayerControls();
  const { currentVoiceUri, status: voiceStatus } = useVoicePlayerState();
  const listRef = useRef<FlatList<Message> | null>(null);
  const blurTargetRef = useRef<View | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const animatedKeyboard = useAnimatedKeyboard();
  const [inputBarHeight, setInputBarHeight] = useState(82);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardSourceMessageId, setForwardSourceMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const menuAnim = useRef(new Animated.Value(0)).current;
  const messageContentRefs = useRef<Record<string, View | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = messageStore(
    useCallback(
      (state) => state.messagesByChatId[chatId] ?? EMPTY_MESSAGES,
      [chatId]
    )
  );
  const chats = chatStore((state) => state.chats);

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

  useEffect(() => {
    const existing = messageStore.getState().messagesByChatId[chatId];
    if (!existing?.length) {
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

    target.measureInWindow((pageX, pageY, width, height) => {
      const previewLeft = Math.max(MENU_EDGE_GAP, Math.min(pageX, SCREEN_WIDTH - width - MENU_EDGE_GAP));
      const minPreviewTop = OVERLAY_TOP_INSET;
      const maxPreviewTop = SCREEN_HEIGHT - OVERLAY_BOTTOM_INSET - height;
      const anchoredTop = Math.max(minPreviewTop, Math.min(pageY, maxPreviewTop));
      const menuLeftBase = message.sender_id === currentUserId
        ? previewLeft + width - MENU_WIDTH
        : previewLeft;
      const menuLeft = Math.max(
        MENU_EDGE_GAP,
        Math.min(menuLeftBase, SCREEN_WIDTH - MENU_WIDTH - MENU_EDGE_GAP)
      );

      let previewTop = anchoredTop;
      let menuTop = previewTop + height + MENU_TO_MESSAGE_GAP;
      let placement: 'above' | 'below' = 'below';

      const bottomLimit = SCREEN_HEIGHT - MENU_EDGE_GAP;
      const overflowBottom = menuTop + MENU_HEIGHT - bottomLimit;

      if (overflowBottom > 0) {
        const liftedPreviewTop = Math.max(minPreviewTop, previewTop - overflowBottom);
        const liftedMenuTop = liftedPreviewTop + height + MENU_TO_MESSAGE_GAP;

        if (liftedMenuTop + MENU_HEIGHT <= bottomLimit) {
          previewTop = liftedPreviewTop;
          menuTop = liftedMenuTop;
        } else {
          placement = 'above';
          menuTop = Math.max(MENU_EDGE_GAP, previewTop - MENU_TO_MESSAGE_GAP - MENU_HEIGHT);
        }
      }

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
  }, [currentUserId]);

  const closeMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
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

  const handleDeleteMessage = useCallback((message: Message) => {
    closeMenu();
    if (message.sender_id !== currentUserId) {
      Alert.alert('Удаление недоступно', 'Сейчас можно удалить только свои сообщения.');
      return;
    }

    Alert.alert('Удалить сообщение?', 'Сообщение исчезнет из этого чата.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
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
        },
      },
    ]);
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
      setForwardSourceMessageId(message.id);
    }, 150);
  }, [closeMenu]);

  const handleForwardToChat = useCallback((targetChatId: string) => {
    const source = forwardSourceMessageId ? messageById.get(forwardSourceMessageId) ?? null : null;
    if (!source) {
      setForwardSourceMessageId(null);
      return;
    }

    const sent = TransportService.forwardMessage(targetChatId, source);
    setForwardSourceMessageId(null);

    if (!sent) {
      Alert.alert('Не удалось переслать', 'Этот тип сообщения пока нельзя переслать.');
      return;
    }

    const targetChat = chats.find((chat) => chat.id === targetChatId);
    Alert.alert(
      'Переслано',
      `Сообщение отправлено в чат «${targetChat?.peer_display_name || targetChat?.name || 'Чат'}».`
    );
  }, [chats, forwardSourceMessageId, messageById]);

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

  const handleInputBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== inputBarHeight) {
      setInputBarHeight(nextHeight);
    }
  }, [inputBarHeight]);

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
      const voiceContent = (
        <VoiceBubble
          uri={item.media[0].remote_url ?? `file://${item.id}`}
          waveform={item.media[0].waveform ?? []}
          durationMs={item.media[0].duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
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

    if (item.msg_type === 'image') {
      const media = item.media?.[0];
      const imageUri = media?.remote_url ?? '';
      if (!imageUri.trim()) return null;

      const replySnippet = renderReplySnippet();
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
      return (
        <View style={[styles.mediaStack, fixedWidthStyle]}>
          {renderReplySnippet()}
          <FileBubble
            fileName={item.media[0].file_name ?? 'File'}
            fileSize={item.media[0].file_size}
            uri={item.media[0].remote_url ?? undefined}
            isMe={isMe}
            caption={item.content ?? undefined}
            time={formatTime(item.created_at)}
            status={item.status}
          />
        </View>
      );
    }

    return null;
  }, [chatId, currentUserId, messageById]);

  const menuActions = useMemo<MenuAction[]>(() => {
    if (!activeMenuMessage) return [];

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
  }, [activeMenuMessage, pinnedMessageId]);

  return (
    <View style={styles.container}>
      <BlurTargetView ref={blurTargetRef} collapsable={false} style={styles.chatContentLayer}>
        <ChatBackgroundPattern />
        <ChatTopBanners
          selectionMode={selectionMode}
          selectedCount={selectedMessageIds.length}
          onClearSelection={() => setSelectedMessageIds([])}
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
          currentUserId={currentUserId}
          messages={messages}
          messageById={messageById}
          selectedMessageIdSet={selectedMessageIdSet}
          highlightedMessageId={highlightedMessageId}
          listRef={listRef}
          listAnimatedStyle={listWrapAnimatedStyle}
          contentPaddingTop={inputBarHeight + 8}
          canSwipeReply={canSwipeReply}
          onSwipeReply={handleSwipeReply}
          onMessagePress={handleMessagePress}
          onMessageLongPress={openMessageMenu}
          onReplyPreviewPress={selectionMode ? undefined : handleReplyPreviewPress}
          setContentRef={setMessageContentRef}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          formatTime={formatTime}
          getMessageAuthorName={getMessageAuthorName}
          getDeletedPlaceholder={getDeletedPlaceholder}
          repliedVoiceBubbleWidth={REPLIED_VOICE_BUBBLE_WIDTH}
        />

        <ChatInputDock
          onLayout={handleInputBarLayout}
          animatedStyle={[styles.inputBarWrap, inputBarAnimatedStyle]}
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendImage={handleSendImage}
          onSendFile={handleSendFile}
          replyToMessage={replyToMessage}
          replyAuthorName={replyAuthorName}
          onCancelReply={clearReplyState}
        />
      </BlurTargetView>

      <ChatContextMenuOverlay
        menuState={menuState}
        activeMenuMessage={activeMenuMessage}
        menuActions={menuActions}
        menuAnim={menuAnim}
        blurTargetRef={blurTargetRef}
        screenWidth={SCREEN_WIDTH}
        onClose={closeMenu}
        onMenuAction={(key) => {
          void handleMenuAction(key as MessageMenuActionKey);
        }}
        renderMenuPreviewBody={renderMenuPreviewBody}
      />

      <ChatForwardSheet
        visible={forwardSourceMessageId != null}
        chats={forwardTargets}
        onClose={() => setForwardSourceMessageId(null)}
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






