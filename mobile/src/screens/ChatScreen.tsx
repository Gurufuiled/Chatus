import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { BlurTargetView } from 'expo-blur';
import Feather from '@expo/vector-icons/Feather';
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
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedKeyboard,
  withTiming,
} from 'react-native-reanimated';
import type { ChatsStackParamList } from '../navigation/types';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import { useUnifiedMessages } from '../hooks/useUnifiedMessages';
import { usePrivateChatPeerPhone } from '../hooks/usePrivateChatPeerPhone';
import { MessageSource } from '../stores/types';

import { LineSyncEventDao } from '../db';
import { buildPendingLineSyncRowFromOutgoingMessage } from '../services/lineSyncEventBuilder';
import { canForwardMessage, TransportService } from '../services/TransportService';
import { LineSyncService, LINE_SYNC_GROUP_TAIL_LIMIT, LINE_SYNC_PRIVATE_TAIL_LIMIT } from '../services/LineSyncService';
import { markChatAsRead } from '../services/chatService';
import { SyncService } from '../services/SyncService';
import { WebSocketService } from '../services/WebSocketService';
import { uiStore } from '../stores/uiStore';
import {
  ChatContextMenuOverlay,
  ChatForwardSheet,
  ChatThemePickerModal,
  ChatInputDock,
  ChatMessageList,
  ChatMessagesSkeleton,
  ChatTopBanners,
  ChannelLinkRichMessage,
  FileBubble,
  ForwardHeader,
  ImageBubble,
  MessageTimeStatus,
  ReplyPreview,
  VideoBubble,
  VideoNoteBubble,
  VoiceBubble,
  buildReplyPreviewText,
  getReplyPreviewThumbnailUri,
} from '../components';
import {
  SendChannelSelector,
  type SendChannelAnchorRect,
} from '../components/SendChannelSelector';
import {
  stopActiveVideoNotePlayback,
  useVideoNotePlayer,
} from '../components/VideoNoteBubble';
import { InteractiveChatBackShell } from '../components/InteractiveChatBackShell';
import {
  ANDROID_CHAT_HEADER_TOOLBAR_HEIGHT,
  CustomAndroidChatHeader,
} from '../components/CustomAndroidChatHeader';
import { formatPresence, formatGroupSubtitle } from '../navigation/ChatsStack';

import {
  MeBubbleChrome,
  shouldUseDarkDefaultOutgoingBubbleGradient,
} from '../components/OutgoingBubbleViewportGradient';
import { StickerMessageBubble } from '../components/StickerMessageBubble';
import {
  encodeStickerPayload,
  isChatusStickerMessage,
  resolveChatusStickerSoloSendFlag,
  resolveStickerImageOrPlaceholder,
  soloChatusStickerDisplayDp,
} from '../stickers/chatusStickerCatalog';
import {
  getCompositeStickerRefs,
  getCompositeTextBody,
  tryParseCompositeMessage,
} from '../stickers/chatusCompositePayload';
import { getChatListRowIndexForMessageId, type ChatListRow } from '../presentation/chatStickerListRows';

const CHATUS_MENU_STICKER_PREVIEW_DP = soloChatusStickerDisplayDp({ maxDp: 140 });
import {
  useVoicePlayerControls,
  useVoicePlayerState,
} from '../contexts/VoicePlayerContext';
import type { Message } from '../stores/types';
import { useTheme } from '../contexts/ThemeContext';
import { withAlpha } from '../theme/colors';
import { buildChatScreenStyles, type ChatScreenStyleSet } from './chatScreen.styles';
import {
  DEFAULT_CHAT_THEME_ID,
  getChatTheme,
  getOutgoingReactionAccent,
  type ChatTheme,
  type ChatThemeId,
} from '../theme/chatThemes';
import { makeOptimisticTempMessageId } from '../utils/optimisticTempMessageId';
import {
  probeLocalVideoDimensionsWithRetry,
} from '../utils/probeLocalVideoDimensions';
import { getGroupLineSyncPeerUserId } from '../utils/groupLineSyncPeer';
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
  MENU_WIDTH,
  estimateMenuCardHeight,
  getPrivateChatPeerUserId,
  REPLIED_VOICE_BUBBLE_WIDTH,
  resolveForwardedSenderAvatarUrl,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from './chatScreen.shared';
import { formatMediaDuration, formatPlaybackElapsedDuration } from '../utils/mediaDuration';
import { parseChannelDeepLinkFromMessage } from '../utils/channelDeepLink';
import {
  useChatComposerDockPaddingBottom,
  useChatComposerKeyboardLiftStyles,
} from '../utils/chatComposerKeyboard';
import { bubbleRadius } from '../theme/stylePrimitives';
import { resolveAvatarUrl, resolveMediaUrl } from '../config';
import { resolveVoiceMessageUri } from '../utils/messageMediaUri';
import { hideOthersMessageOnlyOnDevice } from '../services/locallyHiddenMessages';
import { useGroupCall } from '../contexts/GroupCallContext';
import { GroupCallBanner } from '../components/group-call/GroupCallBanner';
import { GroupCallMinimizedBar } from '../components/group-call/GroupCallMinimizedBar';
import { formatGroupCallParticipantNames } from '../utils/groupCallSystemMessage';
import {
  PeerFirstAlbumImage,
  PeerFirstFileBubble,
  PeerFirstImageBubble,
  PeerFirstVideoBubble,
  PeerFirstVideoNoteBubble,
  PeerFirstVoiceBubble,
} from '../components/peerFirstMedia';

function warnLineSyncLocalInsert(reason: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.warn(`[LineSync] ${reason}`, detail);
  } else {
    console.warn(`[LineSync] ${reason}`);
  }
}

const SEND_CHANNEL_COACHMARK_KEY = 'ui.sendChannelCoachmarkDismissed.v1';

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

type VisualMediaItem = NonNullable<Message['media']>[number];

function getVisualMediaKind(message: Message, media: VisualMediaItem): 'image' | 'video' {
  const mediaType = media.media_type?.toLowerCase();
  if (mediaType === 'video') return 'video';
  if (mediaType === 'image') return 'image';
  return message.msg_type === 'video' ? 'video' : 'image';
}

function MediaAlbumBubble({
  message,
  isMe,
  time,
  status,
  msgStyles,
  chatTheme,
  viewportOutgoingGradient,
  scrollTick,
  incomingCaptionBg,
  incomingCaptionBorder,
  incomingCaptionText,
  incomingCaptionMeta,
}: {
  message: Message;
  isMe: boolean;
  time: string;
  status: string;
  msgStyles: ChatScreenStyleSet;
  chatTheme: ChatTheme;
  viewportOutgoingGradient: boolean;
  scrollTick: number;
  incomingCaptionBg?: string;
  incomingCaptionBorder?: string;
  incomingCaptionText?: string;
  incomingCaptionMeta?: string;
}) {
  const media = (message.media ?? [])
    .filter((item) => item.remote_url?.trim())
    .slice(0, 10);
  if (media.length === 0) return null;

  const visibleMedia = media.slice(0, 9);
  const albumWidth = Math.min(SCREEN_WIDTH * 0.72, 280);
  const gap = 1.5;
  const caption = message.content?.trim();

  const renderTile = (item: VisualMediaItem, index: number, style: object) => {
    const kind = getVisualMediaKind(message, item);
    const rawUri =
      kind === 'video' ? item.thumbnail_url || item.remote_url : item.remote_url;
    const extraCount = media.length - visibleMedia.length;
    const showExtra = index === visibleMedia.length - 1 && extraCount > 0;
    return (
      <View key={`${item.remote_url}-${index}`} style={[msgStyles.albumTile, style]}>
        <PeerFirstAlbumImage
          lineId={message.chat_id}
          rawUri={rawUri ?? ''}
          style={msgStyles.albumImage}
        />
        {kind === 'video' ? (
          <View style={msgStyles.albumVideoBadge}>
            <Feather name="play" size={10} color="#FFFFFF" />
            <Text style={msgStyles.albumVideoDuration}>
              {formatMediaDuration(item.duration_ms ?? 0)}
            </Text>
          </View>
        ) : null}
        {showExtra ? (
          <View style={msgStyles.albumExtraOverlay}>
            <Text style={msgStyles.albumExtraText}>+{extraCount}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const grid = (() => {
    if (visibleMedia.length === 1) {
      return renderTile(visibleMedia[0], 0, { width: albumWidth, height: albumWidth });
    }

    if (visibleMedia.length === 2) {
      const tileWidth = (albumWidth - gap) / 2;
      return (
        <View style={msgStyles.albumRow}>
          {visibleMedia.map((item, index) =>
            renderTile(item, index, { width: tileWidth, height: albumWidth })
          )}
        </View>
      );
    }

    if (visibleMedia.length === 3) {
      const sideWidth = (albumWidth - gap) * 0.58;
      const rightWidth = albumWidth - sideWidth - gap;
      const halfHeight = (albumWidth - gap) / 2;
      return (
        <View style={msgStyles.albumRow}>
          {renderTile(visibleMedia[0], 0, { width: sideWidth, height: albumWidth })}
          <View style={[msgStyles.albumColumn, { width: rightWidth }]}>
            {renderTile(visibleMedia[1], 1, { width: rightWidth, height: halfHeight })}
            {renderTile(visibleMedia[2], 2, { width: rightWidth, height: halfHeight })}
          </View>
        </View>
      );
    }

    if (visibleMedia.length === 4) {
      const tileW = (albumWidth - gap) / 2;
      const tileH = (albumWidth - gap) / 2;
      return (
        <View style={[msgStyles.albumColumn, { width: albumWidth }]}>
          <View style={msgStyles.albumRow}>
            {renderTile(visibleMedia[0], 0, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[1], 1, { width: tileW, height: tileH })}
          </View>
          <View style={msgStyles.albumRow}>
            {renderTile(visibleMedia[2], 2, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[3], 3, { width: tileW, height: tileH })}
          </View>
        </View>
      );
    }

    const columns = 3;
    const tileWidth = (albumWidth - gap * (columns - 1)) / columns;
    return (
      <View style={msgStyles.albumGrid}>
        {visibleMedia.map((item, index) =>
          renderTile(item, index, { width: tileWidth, height: tileWidth })
        )}
      </View>
    );
  })();

  const albumShell = (
    <>
      <View style={[msgStyles.albumGridClip, { width: albumWidth }]}>
        {grid}
        {!caption ? (
          <View style={msgStyles.albumTimeOverlay}>
            <MessageTimeStatus
              time={time}
              status={status}
              isMe={isMe}
              compact
              timeColor="#FFFFFF"
              iconColor="#FFFFFF"
            />
          </View>
        ) : null}
      </View>
      {caption ? (
        <View
          style={[
            msgStyles.albumCaptionWrap,
            isMe
              ? viewportOutgoingGradient
                ? [msgStyles.albumCaptionMe, { backgroundColor: 'transparent' }]
                : [msgStyles.albumCaptionMe, { backgroundColor: chatTheme.bubbleMe }]
              : [
                  msgStyles.albumCaptionOther,
                  incomingCaptionBg
                    ? {
                        backgroundColor: incomingCaptionBg,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: incomingCaptionBorder ?? 'transparent',
                      }
                    : null,
                ],
          ]}
        >
          <Text
            style={[
              msgStyles.albumCaptionText,
              isMe ? { color: chatTheme.bubbleMeText } : null,
              !isMe && incomingCaptionText ? { color: incomingCaptionText } : null,
            ]}
          >
            {caption}
          </Text>
          <MessageTimeStatus
            time={time}
            status={status}
            isMe={isMe}
            compact
            timeColor={isMe ? chatTheme.bubbleMeMeta : incomingCaptionMeta}
            iconColor={isMe ? chatTheme.bubbleMeMeta : incomingCaptionMeta}
          />
        </View>
      ) : null}
    </>
  );

  if (isMe && viewportOutgoingGradient) {
    return (
      <MeBubbleChrome
        active
        scrollTick={scrollTick}
        fillColor={chatTheme.bubbleMe}
        style={[msgStyles.albumBubble, msgStyles.albumBubbleMe]}
      >
        {albumShell}
      </MeBubbleChrome>
    );
  }

  return (
    <View style={[msgStyles.albumBubble, isMe ? msgStyles.albumBubbleMe : msgStyles.albumBubbleOther]}>
      {albumShell}
    </View>
  );
}

function buildForwardPreview(message: Message): string {
  switch (message.msg_type) {
    case 'text': {
      const raw = message.content?.trim();
      const composite = raw ? tryParseCompositeMessage(raw) : null;
      if (composite) {
        const t = getCompositeTextBody(composite).trim();
        const stickerCount = getCompositeStickerRefs(composite).length;
        if (t.length) {
          return stickerCount > 1 ? `${t} · ${stickerCount} стикеров` : `${t} · стикер`;
        }
        return stickerCount > 1 ? `${stickerCount} стикеров` : 'Стикер';
      }
      if (isChatusStickerMessage(message.content)) return 'Стикер';
      return message.content?.trim() || 'Сообщение';
    }
    case 'image':
      return message.content?.trim() || 'Фото';
    case 'video':
      return message.content?.trim() || 'Видео';
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
  const chatTitle = route.params.chatTitle ?? 'Чат';
  const { colors: themeColors, resolvedScheme } = useTheme();
  const styles = useMemo(() => buildChatScreenStyles(themeColors), [themeColors]);
  const authorOpts = useMemo(() => ({ accentColor: themeColors.accent }), [themeColors.accent]);
  const getMessageAuthorPresentationThemed = useCallback(
    (message: Message, cid: string, uid: string | null) =>
      getMessageAuthorPresentation(message, cid, uid, authorOpts),
    [authorOpts]
  );
  const getMessageAuthorNameThemed = useCallback(
    (message: Message, cid: string, uid: string | null) =>
      getMessageAuthorName(message, cid, uid, authorOpts),
    [authorOpts]
  );
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const { play, pause, stop, setPlaybackRate } = useVoicePlayerControls();
  const { currentVoiceUri, status: voiceStatus } = useVoicePlayerState();
  const activeVideoNote = useVideoNotePlayer();
  const insets = useSafeAreaInsets();
  const composerDockPaddingBottom = useChatComposerDockPaddingBottom(insets.bottom);
  const listRef = useRef<FlatList<ChatListRow> | null>(null);
  const blurTargetRef = useRef<View | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const { dockAnimatedStyle: inputBarAnimatedStyle, listWrapAnimatedStyle } =
    useChatComposerKeyboardLiftStyles(useAnimatedKeyboard());
  const [inputBarHeight, setInputBarHeight] = useState(82);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [selectionActionBarHeight, setSelectionActionBarHeight] = useState(104);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>('actions');
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardSourceMessageIds, setForwardSourceMessageIds] = useState<string[]>([]);
  const [forwardFromSelection, setForwardFromSelection] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const {
    state: groupCallState,
    activeRoomByChatId,
    refreshActiveRoom,
    startGroupCall,
    joinGroupCall,
    expand,
    isInCallForChat,
  } = useGroupCall();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActiveMatchIndex, setSearchActiveMatchIndex] = useState(0);
  const matchedMessageIdsRef = useRef<string[]>([]);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const menuAnim = useRef(new Animated.Value(0)).current;
  const messageContentRefs = useRef<Record<string, View | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentReadReceiptIdsRef = useRef<Set<string>>(new Set());
  /** One successful server tail merge per focus spell per chatId (avoid duplicate GET while staying on screen). */
  const privateServerTailFetchedRef = useRef<string | null>(null);
  /** One successful LINE_SUMMARY send to peer per focus spell per chatId. */
  const privatePeerSummarySentRef = useRef<string | null>(null);
  /** Bumped when LineSync bootstrap effect re-runs so stale async work skips ref updates. */
  const privateLineSyncGenRef = useRef(0);
  /** Bumped when group LineSync tail effect re-runs so stale async work skips ref updates. */
  const groupLineSyncGenRef = useRef(0);
  /** One successful server tail merge per focus spell per chatId — group chats (C2). */
  const groupServerTailFetchedRef = useRef<string | null>(null);
  /** One successful LINE_SUMMARY send to a group peer per focus spell per chatId (C3). */
  const groupPeerSummarySentRef = useRef<string | null>(null);

  const contactPhone = usePrivateChatPeerPhone(chatId);

  const {
    unifiedMessages,
    telegramAvailable,
    telegramSendReady,
    telegramBridgeResolving,
    hasPeerPhone,
    sendTelegramMessage,
    sendTelegramVideoNote,
  } = useUnifiedMessages(chatId, contactPhone);
  const messages = unifiedMessages as any;
  const [sendChannel, setSendChannel] = useState<MessageSource>('chatus');

  useEffect(() => {
    setSendChannel('chatus');
  }, [chatId]);
  const [sendChannelMenu, setSendChannelMenu] = useState<{
    visible: boolean;
    anchor: SendChannelAnchorRect | null;
  }>({ visible: false, anchor: null });
  const composerFocusRef = useRef<(() => void) | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const sendChannelCoachmarkCheckedRef = useRef(false);

  const requestCloseSendChannelMenu = useCallback(() => {
    setSendChannelMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const handleSendChannelMenuClosed = useCallback(() => {
    setSendChannelMenu({ visible: false, anchor: null });
    requestAnimationFrame(() => {
      composerFocusRef.current?.();
    });
  }, []);

  const handleSendChannelSelect = useCallback((channel: MessageSource) => {
    setSendChannel(channel);
    requestCloseSendChannelMenu();
  }, [requestCloseSendChannelMenu]);

  const trySendTelegramText = useCallback(
    (text: string) => {
      if (!sendTelegramMessage) return;
      if (!hasPeerPhone) {
        Alert.alert(
          'Telegram',
          'Не удалось определить номер контакта в Chatus. Попросите собеседника указать телефон в профиле или добавьте его номер в телефонную книгу и синхронизируйте контакты.',
        );
        return;
      }
      if (!telegramSendReady) {
        Alert.alert(
          'Telegram',
          telegramBridgeResolving
            ? 'Подключаем чат в Telegram… Подождите секунду и отправьте снова.'
            : 'Не удалось открыть чат в Telegram по этому номеру. Убедитесь, что номер совпадает с Telegram и у контакта разрешён поиск по номеру.',
        );
        return;
      }
      void sendTelegramMessage(text).catch(() => {
        Alert.alert('Telegram', 'Не удалось отправить сообщение.');
      });
    },
    [sendTelegramMessage, hasPeerPhone, telegramSendReady, telegramBridgeResolving],
  );

  const trySendTelegramVideoNote = useCallback(
    (result: { uri: string; durationMs: number; thumbnailUri?: string }) => {
      if (!sendTelegramVideoNote) return;
      if (!hasPeerPhone) {
        Alert.alert(
          'Telegram',
          'Не удалось определить номер контакта в Chatus. Попросите собеседника указать телефон в профиле или добавьте его номер в телефонную книгу и синхронизируйте контакты.',
        );
        return;
      }
      if (!telegramSendReady) {
        Alert.alert(
          'Telegram',
          telegramBridgeResolving
            ? 'Подключаем чат в Telegram… Подождите секунду и отправьте снова.'
            : 'Не удалось открыть чат в Telegram по этому номеру. Убедитесь, что номер совпадает с Telegram и у контакта разрешён поиск по номеру.',
        );
        return;
      }
      void sendTelegramVideoNote(result).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        Alert.alert('Не удалось отправить видеосообщение в Telegram', message);
      });
    },
    [sendTelegramVideoNote, hasPeerPhone, telegramSendReady, telegramBridgeResolving],
  );

  useEffect(() => {
    if (!telegramAvailable) {
      sendChannelCoachmarkCheckedRef.current = false;
      setShowTooltip(false);
      return;
    }
    if (sendChannelCoachmarkCheckedRef.current) return;
    sendChannelCoachmarkCheckedRef.current = true;
    let cancelled = false;
    void SecureStore.getItemAsync(SEND_CHANNEL_COACHMARK_KEY).then((raw) => {
      if (!cancelled && raw !== '1') {
        setShowTooltip(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [telegramAvailable]);

  const dismissTooltip = useCallback(() => {
    setShowTooltip(false);
    void SecureStore.setItemAsync(SEND_CHANNEL_COACHMARK_KEY, '1').catch(() => undefined);
  }, []);

  const chatusMessages = messageStore(
    useCallback(
      (state) => state.messagesByChatId[chatId] ?? EMPTY_MESSAGES,
      [chatId]
    )
  );
  const currentChat = chatStore(
    useCallback((state) => state.chats.find((c) => c.id === chatId) ?? null, [chatId])
  );
  const hadChatInStoreRef = React.useRef(false);
  React.useEffect(() => {
    if (currentChat) {
      hadChatInStoreRef.current = true;
    }
  }, [currentChat]);

  React.useEffect(() => {
    if (!hadChatInStoreRef.current) return;
    if (currentChat) return;
    hadChatInStoreRef.current = false;
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [currentChat, navigation]);
  const chatThemeId = uiStore((state) => state.chatThemeIdByChatId[chatId] ?? DEFAULT_CHAT_THEME_ID);
  
  const [isThemePickerVisible, setIsThemePickerVisible] = useState(false);
  const [draftThemeId, setDraftThemeId] = useState<ChatThemeId>(DEFAULT_CHAT_THEME_ID);

  useEffect(() => {
    if (route.params.openThemePicker) {
      setIsThemePickerVisible(true);
      setDraftThemeId(chatThemeId as ChatThemeId);
      navigation.setParams({ openThemePicker: undefined });
    }
  }, [route.params.openThemePicker, navigation, chatThemeId]);

  const activeThemeId = isThemePickerVisible ? draftThemeId : chatThemeId;
  const chatTheme = React.useMemo(
    () => getChatTheme(activeThemeId, resolvedScheme),
    [activeThemeId, resolvedScheme],
  );

  const handleApplyTheme = useCallback(() => {
    uiStore.getState().setChatTheme(chatId, draftThemeId);
    setIsThemePickerVisible(false);
  }, [chatId, draftThemeId]);


  const [initialLoadElapsed, setInitialLoadElapsed] = React.useState(
    () => messages.length > 0,
  );
  React.useEffect(() => {
    if (messages.length > 0) {
      setInitialLoadElapsed(true);
      return;
    }
    const timer = setTimeout(() => setInitialLoadElapsed(true), 1400);
    return () => clearTimeout(timer);
  }, [chatId, messages.length]);
  const showMessagesSkeleton = messages.length === 0 && !initialLoadElapsed;

  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of messages) {
      map.set(message.id, message);
    }
    return map;
  }, [messages]);

  const replyToMessage = replyToMessageId ? messageById.get(replyToMessageId) ?? null : null;
  const replyAuthorName = replyToMessage
    ? getMessageAuthorNameThemed(replyToMessage, chatId, currentUserId)
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
  const pinnedMessageId = currentChat?.pinned_message_id ?? null;
  const pinnedMessage = pinnedMessageId ? messageById.get(pinnedMessageId) ?? null : null;
  const forwardTargets = useMemo(
    () => forwardSourceMessageIds.length > 0
      ? chatStore.getState().chats.filter((chat) => chat.id !== chatId)
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, forwardSourceMessageIds.length > 0]
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
  matchedMessageIdsRef.current = matchedMessageIds;
  const searchMatchSignature = matchedMessageIds.join('|');
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
    ? getMessageAuthorNameThemed(activeVoiceMessage, chatId, currentUserId)
    : null;
  const activeVoiceProgress =
    voiceStatus.durationMs > 0 ? Math.min(voiceStatus.positionMs / voiceStatus.durationMs, 1) : 0;
  const activeVideoNoteMessage = useMemo(() => {
    if (activeVideoNote.messageId) {
      const directMatch = messageById.get(activeVideoNote.messageId);
      if (directMatch) {
        return directMatch;
      }
    }

    const activeVideoNoteUri = activeVideoNote.uri?.trim() ?? '';
    if (!activeVideoNoteUri) return null;

    return (
      messages.find((message) => {
        if (message.msg_type !== 'video_note') return false;
        const messageUri = message.media?.[0]?.remote_url?.trim() ?? '';
        return messageUri === activeVideoNoteUri;
      }) ?? null
    );
  }, [activeVideoNote.messageId, activeVideoNote.uri, messageById, messages]);
  const activeVideoNoteAuthor = activeVideoNoteMessage
    ? getMessageAuthorNameThemed(activeVideoNoteMessage, chatId, currentUserId)
    : null;
  const activeVideoNoteVisible = !!(activeVideoNote.messageId && activeVideoNote.uri);
  const activeVideoNoteDurationLabel = formatPlaybackElapsedDuration(
    activeVideoNote.positionMs,
    activeVideoNote.durationMs
  );
  const canDeleteSelectedMessages =
    selectedMessages.length > 0 &&
    selectedMessages.every((message) => message.is_deleted !== 1);
  const forwardableSelectedMessages = useMemo(
    () => selectedMessagesSorted.filter((message) => canForwardMessage(message)),
    [selectedMessagesSorted]
  );
  const canForwardSelectedMessages = forwardableSelectedMessages.length > 0;

  /** Stable signature when private chat `members` hydrate (peer id becomes available). */
  const privatePeerMembersSignature = useMemo(() => {
    if (currentChat?.chat_type !== 'private') return '';
    return (currentChat.members ?? [])
      .map((m) => m.user_id)
      .filter(Boolean)
      .sort()
      .join('|');
  }, [currentChat?.chat_type, currentChat?.members]);

  /** Stable signature when group chat `members` hydrate (peer choice for LineSync). */
  const groupPeerMembersSignature = useMemo(() => {
    if (currentChat?.chat_type !== 'group') return '';
    return (currentChat.members ?? [])
      .map((m) => m.user_id)
      .filter(Boolean)
      .sort()
      .join('|');
  }, [currentChat?.chat_type, currentChat?.members]);

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
      if (currentChat?.chat_type !== 'group') return;
      void refreshActiveRoom(chatId);
    }, [chatId, currentChat?.chat_type, refreshActiveRoom]),
  );

  const activeGroupCallRoom = activeRoomByChatId[chatId] ?? null;
  const isUserInGroupCall = isInCallForChat(chatId);
  const groupCallParticipantPreview = useMemo(
    () => formatGroupCallParticipantNames(groupCallState.participants),
    [groupCallState.participants],
  );

  const handleGroupVoicePress = useCallback(() => {
    if (activeGroupCallRoom && !isUserInGroupCall) {
      void joinGroupCall(activeGroupCallRoom.id, chatId, chatTitle);
      return;
    }
    if (isUserInGroupCall) {
      expand();
      return;
    }
    void startGroupCall(chatId, chatTitle);
  }, [
    activeGroupCallRoom,
    chatId,
    expand,
    isUserInGroupCall,
    joinGroupCall,
    chatTitle,
    startGroupCall,
  ]);

  const handleJoinActiveGroupCall = useCallback(() => {
    if (!activeGroupCallRoom) return;
    void joinGroupCall(activeGroupCallRoom.id, chatId, chatTitle);
  }, [activeGroupCallRoom, chatId, joinGroupCall, chatTitle]);

  useFocusEffect(
    useCallback(() => {
      chatStore.getState().setSelectedChat(chatId);
      chatStore.getState().clearUnread(chatId);
      void markChatAsRead(chatId).then((chat) => {
        if (chat) chatStore.getState().addOrUpdateChat(chat);
      });

      return () => {
        if (chatStore.getState().selectedChatId === chatId) {
          chatStore.getState().setSelectedChat(null);
        }
      };
    }, [chatId])
  );

  useEffect(() => {
    privateServerTailFetchedRef.current = null;
    privatePeerSummarySentRef.current = null;
    groupServerTailFetchedRef.current = null;
    groupPeerSummarySentRef.current = null;
  }, [chatId]);

  useEffect(() => {
    if (!isFocused) {
      privateServerTailFetchedRef.current = null;
      privatePeerSummarySentRef.current = null;
      groupServerTailFetchedRef.current = null;
      groupPeerSummarySentRef.current = null;
    }
  }, [isFocused]);

  /**
   * Private chat: merge server LineSync cache tail, then send LINE_SUMMARY to peer so missing events
   * can be requested/applied (handled in LineSyncService).
   */
  useEffect(() => {
    if (currentChat?.chat_type !== 'private') return;
    if (!chatId?.trim()) return;
    if (!isFocused) return;

    const gen = (privateLineSyncGenRef.current += 1);

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          if (privateServerTailFetchedRef.current !== chatId) {
            await LineSyncService.fetchServerTail(chatId, LINE_SYNC_PRIVATE_TAIL_LIMIT);
            if (gen !== privateLineSyncGenRef.current) return;
            privateServerTailFetchedRef.current = chatId;
          }
        } catch (err) {
          warnLineSyncLocalInsert('fetchServerTail', err);
        }

        if (gen !== privateLineSyncGenRef.current) return;
        if (privatePeerSummarySentRef.current === chatId) return;

        const uid = authStore.getState().user?.id ?? null;
        const chat = chatStore.getState().getChatById(chatId);
        const peerId = getPrivateChatPeerUserId(chat, uid);
        if (!peerId) return;

        const summary = await LineSyncService.sendSummaryToPeer(peerId, chatId);
        if (gen !== privateLineSyncGenRef.current) return;
        if (summary) {
          privatePeerSummarySentRef.current = chatId;
        }
      })();
    });

    return () => task.cancel();
  }, [chatId, currentChat?.chat_type, isFocused, currentUserId, privatePeerMembersSignature]);

  /**
   * Group chat: merge server LineSync cache tail, then LINE_SUMMARY to a chosen peer so
   * LINE_PATCH_REQUEST / LINE_PATCH can backfill older than the server window (C3).
   */
  useEffect(() => {
    if (currentChat?.chat_type !== 'group') return;
    if (!chatId?.trim()) return;
    if (!isFocused) return;

    const gen = (groupLineSyncGenRef.current += 1);

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          if (groupServerTailFetchedRef.current !== chatId) {
            await LineSyncService.fetchServerTail(chatId, LINE_SYNC_GROUP_TAIL_LIMIT);
            if (gen !== groupLineSyncGenRef.current) return;
            groupServerTailFetchedRef.current = chatId;
          }
        } catch (err) {
          warnLineSyncLocalInsert('fetchServerTail (group)', err);
        }

        if (gen !== groupLineSyncGenRef.current) return;

        const uid = authStore.getState().user?.id ?? null;
        const chat = chatStore.getState().getChatById(chatId);
        const peerId = getGroupLineSyncPeerUserId(chat, uid);
        if (!peerId) return;

        const summaryDedupeKey = `${chatId}|${peerId}`;
        if (groupPeerSummarySentRef.current === summaryDedupeKey) return;

        const summary = await LineSyncService.sendSummaryToPeer(
          peerId,
          chatId,
          LINE_SYNC_GROUP_TAIL_LIMIT,
        );
        if (gen !== groupLineSyncGenRef.current) return;
        if (summary) {
          groupPeerSummarySentRef.current = summaryDedupeKey;
        }
      })();
    });

    return () => task.cancel();
  }, [chatId, currentChat?.chat_type, isFocused, currentUserId, groupPeerMembersSignature]);

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

      if (message.status === 'read' || sentReadReceiptIdsRef.current.has(message.id)) {
        sentReadReceiptIdsRef.current.add(message.id);
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
    setSearchActiveMatchIndex(0);
    setHighlightedMessageId(null);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    Keyboard.dismiss();
  }, []);

  const handleToggleVoiceBannerPlayback = useCallback(() => {
    if (!currentVoiceUri) return;
    if (voiceStatus.isPlaying) {
      void pause();
      return;
    }
    stopActiveVideoNotePlayback();
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

  useEffect(() => {
    if (!isFocused) return;
    if (!WebSocketService.isConnected()) {
      WebSocketService.reconnect();
    }
  }, [isFocused]);

  const scrollToMessageId = useCallback(
    (
      messageId: string,
      missingMessageTitle?: string,
      options?: { persistHighlight?: boolean },
    ) => {
      const targetIndex = getChatListRowIndexForMessageId(messages, currentUserId, messageId);
      if (targetIndex < 0) {
        Alert.alert(
          missingMessageTitle ?? 'Сообщение не найдено',
          'Нужное сообщение пока не загружено в этот экран.',
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
    [messages, currentUserId],
  );

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
      scrollToMessageId(id, undefined, { persistHighlight: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [
    isSearchMode,
    normalizedSearchQuery,
    searchActiveMatchIndex,
    searchMatchSignature,
    scrollToMessageId,
  ]);

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
      const reactionGap = 4;
      const menuGap = 4;
      /** Основное меню (6 пунктов) и экран удаления — берём запас по большей высоте. */
      const menuCardHeight =
        Math.max(MENU_HEIGHT, estimateMenuCardHeight(2)) + 10;

      const bottomSafety = 28;
      const composerOffset = inputBarHeight + Math.max(composerDockPaddingBottom, 12);
      const effectiveBottom = SCREEN_HEIGHT - (composerOffset + bottomSafety);

      const previewWidth = Math.min(Math.ceil(width) + 1, SCREEN_WIDTH - MENU_EDGE_GAP * 2);
      const previewLeft = Math.max(
        MENU_EDGE_GAP,
        Math.min(pageX, SCREEN_WIDTH - previewWidth - MENU_EDGE_GAP),
      );

      const minPreviewTop = Math.max(
        insets.top + 12,
        MENU_EDGE_GAP + reactionBarHeight + reactionGap,
      );

      const spaceForPreview =
        effectiveBottom - minPreviewTop - menuGap - menuCardHeight;
      const previewDisplayHeight = Math.min(height, Math.max(0, spaceForPreview));

      const columnBelowPreview = previewDisplayHeight + menuGap + menuCardHeight;
      let previewTop = Math.min(pageY, effectiveBottom - columnBelowPreview);
      previewTop = Math.max(minPreviewTop, previewTop);

      if (previewTop + columnBelowPreview > effectiveBottom) {
        previewTop = Math.max(MENU_EDGE_GAP, effectiveBottom - columnBelowPreview);
      }

      const menuTop = previewTop + previewDisplayHeight + menuGap;

      const menuLeftBase =
        message.sender_id === currentUserId
          ? previewLeft + previewWidth - MENU_WIDTH
          : previewLeft;
      const menuLeft = Math.max(
        MENU_EDGE_GAP,
        Math.min(menuLeftBase, SCREEN_WIDTH - MENU_WIDTH - MENU_EDGE_GAP),
      );

      const placement: 'above' | 'below' = 'below';

      setMenuState({
        messageId: message.id,
        isMe: message.sender_id === currentUserId,
        previewTop,
        previewLeft,
        previewWidth,
        previewHeight: previewDisplayHeight,
        menuTop,
        menuLeft,
        placement,
      });
    });
  }, [composerDockPaddingBottom, currentUserId, insets.top, inputBarHeight]);

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
    (text: string, sendOptions?: { chatusStickerSoloSend?: boolean }) => {
      if (!currentUserId) return;
      const tempId = makeOptimisticTempMessageId();
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const stickerSoloEntrance = resolveChatusStickerSoloSendFlag(text, sendOptions);
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
        transport: 'websocket',
        server_id: null,
        created_at: now,
        updated_at: now,
        ...(stickerSoloEntrance ? { chatus_sticker_solo_send: true as const } : {}),
      };
      messageStore.getState().prependMessage(chatId, msg);
      void (async () => {
        try {
          const inserted = await new LineSyncEventDao().insert(
            buildPendingLineSyncRowFromOutgoingMessage(msg)
          );
          if (!inserted) {
            warnLineSyncLocalInsert('local event insert skipped (duplicate event_id)', msg.id);
          }
        } catch (err) {
          warnLineSyncLocalInsert('local event insert failed', err);
        } finally {
          void TransportService.sendMessage(chatId, text, 'text', tempId, activeReplyId);
        }
      })();
      setReplyToMessageId(null);
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendVoice = useCallback(
    async (result: { uri: string; waveform: number[]; durationMs: number }) => {
      if (!currentUserId) return;
      const tempId = makeOptimisticTempMessageId();
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
        transport: 'websocket',
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
      const probed = await probeLocalVideoDimensionsWithRetry(result.uri);
      if (!probed) {
        Alert.alert(
          'Не удалось отправить видеосообщение',
          'Не удалось определить размер видео. Запишите ещё раз.',
        );
        return;
      }
      const tempId = makeOptimisticTempMessageId();
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
        transport: 'websocket',
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

  const handleSendMedia = useCallback(
    async (result: {
      kind: 'image' | 'video';
      uri: string;
      previewUri?: string;
      width?: number;
      height?: number;
      durationMs?: number;
      fileName?: string;
      mimeType?: string;
      caption?: string;
    }) => {
      if (!currentUserId) return;
      const tempId = makeOptimisticTempMessageId();
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: result.kind === 'video' ? 'video' : 'image',
        content: result.caption ?? null,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'websocket',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: [
          {
            remote_url: result.uri,
            thumbnail_url: result.previewUri,
            width: result.width,
            height: result.height,
            duration_ms: result.durationMs,
            file_name: result.fileName,
          },
        ],
      };
      messageStore.getState().prependMessage(chatId, msg);
      setReplyToMessageId(null);
      if (result.kind === 'video') {
        await TransportService.sendVideoMessage(
          chatId,
          {
            uri: result.uri,
            width: result.width,
            height: result.height,
            durationMs: result.durationMs,
            thumbnailUri: result.previewUri,
            fileName: result.fileName,
            mimeType: result.mimeType,
            caption: result.caption,
          },
          tempId,
          activeReplyId
        );
      } else {
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
      }
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendMediaAlbum = useCallback(
    async (result: {
      items: {
        kind: 'image' | 'video';
        uri: string;
        previewUri?: string;
        width?: number;
        height?: number;
        durationMs?: number;
        fileName?: string;
        mimeType?: string;
      }[];
      caption?: string;
    }) => {
      if (!currentUserId) return;
      const items = result.items.slice(0, 10);
      if (items.length === 0) return;

      const tempId = makeOptimisticTempMessageId();
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: items[0]?.kind === 'video' ? 'video' : 'image',
        content: result.caption ?? null,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'websocket',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: items.map((item) => ({
          media_type: item.kind,
          remote_url: item.uri,
          thumbnail_url: item.previewUri,
          width: item.width,
          height: item.height,
          duration_ms: item.durationMs,
          file_name: item.fileName,
          mime_type: item.mimeType,
        })),
      };
      messageStore.getState().prependMessage(chatId, msg);
      setReplyToMessageId(null);
      await TransportService.sendMediaAlbumMessage(
        chatId,
        {
          items: items.map((item) => ({
            kind: item.kind,
            uri: item.uri,
            width: item.width,
            height: item.height,
            durationMs: item.durationMs,
            thumbnailUri: item.previewUri,
            fileName: item.fileName,
            mimeType: item.mimeType,
          })),
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
        makeOptimisticTempMessageId(),
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const confirmDeleteMessage = useCallback(
    (message: Message) => {
      closeMenu();
      if (message.sender_id === currentUserId) {
        messageStore.getState().updateMessage(chatId, message.id, {
          is_deleted: 1,
        });
        if (pinnedMessageId === message.id && currentChat) {
          chatStore.getState().updateChat({
            ...currentChat,
            pinned_message_id: null,
          });
        }
        TransportService.deleteMessage(chatId, message.id);
        return;
      }
      void hideOthersMessageOnlyOnDevice({
        chatId,
        message,
        currentChat,
        pinnedMessageId,
      });
    },
    [chatId, closeMenu, currentChat, currentUserId, pinnedMessageId]
  );

  const handleDeleteMessage = useCallback((message: Message) => {
    if (message.is_deleted === 1) {
      closeMenu();
      return;
    }
    setMenuMode('deleteConfirm');
  }, [closeMenu]);

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
          return getMessageAuthorNameThemed(message, chatId, currentUserId).trim();
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
        transport: 'websocket',
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
        const targetChat = chatStore.getState().getChatById(targetChatId);
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

    const targetChat = chatStore.getState().getChatById(targetChatId);
    Alert.alert(
      'Переслано',
      sentCount === 1
        ? `Сообщение отправлено в чат «${targetChat?.peer_display_name || targetChat?.name || 'Чат'}».`
        : `${sentCount} сообщений отправлено в чат «${targetChat?.peer_display_name || targetChat?.name || 'Чат'}».`
    );
  }, [chatId, currentChat?.chat_type, currentUserId, forwardFromSelection, forwardSourceMessageIds, messageById]);

  const handleForwardSheetClose = useCallback(() => {
    setForwardSourceMessageIds([]);
    setForwardFromSelection(false);
  }, []);

  const handleForwardHeaderPress = useCallback((message: Message) => {
    const sourceChatId = message.forwarded_from_chat_id ?? null;
    const sourceMessageId = message.forwarded_from_message_id ?? null;
    const sourceSenderId = message.forwarded_from_sender_id?.trim() || null;

    if (sourceChatId && sourceChatId === chatId && sourceMessageId) {
      scrollToMessageId(sourceMessageId, 'Исходное сообщение недоступно');
      return;
    }

    if (sourceSenderId) {
      navigation.navigate('ChatProfile', {
        chatId,
        userId: sourceSenderId,
        chatTitle: message.forwarded_from_name?.trim() || 'Профиль',
      });
      return;
    }

    if (!sourceChatId) {
      return;
    }

    const sourceChat = chatStore.getState().getChatById(sourceChatId) ?? null;
    const sourceChatTitle =
      sourceChat?.peer_display_name?.trim() ||
      sourceChat?.name?.trim() ||
      message.forwarded_from_name?.trim() ||
      'Чат';

    if (sourceChat) {
      navigation.navigate('Chat', {
        chatId: sourceChatId,
        chatTitle: sourceChatTitle,
        focusMessageId: sourceMessageId ?? undefined,
      });
    }
  }, [chatId, navigation, scrollToMessageId]);

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
      Alert.alert('Удаление недоступно', 'Среди выбранных нет сообщений, которые можно убрать.');
      return;
    }

    const count = selectedMessages.length;
    const allMine = selectedMessages.every((m) => m.sender_id === currentUserId);
    const onlyOthers = selectedMessages.every((m) => m.sender_id !== currentUserId);

    const description = (() => {
      if (allMine) {
        return count > 1
          ? `Будет удалено ${count} сообщений для всех участников чата.`
          : 'Сообщение будет удалено для всех участников чата.';
      }
      if (onlyOthers) {
        return count > 1
          ? 'Чужие сообщения будут скрыты только на этом устройстве.'
          : 'Сообщение будет скрыто только у вас на этом устройстве.';
      }
      return 'Ваши сообщения удалятся для всех; чужие — только скроются у вас.';
    })();

    Alert.alert(count > 1 ? 'Удалить выбранные сообщения?' : 'Удалить сообщение?', description, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            for (const message of selectedMessages) {
              const chatSnapshot = chatStore.getState().getChatById(chatId) ?? currentChat;
              const pinId = chatSnapshot?.pinned_message_id ?? null;
              if (message.sender_id === currentUserId) {
                messageStore.getState().updateMessage(chatId, message.id, {
                  is_deleted: 1,
                });
                if (pinId === message.id && chatSnapshot) {
                  chatStore.getState().updateChat({
                    ...chatSnapshot,
                    pinned_message_id: null,
                  });
                }
                TransportService.deleteMessage(chatId, message.id);
              } else {
                await hideOthersMessageOnlyOnDevice({
                  chatId,
                  message,
                  currentChat: chatSnapshot,
                  pinnedMessageId: pinId,
                });
              }
            }
            setSelectedMessageIds([]);
          })();
        },
      },
    ]);
  }, [canDeleteSelectedMessages, chatId, currentChat, currentUserId, selectedMessages]);

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

  const handleToggleReaction = useCallback((messageId: string, emoji: string) => {
    WebSocketService.sendEvent('toggle_reaction', {
      chat_id: chatId,
      message_id: messageId,
      emoji,
    });
  }, [chatId]);

  const handlePickReaction = useCallback(
    (emoji: string) => {
      if (!activeMenuMessage) return;
      handleToggleReaction(activeMenuMessage.id, emoji);
      closeMenu();
    },
    [activeMenuMessage, closeMenu, handleToggleReaction],
  );

  const allowReactions = currentChat?.allow_reactions !== 0;

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

  const canSwipeReply = useCallback((message: Message) => {
    if (selectionMode) return false;
    if (message.is_deleted === 1) return false;
    return (
      message.msg_type === 'text' ||
      message.msg_type === 'voice' ||
      message.msg_type === 'video_note' ||
      message.msg_type === 'image' ||
      message.msg_type === 'video'
    );
  }, [selectionMode]);

  const handleSwipeReply = useCallback((message: Message) => {
    setReplyToMessageId((current) => (current === message.id ? current : message.id));
  }, []);

  const renderMenuPreviewBody = useCallback((item: Message, forcedWidth?: number) => {
    const isMe = item.sender_id === currentUserId;
    const fixedWidthStyle = forcedWidth ? { width: forcedWidth, maxWidth: forcedWidth } : null;
    const menuPreviewScrollTick = 0;
    const usePreviewOutgoingGradient =
      isMe &&
      item.is_deleted !== 1 &&
      shouldUseDarkDefaultOutgoingBubbleGradient(chatTheme, resolvedScheme);
    const meBubbleFill = usePreviewOutgoingGradient ? '#00000000' : chatTheme.bubbleMe;

    const renderReplySnippet = (opts?: { nestedInMedia?: boolean }) => {
      if (!item.reply_to_id) return null;
      const replied = messageById.get(item.reply_to_id);
      const author = replied
        ? getMessageAuthorNameThemed(replied, chatId, currentUserId)
        : 'Исходное сообщение';
      const text = replied
        ? buildReplyPreviewText(replied)
        : 'Исходное сообщение недоступно';

      return (
        <ReplyPreview
          nestedInMedia={opts?.nestedInMedia}
          author={author}
          text={text}
          accentColor={isMe ? chatTheme.replyAccentMe : '#F28C28'}
          backgroundColor={
            isMe
              ? resolvedScheme === 'dark'
                ? 'rgba(255,255,255,0.14)'
                : chatTheme.replyBubbleMe
              : resolvedScheme === 'dark'
                ? 'rgba(255,255,255,0.08)'
                : '#F2F4D9'
          }
          textColor={
            isMe ? chatTheme.replyTextMe : resolvedScheme === 'dark' ? themeColors.textSecondary : '#5F6368'
          }
          authorColor={isMe ? chatTheme.replyAuthorMe : resolvedScheme === 'dark' ? themeColors.accent : '#D1782B'}
          thumbnailUri={getReplyPreviewThumbnailUri(replied)}
          peerFirstLineId={replied?.chat_id ?? chatId}
          searchHighlightQuery={isSearchMode ? normalizedSearchQuery : ''}
        />
      );
    };

    const renderForwardHeader = () => {
      if (!item.forwarded_from_name && !item.forwarded_from_message_id) {
        return null;
      }

      const rawAvatar = resolveForwardedSenderAvatarUrl(
        item.forwarded_from_sender_id,
        item.forwarded_from_chat_id
      );
      const avatarUri = resolveAvatarUrl(rawAvatar);

      return (
        <ForwardHeader
          isMe={isMe}
          name={item.forwarded_from_name}
          avatarUri={avatarUri ?? undefined}
          labelColor={isMe ? chatTheme.forwardHeaderMeSub : withAlpha(themeColors.accent, 0.72)}
          titleColor={isMe ? chatTheme.forwardHeaderMe : themeColors.accent}
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
            isMe ? { backgroundColor: chatTheme.deletedBubbleMe } : null,
          ]}
        >
          <Text style={[styles.deletedText, isMe && { color: chatTheme.deletedTextMe }]}>
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
      const compositeParsed = tryParseCompositeMessage(rawContent);
      if (compositeParsed) {
        const stickerRefs = getCompositeStickerRefs(compositeParsed);
        const textBody = getCompositeTextBody(compositeParsed);
        if (stickerRefs.length > 0) {
          const stickerMetaColor = isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary;
          const stickerIconColor = isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary;
          const thumbPx = 40;
          const compositeMenuBody = (
            <View style={styles.bubbleContentRow}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-end' }}>
                <Text
                  style={[
                    styles.textContent,
                    isMe ? styles.textContentMe : null,
                    isMe ? { color: chatTheme.bubbleMeText } : null,
                    { flexShrink: 1 },
                  ]}
                >
                  {textBody.trim() || ' '}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginLeft: 6 }}>
                  {stickerRefs.map((ref, idx) => (
                    <Image
                      key={`${ref.packId}:${ref.stickerId}:${idx}`}
                      source={resolveStickerImageOrPlaceholder(ref)}
                      style={{ width: thumbPx, height: thumbPx }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      accessibilityIgnoresInvertColors
                    />
                  ))}
                </View>
              </View>
              <MessageTimeStatus
                time={formatTime(item.created_at)}
                status={item.status}
                isMe={isMe}
                compact
                timeColor={stickerMetaColor}
                iconColor={stickerIconColor}
              />
            </View>
          );
          if (!isMe) {
            return (
              <View style={fixedWidthStyle}>
                {renderForwardHeader()}
                {renderReplySnippet()}
                <View style={[styles.bubble, styles.bubbleOther]}>{compositeMenuBody}</View>
              </View>
            );
          }
          return (
            <View style={fixedWidthStyle}>
              {renderForwardHeader()}
              {renderReplySnippet()}
              <MeBubbleChrome
                active={usePreviewOutgoingGradient}
                scrollTick={menuPreviewScrollTick}
                fillColor={chatTheme.bubbleMe}
                style={[styles.bubble, !usePreviewOutgoingGradient ? styles.bubbleMe : null]}
              >
                {compositeMenuBody}
              </MeBubbleChrome>
            </View>
          );
        }
      }

      const channelLink = parseChannelDeepLinkFromMessage(rawContent);

      if (channelLink) {
        return (
          <View style={fixedWidthStyle}>
            {renderForwardHeader()}
            {renderReplySnippet()}
            <ChannelLinkRichMessage
              parsed={channelLink}
              rawUrlLine={displayContent}
              isMe={isMe}
              time={formatTime(item.created_at)}
              status={item.status}
              navigation={navigation}
              chatTheme={chatTheme}
              useViewportOutgoingGradient={usePreviewOutgoingGradient}
              scrollTick={menuPreviewScrollTick}
            />
          </View>
        );
      }

      if (isChatusStickerMessage(rawContent)) {
        return (
          <View style={fixedWidthStyle}>
            <StickerMessageBubble
              rawContent={rawContent}
              isMe={isMe}
              time={formatTime(item.created_at)}
              status={item.status}
              timeColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
              iconColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
              topHeader={renderForwardHeader()}
              replySnippet={renderReplySnippet()}
              reactions={null}
              stickerSize={CHATUS_MENU_STICKER_PREVIEW_DP}
            />
          </View>
        );
      }

      return (
        isMe ? (
          <MeBubbleChrome
            active={usePreviewOutgoingGradient}
            scrollTick={menuPreviewScrollTick}
            fillColor={chatTheme.bubbleMe}
            style={[
              styles.bubble,
              fixedWidthStyle,
              !usePreviewOutgoingGradient ? styles.bubbleMe : null,
            ]}
          >
            {renderForwardHeader()}
            {renderReplySnippet()}
            <View style={styles.bubbleContentRow}>
              <Text style={[styles.textContent, styles.textContentMe, { color: chatTheme.bubbleMeText }]}>
                {displayContent}
              </Text>
              <MessageTimeStatus
                time={formatTime(item.created_at)}
                status={item.status}
                isMe={isMe}
                compact
                timeColor={chatTheme.bubbleMeMeta}
                iconColor={chatTheme.bubbleMeMeta}
              />
            </View>
          </MeBubbleChrome>
        ) : (
          <View style={[styles.bubble, fixedWidthStyle, styles.bubbleOther]}>
            {renderForwardHeader()}
            {renderReplySnippet()}
            <View style={styles.bubbleContentRow}>
              <Text style={[styles.textContent, isMe && styles.textContentMe]}>{displayContent}</Text>
              <MessageTimeStatus
                time={formatTime(item.created_at)}
                status={item.status}
                isMe={isMe}
                compact
              />
            </View>
          </View>
        )
      );
    }

    if (item.msg_type === 'voice' && item.media?.[0]) {
      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const forwardHeader = replySnippet ? null : renderForwardHeader();
      const voiceUri =
        resolveVoiceMessageUri(item) ?? item.media[0].remote_url ?? `file://${item.id}`;
      const voiceContent = (
        <PeerFirstVoiceBubble
          lineId={item.chat_id}
          serverUri={voiceUri}
          waveform={item.media[0].waveform ?? []}
          durationMs={item.media[0].duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={forwardHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingDurationColor={!isMe ? themeColors.textSecondary : undefined}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                styles.repliedVoiceBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
                fixedWidthStyle,
              ]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {voiceContent}
            </View>
          );
        }
        if (usePreviewOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[styles.repliedMediaBubble, styles.repliedVoiceBubble, bubbleRadius.mine, fixedWidthStyle]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {voiceContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              styles.repliedVoiceBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
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
          {isMe && usePreviewOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[{ alignSelf: 'flex-end' }, bubbleRadius.mine, { overflow: 'hidden' }]}
            >
              {voiceContent}
            </MeBubbleChrome>
          ) : (
            voiceContent
          )}
        </View>
      );
    }

    if (item.msg_type === 'video_note' && item.media?.[0]) {
      const media = item.media[0];
      const rawVideo = media.remote_url?.trim() ?? '';
      const videoUri =
        resolveVoiceMessageUri(item) ?? resolveMediaUrl(rawVideo || null) ?? rawVideo;
      if (!videoUri) return null;
      const thumbNote = media.thumbnail_url
        ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
        : undefined;

      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const forwardHeader = replySnippet ? null : renderForwardHeader();
      const videoContent = (
        <PeerFirstVideoNoteBubble
          lineId={item.chat_id}
          serverUri={videoUri}
          messageId={item.id}
          thumbnailUri={thumbNote}
          durationMs={media.duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={forwardHeader}
          registerPlaybackState={false}
          bubbleMeColor={meBubbleFill}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          viewportOutgoingGradient={!!isMe && usePreviewOutgoingGradient && !replySnippet}
          scrollTick={menuPreviewScrollTick}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
                fixedWidthStyle,
              ]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {videoContent}
            </View>
          );
        }
        if (usePreviewOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[styles.repliedMediaBubble, bubbleRadius.mine, { overflow: 'hidden' }, fixedWidthStyle]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {videoContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
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
          {isMe && usePreviewOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[{ alignSelf: 'flex-end' }, bubbleRadius.mine, { overflow: 'hidden' }]}
            >
              {videoContent}
            </MeBubbleChrome>
          ) : (
            videoContent
          )}
        </View>
      );
    }

    const visualMediaCount =
      item.msg_type === 'image' || item.msg_type === 'video'
        ? item.media?.filter((media) => media.remote_url?.trim()).length ?? 0
        : 0;

    if (visualMediaCount > 1) {
      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const albumContent = (
        <MediaAlbumBubble
          message={item}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          msgStyles={styles}
          chatTheme={chatTheme}
          viewportOutgoingGradient={usePreviewOutgoingGradient}
          scrollTick={menuPreviewScrollTick}
          incomingCaptionBg={!isMe ? themeColors.bubbleOther : undefined}
          incomingCaptionBorder={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingCaptionText={!isMe ? themeColors.textPrimary : undefined}
          incomingCaptionMeta={!isMe ? themeColors.textSecondary : undefined}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
                fixedWidthStyle,
              ]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {albumContent}
            </View>
          );
        }
        if (usePreviewOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[styles.repliedMediaBubble, bubbleRadius.mine, fixedWidthStyle]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {albumContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
              fixedWidthStyle,
            ]}
          >
            {renderForwardHeader()}
            {replySnippet}
            {albumContent}
          </View>
        );
      }

      return (
        <View style={[styles.mediaStack, fixedWidthStyle]}>
          {albumContent}
        </View>
      );
    }

    if (item.msg_type === 'image') {
      const media = item.media?.[0];
      const rawImage = media?.remote_url ?? '';
      const imageUri = resolveMediaUrl(rawImage.trim() || null) ?? rawImage;
      if (!imageUri.trim()) return null;

      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const forwardHeader = replySnippet ? null : renderForwardHeader();
      const imageContent = (
        <PeerFirstImageBubble
          lineId={item.chat_id}
          serverUri={imageUri}
          isMe={isMe}
          width={media?.width}
          height={media?.height}
          caption={item.content ?? undefined}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={forwardHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingCaptionTextColor={!isMe ? themeColors.textPrimary : undefined}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
                fixedWidthStyle,
              ]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {imageContent}
            </View>
          );
        }
        if (usePreviewOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[styles.repliedMediaBubble, bubbleRadius.mine, fixedWidthStyle]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {imageContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
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
          {isMe && usePreviewOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[{ alignSelf: 'flex-end' }, bubbleRadius.mine, { overflow: 'hidden' }]}
            >
              {imageContent}
            </MeBubbleChrome>
          ) : (
            imageContent
          )}
        </View>
      );
    }

    if (item.msg_type === 'video') {
      const media = item.media?.[0];
      const rawVideo = media?.remote_url ?? '';
      const videoUri = resolveMediaUrl(rawVideo.trim() || null) ?? rawVideo;
      if (!videoUri.trim()) return null;
      const thumbVideo = media?.thumbnail_url
        ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
        : undefined;

      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const forwardHeader = replySnippet ? null : renderForwardHeader();
      const videoContent = (
        <PeerFirstVideoBubble
          lineId={item.chat_id}
          serverUri={videoUri}
          thumbnailUri={thumbVideo}
          isMe={isMe}
          width={media?.width}
          height={media?.height}
          durationMs={media?.duration_ms ?? 0}
          caption={item.content ?? undefined}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={forwardHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingCaptionTextColor={!isMe ? themeColors.textPrimary : undefined}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
                fixedWidthStyle,
              ]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {videoContent}
            </View>
          );
        }
        if (usePreviewOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[styles.repliedMediaBubble, bubbleRadius.mine, fixedWidthStyle]}
            >
              {renderForwardHeader()}
              {replySnippet}
              {videoContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
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
          {isMe && usePreviewOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[{ alignSelf: 'flex-end' }, bubbleRadius.mine, { overflow: 'hidden' }]}
            >
              {videoContent}
            </MeBubbleChrome>
          ) : (
            videoContent
          )}
        </View>
      );
    }

    if (item.msg_type === 'file' && item.media?.[0]) {
      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const rawFile = item.media[0].remote_url ?? '';
      const fileUri =
        rawFile.trim().length > 0
          ? resolveMediaUrl(rawFile) ?? rawFile
          : undefined;
      const fileBubbleEl = (
        <PeerFirstFileBubble
          lineId={item.chat_id}
          serverUri={fileUri ?? ''}
          fileName={item.media[0].file_name ?? 'File'}
          fileSize={item.media[0].file_size}
          isMe={isMe}
          caption={item.content ?? undefined}
          time={formatTime(item.created_at)}
          status={item.status}
          header={renderForwardHeader()}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingFileNameColor={!isMe ? themeColors.textPrimary : undefined}
          incomingSecondaryTextColor={!isMe ? themeColors.textSecondary : undefined}
          incomingCaptionColor={!isMe ? themeColors.textPrimary : undefined}
        />
      );

      return (
        <View style={[styles.mediaStack, fixedWidthStyle]}>
          {replySnippet}
          {isMe && usePreviewOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={menuPreviewScrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[{ alignSelf: 'flex-end', maxWidth: '100%' }, bubbleRadius.mine, { overflow: 'hidden' }]}
            >
              {fileBubbleEl}
            </MeBubbleChrome>
          ) : (
            fileBubbleEl
          )}
        </View>
      );
    }

    return null;
  }, [
    chatId,
    chatTheme,
    currentUserId,
    handleForwardHeaderPress,
    isSearchMode,
    messageById,
    navigation,
    normalizedSearchQuery,
    resolvedScheme,
    styles,
    themeColors,
  ]);

  const menuActions = useMemo<MenuAction[]>(() => {
    if (!activeMenuMessage) return [];

    if (menuMode === 'deleteConfirm') {
      const isOwn = activeMenuMessage.sender_id === currentUserId;
      return [
        {
          key: 'delete_confirm',
          label: isOwn ? 'Удалить для всех' : 'Удалить у себя',
          icon: null,
          color: '#E53935',
          disabled: false,
          textOnly: true,
        },
        {
          key: 'delete_cancel',
          label: 'Отмена',
          icon: null,
          color: themeColors.textPrimary,
          disabled: false,
          textOnly: true,
        },
      ];
    }

    const isPinned = pinnedMessageId === activeMenuMessage.id;
    const canForward = canForwardMessage(activeMenuMessage);

    return [
      { key: 'reply', label: 'Ответить', icon: 'corner-left-up', color: themeColors.textPrimary, disabled: false },
      { key: 'copy', label: 'Скопировать', icon: 'copy', color: themeColors.textPrimary, disabled: false },
      { key: 'pin', label: isPinned ? 'Открепить' : 'Закрепить', icon: 'bookmark', color: themeColors.textPrimary, disabled: false },
      {
        key: 'forward',
        label: 'Переслать',
        icon: 'corner-up-right',
        color: canForward ? themeColors.textPrimary : themeColors.iconMuted,
        disabled: !canForward,
      },
      { key: 'delete', label: 'Удалить', icon: 'trash-2', color: '#E53935', disabled: false },
      { key: 'select', label: 'Выбрать', icon: 'check-circle', color: themeColors.textPrimary, disabled: false },
    ];
  }, [activeMenuMessage, currentUserId, menuMode, pinnedMessageId, themeColors]);


  const isGroupChat = currentChat?.chat_type === 'group';
  const peerId =
    currentChat?.chat_type === 'private'
      ? currentChat.members?.find((m) => m.user_id !== currentUserId)?.user_id ?? null
      : null;
  const peerMember = currentChat?.members?.find((m) => m.user_id === peerId);
  const presenceByUserId = uiStore((state) => state.presenceByUserId);
  const presence = peerId
    ? presenceByUserId[peerId] ?? {
        is_online: peerMember?.user?.is_online ?? false,
        last_seen: peerMember?.user?.last_seen ?? undefined,
      }
    : undefined;
  const title = route.params.chatTitle ?? 'Чат';
  const subtitle = isGroupChat
    ? formatGroupSubtitle(currentChat?.members?.length)
    : formatPresence(presence?.is_online, presence?.last_seen);
  const avatarUrl = resolveAvatarUrl(currentChat?.avatar_url);

  return (
    <View style={[styles.container, styles.chatRootTransparent]}>
      <InteractiveChatBackShell
        navigation={navigation}
        gestureEnabled={
          !selectionMode &&
          !menuState &&
          forwardSourceMessageIds.length === 0 &&
          !isThemePickerVisible &&
          !isSearchMode
        }
      >
        {Platform.OS === 'android' ? (
          <CustomAndroidChatHeader
            title={title}
            subtitle={subtitle}
            avatarUrl={avatarUrl}
            isGroupChat={isGroupChat}
            peerId={peerId}
            chatId={chatId}
            navigation={navigation}
            floating
            showGroupCallButton={isGroupChat}
            onGroupCallPress={isGroupChat ? handleGroupVoicePress : undefined}
            onSearchPress={() => setIsSearchMode(true)}
          />
        ) : null}

      <BlurTargetView
        ref={blurTargetRef}
        collapsable={false}
        style={[styles.chatContentLayer, { backgroundColor: chatTheme.canvasColor }]}
      >
        <ChatBackgroundPattern themeId={activeThemeId} />
        {Platform.OS === 'android' ? (
          <View style={{ height: insets.top + ANDROID_CHAT_HEADER_TOOLBAR_HEIGHT }} />
        ) : null}
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
          activeVideoNoteVisible={activeVideoNoteVisible}
          activeVideoNoteAuthor={activeVideoNoteAuthor}
          activeVideoNoteIsPlaying={activeVideoNote.isPlaying}
          activeVideoNoteProgress={activeVideoNote.progress}
          activeVideoNoteDurationLabel={activeVideoNoteDurationLabel}
          onToggleVideoNotePlayback={activeVideoNote.togglePlayback}
          onStopVideoNote={activeVideoNote.stopPlayback}
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

        {isGroupChat ? (
          <GroupCallBanner
            chatId={chatId}
            activeRoom={activeGroupCallRoom}
            isUserInCall={isUserInGroupCall}
            participantPreview={groupCallParticipantPreview}
            onJoin={handleJoinActiveGroupCall}
            onOpen={expand}
          />
        ) : null}

        {showMessagesSkeleton ? (
          <ChatMessagesSkeleton
            style={styles.messagesSkeletonOverlay}
            topPadding={inputBarHeight + 24}
          />
        ) : null}

        <ChatMessageList
          chatId={chatId}
          isGroupChat={currentChat?.chat_type === 'group'}
          currentUserId={currentUserId}
          messages={messages}
          selectionMode={selectionMode}
          selectedMessageIdSet={selectedMessageIdSet}
          highlightedMessageId={highlightedMessageId}
          searchHighlightQuery={isSearchMode ? normalizedSearchQuery : ''}
          listRef={listRef}
          listAnimatedStyle={listWrapAnimatedStyle}
          contentPaddingTop={(selectionMode ? selectionActionBarHeight : inputBarHeight) + 8}
          canSwipeReply={canSwipeReply}
          onSwipeReply={handleSwipeReply}
          allowReactions={allowReactions}
          onToggleReaction={handleToggleReaction}
          onMessagePress={handleMessagePress}
          onMessageLongPress={openMessageMenu}
          onForwardHeaderPress={selectionMode ? undefined : handleForwardHeaderPress}
          onReplyPreviewPress={selectionMode ? undefined : handleReplyPreviewPress}
          setContentRef={setMessageContentRef}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          formatTime={formatTime}
          getMessageAuthorPresentation={getMessageAuthorPresentationThemed}
          getMessageAuthorName={getMessageAuthorNameThemed}
          getDeletedPlaceholder={getDeletedPlaceholder}
          repliedVoiceBubbleWidth={REPLIED_VOICE_BUBBLE_WIDTH}
          chatTheme={chatTheme}
          activeVideoNoteVisible={activeVideoNoteVisible}
          scrollFabBottomOffset={
            (selectionMode ? selectionActionBarHeight : inputBarHeight) +
            composerDockPaddingBottom +
            12
          }
          enableScrollFab={!selectionMode && !isSearchMode && !isVoiceRecording}
          activeGroupCallRoomId={activeGroupCallRoom?.id ?? null}
          isUserInGroupCall={isUserInGroupCall}
          onJoinGroupCall={(roomId) => {
            void joinGroupCall(roomId, chatId, chatTitle);
          }}
        />

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
                { paddingBottom: composerDockPaddingBottom + 2 },
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
                    color={canForwardSelectedMessages ? themeColors.accent : '#A0A9B8'}
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
            animatedStyle={[
              styles.inputBarWrap,
              inputBarAnimatedStyle,
              { paddingBottom: composerDockPaddingBottom },
            ]}
            onSendText={(text) => {
              if (sendChannel === 'telegram') {
                trySendTelegramText(text);
              } else {
                handleSendText(text);
              }
            }}
            onSendVoice={(res) => {
              if (sendChannel === 'telegram') {
                Alert.alert("Telegram", "Отправка голосовых в Telegram пока в разработке.");
              } else {
                handleSendVoice(res);
              }
            }}
            onSendVideoNote={(res) => {
              if (sendChannel === 'telegram') {
                trySendTelegramVideoNote(res);
              } else {
                handleSendVideoNote(res);
              }
            }}
            onSendMedia={(res) => {
              if (sendChannel === 'telegram') {
                Alert.alert("Telegram", "Отправка медиа в Telegram пока в разработке.");
              } else {
                handleSendMedia(res);
              }
            }}
            onSendMediaAlbum={(res) => {
              if (sendChannel === 'telegram') {
                Alert.alert("Telegram", "Отправка альбомов в Telegram пока в разработке.");
              } else {
                handleSendMediaAlbum(res);
              }
            }}
            onSendFile={(res) => {
              if (sendChannel === 'telegram') {
                Alert.alert("Telegram", "Отправка файлов в Telegram пока в разработке.");
              } else {
                handleSendFile(res);
              }
            }}
            blurTargetRef={blurTargetRef}
            replyToMessage={replyToMessage}
            replyAuthorName={replyAuthorName}
            onCancelReply={clearReplyState}
            isScreenFocused={isFocused}
            replyPeerFirstLineId={replyToMessage?.chat_id ?? chatId}
            chatusStickersComposer
            onVoiceActiveChange={setIsVoiceRecording}
            telegramAvailable={telegramAvailable}
            sendChannel={sendChannel}
            onSendChannelChange={setSendChannel}
            onSendChannelMenuOpen={(anchor) => {
              setSendChannelMenu({ visible: true, anchor });
            }}
            onSendChannelMenuDismiss={requestCloseSendChannelMenu}
            composerFocusRef={composerFocusRef}
          />
        )}
        {isGroupChat ? (
          <GroupCallMinimizedBar
            bottomOffset={
              (selectionMode ? selectionActionBarHeight : inputBarHeight) + composerDockPaddingBottom
            }
          />
        ) : null}
      </BlurTargetView>
      </InteractiveChatBackShell>

      {sendChannelMenu.anchor ? (
        <SendChannelSelector
          visible={sendChannelMenu.visible}
          anchor={sendChannelMenu.anchor}
          currentChannel={sendChannel}
          telegramAvailable={telegramAvailable}
          onSelect={handleSendChannelSelect}
          onDismiss={requestCloseSendChannelMenu}
          onClosed={handleSendChannelMenuClosed}
        />
      ) : null}

      <ChatContextMenuOverlay
        menuState={menuState}
        activeMenuMessage={activeMenuMessage}
        menuActions={menuActions}
        menuAnim={menuAnim}
        blurTargetRef={blurTargetRef}
        screenWidth={SCREEN_WIDTH}
        onClose={closeMenu}
        showReactions={
          menuMode === 'actions' &&
          !(
            activeMenuMessage?.msg_type === 'text' &&
            activeMenuMessage?.is_deleted !== 1 &&
            isChatusStickerMessage(activeMenuMessage?.content)
          )
        }
        menuCardWidth={menuMode === 'deleteConfirm' ? 224 : undefined}
        onPickReaction={handlePickReaction}
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

      <ChatThemePickerModal
        visible={isThemePickerVisible}
        selectedThemeId={draftThemeId}
        onSelectTheme={setDraftThemeId}
        onApply={handleApplyTheme}
        onClose={() => setIsThemePickerVisible(false)}
      />

      {telegramAvailable && showTooltip ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: inputBarHeight + 10,
            zIndex: 100,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              maxWidth: 340,
              width: '100%',
              backgroundColor: 'rgba(28, 32, 38, 0.94)',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              shadowColor: '#000',
              shadowOpacity: 0.22,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 10,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}>
              Удерживайте кнопку отправки (или медиа), чтобы сменить канал
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Понятно"
              onPress={dismissTooltip}
              hitSlop={8}
              style={({ pressed }) => ({ marginTop: 10, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: '#5EB3F6', fontSize: 15, fontWeight: '600' }}>Понятно</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

    </View>
  );
}




