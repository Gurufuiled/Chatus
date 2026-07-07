import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Animated,
  Dimensions,
  FlatList,
  FlatListProps,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Reanimated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Message } from '../stores/types';
import { bubbleRadius, colors, withAlpha } from '../theme/colors';
import { getOutgoingReactionAccent, type ChatTheme } from '../theme/chatThemes';
import { ForwardHeader } from './ForwardHeader';
import { MessageTimeStatus } from './MessageTimeStatus';
import { MessageTextBubbleBody } from './MessageTextBubbleBody';
import {
  ReplyPreview,
  buildReplyPreviewText,
  getReplyPreviewThumbnailUri,
} from './ReplyPreview';
import {
  PeerFirstAlbumImage,
  PeerFirstFileBubble,
  PeerFirstImageBubble,
  PeerFirstVideoBubble,
  PeerFirstVideoNoteBubble,
  PeerFirstVoiceBubble,
} from './peerFirstMedia';
import { MessageReactionInline } from './MessageReactionInline';
import { resolveAvatarUrl, resolveMediaUrl } from '../config';
import { resolveVoiceMessageUri } from '../utils/messageMediaUri';
import {
  type MessageAuthorPresentation,
  resolveForwardedSenderAvatarUrl,
} from '../screens/chatScreen.shared';
import { CHAT_BUBBLE_MAX_WIDTH_PCT } from '../presentation/chatBubbleMetrics';
import { DOUBLE_TAP_REACTION_EMOJI } from './ChatContextMenuOverlay';
import { ReplySwipeWrapper } from './ReplySwipeWrapper';
import { formatMediaDuration } from '../utils/mediaDuration';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { ChannelLinkRichMessage } from './ChannelLinkRichMessage';
import { parseChannelDeepLinkFromMessage } from '../utils/channelDeepLink';
import { renderTextWithSearchHighlight } from '../utils/searchHighlightText';
import { useTheme } from '../contexts/ThemeContext';
import type { ResolvedColorScheme } from '../theme/palettes';
import {
  MeBubbleChrome,
  shouldUseDarkDefaultOutgoingBubbleGradient,
} from './OutgoingBubbleViewportGradient';
import { CHAT_MSG_GROUP_TIME_GAP_MS } from '../presentation/telegramChatUi';
import { ChatDaySeparator } from './ChatDaySeparator';
import { ChatScrollToBottomButton } from './ChatScrollToBottomButton';
import { useInvertedChatScrollFab } from '../hooks/useInvertedChatScrollFab';
import {
  formatChatDayLabel,
  getChatDayKey,
  isValidChatTimestamp,
} from '../utils/formatChatDayLabel';
import {
  buildStickerGroupedChatRows,
  type ChatListRow,
} from '../presentation/chatStickerListRows';
import { StickerGroupMessageBubble } from './StickerGroupMessageBubble';
import { StickerMessageBubble } from './StickerMessageBubble';
import {
  encodeStickerPayload,
  isChatusStickerMessage,
  resolveStickerImageOrPlaceholder,
  soloChatusStickerDisplayDp,
} from '../stickers/chatusStickerCatalog';
import {
  getCompositeStickerRefs,
  getCompositeTextBody,
  tryParseCompositeMessage,
} from '../stickers/chatusCompositePayload';
import { GroupCallSystemMessage } from './group-call/GroupCallSystemMessage';
import { parseGroupCallSystemContent } from '../utils/groupCallSystemMessage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Same threshold as ChatProfileMediaViewerModal — vertical swipe closes the viewer. */
const ALBUM_VIEWER_CLOSE_SWIPE_DISTANCE = 84;
const FILE_ROW_WIDTH = Math.min(Dimensions.get('window').width * 0.76, 320);
const ALBUM_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 280);
/** Текст + стикер в одном пузыре — размер эмблемы рядом с текстом. */
const COMPOSITE_INLINE_STICKER_PX = 40;

type ChatMessageListProps = {
  chatId: string;
  isGroupChat: boolean;
  currentUserId: string | null;
  messages: Message[];
  selectionMode: boolean;
  selectedMessageIdSet: Set<string>;
  highlightedMessageId: string | null;
  /** Lowercase trimmed; empty = no in-bubble search highlights. */
  searchHighlightQuery: string;
  listRef: React.RefObject<FlatList<ChatListRow> | null>;
  listAnimatedStyle: React.ComponentProps<typeof Reanimated.View>['style'];
  contentPaddingTop: number;
  canSwipeReply: (message: Message) => boolean;
  onSwipeReply: (message: Message) => void;
  allowReactions: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onMessagePress: (messageId: string) => void;
  onMessageLongPress: (message: Message) => void;
  onForwardHeaderPress?: (message: Message) => void;
  onReplyPreviewPress?: (messageId: string) => void;
  setContentRef: (messageId: string, node: View | null) => void;
  onScrollToIndexFailed?: FlatListProps<ChatListRow>['onScrollToIndexFailed'];
  formatTime: (timestamp: number) => string;
  getMessageAuthorPresentation: (
    message: Message,
    chatId: string,
    currentUserId: string | null
  ) => MessageAuthorPresentation;
  getMessageAuthorName: (message: Message, chatId: string, currentUserId: string | null) => string;
  getDeletedPlaceholder: (isMe: boolean) => string;
  repliedVoiceBubbleWidth: number;
  chatTheme: ChatTheme;
  activeVideoNoteVisible: boolean;
  scrollFabBottomOffset: number;
  enableScrollFab?: boolean;
  activeGroupCallRoomId?: string | null;
  isUserInGroupCall?: boolean;
  onJoinGroupCall?: (roomId: string) => void;
};

function getChatListRowDateMs(row: ChatListRow): number {
  if ('kind' in row && row.kind === 'sticker_group') {
    return row.messages[0]!.created_at;
  }
  return (row as Message).created_at;
}

type VisualMediaItem = NonNullable<Message['media']>[number];
type AlbumViewerState = {
  media: VisualMediaItem[];
  initialIndex: number;
} | null;

function getVisualMediaKind(message: Message, media: VisualMediaItem): 'image' | 'video' {
  const mediaType = media.media_type?.toLowerCase();
  if (mediaType === 'video') return 'video';
  if (mediaType === 'image') return 'image';
  return message.msg_type === 'video' ? 'video' : 'image';
}

function MediaAlbumBubble({
  message,
  lineId,
  isMe,
  time,
  status,
  chatTheme,
  onOpenMedia,
  inlineReactions,
  allowMessageReactions,
  onToggleInlineReaction,
  viewportOutgoingGradient,
  scrollTick,
  incomingCaptionBg,
  incomingCaptionBorder,
  incomingCaptionText,
  incomingCaptionMeta,
}: {
  message: Message;
  lineId: string;
  isMe: boolean;
  time: string;
  status: string;
  chatTheme: ChatTheme;
  onOpenMedia?: (media: VisualMediaItem[], index: number) => void;
  inlineReactions?: NonNullable<Message['reactions']>;
  allowMessageReactions?: boolean;
  onToggleInlineReaction?: (emoji: string) => void;
  viewportOutgoingGradient: boolean;
  scrollTick: number;
  /** Цвета входящего бабла из темы приложения (тёмная тема). */
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
  const gap = 1.5;
  const caption = message.content?.trim();

  const renderTile = (item: VisualMediaItem, index: number, style: object) => {
    const kind = getVisualMediaKind(message, item);
    const rawUri =
      kind === 'video' ? item.thumbnail_url || item.remote_url : item.remote_url;
    const extraCount = media.length - visibleMedia.length;
    const showExtra = index === visibleMedia.length - 1 && extraCount > 0;

    return (
      <Pressable
        key={`${item.remote_url}-${index}`}
        accessibilityRole="button"
        accessibilityLabel="Открыть медиа"
        onPress={() => onOpenMedia?.(media, index)}
        style={[styles.albumTile, style]}
      >
        <PeerFirstAlbumImage
          lineId={lineId}
          rawUri={rawUri?.trim() ?? ''}
          style={styles.albumImage}
        />
        {kind === 'video' ? (
          <View style={styles.albumVideoBadge}>
            <Feather name="play" size={10} color="#FFFFFF" />
            <Text style={styles.albumVideoDuration}>
              {formatMediaDuration(item.duration_ms ?? 0)}
            </Text>
          </View>
        ) : null}
        {showExtra ? (
          <View style={styles.albumExtraOverlay}>
            <Text style={styles.albumExtraText}>+{extraCount}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const grid = (() => {
    if (visibleMedia.length === 1) {
      return renderTile(visibleMedia[0], 0, {
        width: ALBUM_BUBBLE_WIDTH,
        height: ALBUM_BUBBLE_WIDTH,
      });
    }

    if (visibleMedia.length === 2) {
      const tileWidth = (ALBUM_BUBBLE_WIDTH - gap) / 2;
      return (
        <View style={styles.albumRow}>
          {visibleMedia.map((item, index) =>
            renderTile(item, index, { width: tileWidth, height: ALBUM_BUBBLE_WIDTH })
          )}
        </View>
      );
    }

    if (visibleMedia.length === 3) {
      const sideWidth = (ALBUM_BUBBLE_WIDTH - gap) * 0.58;
      const rightWidth = ALBUM_BUBBLE_WIDTH - sideWidth - gap;
      const halfHeight = (ALBUM_BUBBLE_WIDTH - gap) / 2;
      return (
        <View style={styles.albumRow}>
          {renderTile(visibleMedia[0], 0, { width: sideWidth, height: ALBUM_BUBBLE_WIDTH })}
          <View style={[styles.albumColumn, { width: rightWidth }]}>
            {renderTile(visibleMedia[1], 1, { width: rightWidth, height: halfHeight })}
            {renderTile(visibleMedia[2], 2, { width: rightWidth, height: halfHeight })}
          </View>
        </View>
      );
    }

    if (visibleMedia.length === 4) {
      const tileW = (ALBUM_BUBBLE_WIDTH - gap) / 2;
      const tileH = (ALBUM_BUBBLE_WIDTH - gap) / 2;
      return (
        <View style={[styles.albumColumn, { width: ALBUM_BUBBLE_WIDTH }]}>
          <View style={styles.albumRow}>
            {renderTile(visibleMedia[0], 0, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[1], 1, { width: tileW, height: tileH })}
          </View>
          <View style={styles.albumRow}>
            {renderTile(visibleMedia[2], 2, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[3], 3, { width: tileW, height: tileH })}
          </View>
        </View>
      );
    }

    const columns = 3;
    const tileWidth = (ALBUM_BUBBLE_WIDTH - gap * (columns - 1)) / columns;
    return (
      <View style={styles.albumGrid}>
        {visibleMedia.map((item, index) =>
          renderTile(item, index, { width: tileWidth, height: tileWidth })
        )}
      </View>
    );
  })();

  const albumShell = (
    <>
      <View style={[styles.albumGridClip, { width: ALBUM_BUBBLE_WIDTH }]}>
        {grid}
        {!caption ? (
          <View style={styles.albumTimeOverlay}>
            <MessageTimeStatus
              time={time}
              status={status}
              isMe={isMe}
              compact
              timeColor="#FFFFFF"
              iconColor="#FFFFFF"
              source={message.source}
            />
          </View>
        ) : null}
      </View>
      {caption ? (
        <View
          style={[
            styles.albumCaptionWrap,
            isMe
              ? viewportOutgoingGradient
                ? [styles.albumCaptionMe, { backgroundColor: 'transparent' }]
                : [styles.albumCaptionMe, { backgroundColor: chatTheme.bubbleMe }]
              : [
                  styles.albumCaptionOther,
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
              styles.albumCaptionText,
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
            source={message.source}
          />
        </View>
      ) : null}

      {inlineReactions?.length ? (
        <MessageReactionInline
          reactions={inlineReactions}
          isMe={isMe}
          allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
          onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
          accentColor={chatTheme.bubbleMeAccent}
        />
      ) : null}
    </>
  );

  if (isMe && viewportOutgoingGradient) {
    return (
      <MeBubbleChrome
        active
        scrollTick={scrollTick}
        fillColor={chatTheme.bubbleMe}
        style={[styles.albumBubble, styles.albumBubbleMe]}
      >
        {albumShell}
      </MeBubbleChrome>
    );
  }

  return (
    <View style={[styles.albumBubble, isMe ? styles.albumBubbleMe : styles.albumBubbleOther]}>
      {albumShell}
    </View>
  );
}

function AlbumMediaViewerModal({
  state,
  onClose,
}: {
  state: AlbumViewerState;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = React.useState(state?.initialIndex ?? 0);
  const listRef = React.useRef<FlatList<VisualMediaItem> | null>(null);
  const translateY = React.useRef(new Animated.Value(0)).current;
  const media = state?.media ?? [];

  const resetPosition = React.useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const closeFromSwipe = React.useCallback(
    (direction: number) => {
      Animated.timing(translateY, {
        toValue: direction >= 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT,
        duration: 140,
        useNativeDriver: true,
      }).start(onClose);
    },
    [onClose, translateY]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.04,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.04,
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dy) > ALBUM_VIEWER_CLOSE_SWIPE_DISTANCE || Math.abs(gesture.vy) > 0.92) {
            closeFromSwipe(gesture.dy || gesture.vy);
            return;
          }
          resetPosition();
        },
        onPanResponderTerminate: resetPosition,
        onPanResponderTerminationRequest: () => true,
      }),
    [closeFromSwipe, resetPosition, translateY]
  );

  React.useEffect(() => {
    setActiveIndex(state?.initialIndex ?? 0);
    translateY.setValue(0);
    if (!state?.media?.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: state.initialIndex,
        animated: false,
      });
    });
  }, [state, translateY]);


  // ⚡ Bolt: Extracted inline FlatList callbacks (keyExtractor, getItemLayout, renderItem) to useCallback to prevent unnecessary re-renders
  const keyExtractor = React.useCallback((item: VisualMediaItem, index: number) => {
    return `${item.remote_url ?? item.thumbnail_url ?? 'media'}-${index}`;
  }, []);

  const getItemLayout = React.useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  const renderMediaItem = React.useCallback(({ item }: { item: VisualMediaItem }) => {
    const raw = item.remote_url?.trim() || item.thumbnail_url?.trim() || '';
    const uri = resolveMediaUrl(raw || null) ?? raw;
    return (
      <Pressable
        style={styles.viewerSlide}
        android_disableSound
        {...panResponder.panHandlers}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.viewerImage} contentFit="contain" cachePolicy="disk" />
        ) : null}
      </Pressable>
    );
  }, [panResponder.panHandlers]);

  return (
    <Modal
      visible={state != null}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.viewerRoot}>
        <View style={[styles.viewerTopBarAbsolute, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть просмотр"
            onPress={onClose}
            hitSlop={12}
            style={styles.viewerCloseButton}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          {media.length > 1 ? (
            <Text style={styles.viewerCounter}>
              {activeIndex + 1} / {media.length}
            </Text>
          ) : null}
          <View style={styles.viewerTopSpacer} />
        </View>

        <Animated.View
          style={[styles.viewerSwipeable, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <FlatList
            ref={listRef}
            style={styles.viewerFlatList}
            data={media}
            keyExtractor={keyExtractor}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={state?.initialIndex ?? 0}
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActiveIndex(Math.max(0, Math.min(media.length - 1, nextIndex)));
            }}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                listRef.current?.scrollToOffset({
                  offset: SCREEN_WIDTH * index,
                  animated: false,
                });
              });
            }}
            renderItem={renderMediaItem}
          />

          <View style={[styles.viewerBottomBar, { paddingBottom: insets.bottom + 18 }]} />
        </Animated.View>
      </View>
    </Modal>
  );
}

type MessageRowProps = {
  item: Message;
  chatId: string;
  isGroupChat: boolean;
  currentUserId: string | null;
  repliedMessage: Message | null;
  selectionMode: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  canSwipe: boolean;
  onReply: () => void;
  allowReactions: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onPressMessage: (messageId: string) => void;
  onLongPressMessage: (message: Message) => void;
  onOpenAlbumMedia: (media: VisualMediaItem[], index: number) => void;
  onForwardHeaderPress?: (message: Message) => void;
  onReplyPreviewPress?: (messageId: string) => void;
  setContentRef: (messageId: string, node: View | null) => void;
  formatTime: (timestamp: number) => string;
  getMessageAuthorPresentation: (
    message: Message,
    chatId: string,
    currentUserId: string | null
  ) => MessageAuthorPresentation;
  getMessageAuthorName: (message: Message, chatId: string, currentUserId: string | null) => string;
  getDeletedPlaceholder: (isMe: boolean) => string;
  repliedVoiceBubbleWidth: number;
  chatTheme: ChatTheme;
  navigation: NativeStackNavigationProp<ChatsStackParamList>;
  resolvedScheme: ResolvedColorScheme;
  scrollTick: number;
  /** Lowercase trimmed; empty = no highlights. */
  searchHighlightQuery: string;
  /** Сосед с большим индексом в `messages` (старее по времени при newest-first) — для цепочки в группе. */
  groupOlderAdjacent: Message | undefined;
  /** Сосед с меньшим индексом (новее) — для цепочки в группе. */
  groupNewerAdjacent: Message | undefined;
  showDaySeparator: boolean;
  dayLabel: string;
  activeGroupCallRoomId?: string | null;
  isUserInGroupCall?: boolean;
  onJoinGroupCall?: (roomId: string) => void;
};

function wrapChatRowWithDaySeparator(
  row: React.ReactElement,
  showDaySeparator: boolean,
  dayLabel: string,
): React.ReactElement {
  if (!showDaySeparator) return row;
  // Inverted FlatList flips each row — separator after message renders above it visually.
  return (
    <>
      {row}
      <ChatDaySeparator label={dayLabel} />
    </>
  );
}

const AUTHOR_TAG_STYLES: Record<
  string,
  { bubble: string; text: string }
> = {
  blue: { bubble: 'rgba(91, 141, 239, 0.16)', text: '#4C7FE5' },
  green: { bubble: 'rgba(84, 177, 115, 0.16)', text: '#3F9960' },
  orange: { bubble: 'rgba(243, 154, 74, 0.18)', text: '#D8822D' },
  red: { bubble: 'rgba(230, 108, 122, 0.18)', text: '#CC5563' },
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  if (full.length !== 6) return AUTHOR_TAG_STYLES.blue.bubble;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return AUTHOR_TAG_STYLES.blue.bubble;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function expandHexColor(hexInput: string): string {
  const h = hexInput.replace('#', '').trim();
  const full =
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return full.length === 6 ? `#${full}` : '#4C7FE5';
}

/** Смежные сообщения в одной «цепочке» (как Telegram): интервал времени + в группе один отправитель для входящих. */
function isSameChatusGroupRunAdjacent(
  olderMsg: Message | undefined,
  newerMsg: Message | undefined,
  splitIncomingBySender: boolean,
  currentUserId: string | null,
): boolean {
  if (!olderMsg || !newerMsg) return false;
  const olderIsMe = olderMsg.sender_id === currentUserId;
  const newerIsMe = newerMsg.sender_id === currentUserId;
  if (olderIsMe !== newerIsMe) return false;
  if (Math.abs(olderMsg.created_at - newerMsg.created_at) > CHAT_MSG_GROUP_TIME_GAP_MS) return false;
  if (splitIncomingBySender && !newerIsMe) {
    return olderMsg.sender_id === newerMsg.sender_id;
  }
  return true;
}

/** Ближайший видимый (не удалённый) сосед в списке newest-first: `older` — больший индекс, `newer` — меньший. */
function getGroupChainNeighbor(
  messages: Message[],
  index: number,
  direction: 'older' | 'newer',
): Message | undefined {
  const step = direction === 'older' ? 1 : -1;
  let i = index + step;
  while (i >= 0 && i < messages.length) {
    const m = messages[i];
    if (m.is_deleted !== 1) return m;
    i += step;
  }
  return undefined;
}

function getNeighborOutsideRun(
  messages: Message[],
  startIndex: number,
  direction: 'older' | 'newer',
  runIdSet: Set<string>,
): Message | undefined {
  const step = direction === 'older' ? 1 : -1;
  let i = startIndex + step;
  while (i >= 0 && i < messages.length) {
    const m = messages[i]!;
    if (m.is_deleted === 1) {
      i += step;
      continue;
    }
    if (!runIdSet.has(m.id)) return m;
    i += step;
  }
  return undefined;
}

/** Сервер может отдавать preset (blue|green|…) или произвольный #hex. */
function getAuthorTagStyle(color?: string | null) {
  if (!color) return AUTHOR_TAG_STYLES.blue;
  const key = color.toLowerCase().trim();
  if (key in AUTHOR_TAG_STYLES) {
    return AUTHOR_TAG_STYLES[key as keyof typeof AUTHOR_TAG_STYLES];
  }
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(key)) {
    const withHash = key.startsWith('#') ? key : `#${key}`;
    const expanded = expandHexColor(withHash);
    return {
      bubble: hexToRgba(expanded, 0.22),
      text: expanded,
    };
  }
  return AUTHOR_TAG_STYLES.blue;
}

type StickerGroupMessageRowProps = {
  stickerGroupMessages: Message[];
  chatId: string;
  isGroupChat: boolean;
  currentUserId: string | null;
  repliedMessage: Message | null;
  selectionMode: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  canSwipe: boolean;
  onReply: () => void;
  allowReactions: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onPressMessage: (messageId: string) => void;
  onLongPressMessage: (message: Message) => void;
  onForwardHeaderPress?: (message: Message) => void;
  onReplyPreviewPress?: (messageId: string) => void;
  setContentRef: (messageId: string, node: View | null) => void;
  formatTime: (timestamp: number) => string;
  getMessageAuthorPresentation: (
    message: Message,
    chatId: string,
    currentUserId: string | null
  ) => MessageAuthorPresentation;
  getMessageAuthorName: (message: Message, chatId: string, currentUserId: string | null) => string;
  chatTheme: ChatTheme;
  navigation: NativeStackNavigationProp<ChatsStackParamList>;
  resolvedScheme: ResolvedColorScheme;
  searchHighlightQuery: string;
  groupOlderAdjacent: Message | undefined;
  groupNewerAdjacent: Message | undefined;
  showDaySeparator: boolean;
  dayLabel: string;
};

const StickerGroupMessageRow = React.memo(function StickerGroupMessageRow({
  stickerGroupMessages,
  chatId,
  isGroupChat,
  currentUserId,
  repliedMessage,
  selectionMode,
  isSelected,
  isHighlighted,
  canSwipe,
  onReply,
  allowReactions,
  onToggleReaction,
  onPressMessage,
  onLongPressMessage,
  onForwardHeaderPress,
  onReplyPreviewPress,
  setContentRef,
  formatTime,
  getMessageAuthorPresentation,
  getMessageAuthorName,
  chatTheme,
  navigation,
  resolvedScheme,
  searchHighlightQuery,
  groupOlderAdjacent,
  groupNewerAdjacent,
  showDaySeparator,
  dayLabel,
}: StickerGroupMessageRowProps) {
  const head = stickerGroupMessages[0]!;
  const lastTapAtRef = useRef(0);
  const { colors: themeColors } = useTheme();
  const isMe = head.sender_id === currentUserId;
  const isGroupIncoming = isGroupChat && !isMe;
  const isGroupedAbove =
    isGroupIncoming &&
    isSameChatusGroupRunAdjacent(groupOlderAdjacent, head, true, currentUserId);
  const isGroupedBelow =
    isGroupIncoming &&
    isSameChatusGroupRunAdjacent(head, groupNewerAdjacent, true, currentUserId);
  const showGroupAvatarImage = isGroupIncoming && head.is_deleted !== 1 && !isGroupedBelow;
  const shouldUseOuterReplySwipe = canSwipe;

  const authorPresentation = useMemo(
    () => getMessageAuthorPresentation(head, chatId, currentUserId),
    [chatId, currentUserId, getMessageAuthorPresentation, head],
  );
  const authorName = authorPresentation.name;
  const authorColor = authorPresentation.color;
  const authorAvatarUri = useMemo(
    () => resolveAvatarUrl(authorPresentation.avatarUrl ?? null),
    [authorPresentation.avatarUrl],
  );
  const showAuthorName = isGroupIncoming && head.is_deleted !== 1 && !isGroupedAbove;
  const inlineReactionList =
    selectionMode || !(head.reactions?.length ?? 0) ? undefined : head.reactions;

  const selectionProgress = useSharedValue(isSelected ? 1 : 0);
  useEffect(() => {
    selectionProgress.value = withSpring(isSelected ? 1 : 0, {
      damping: 16,
      stiffness: 240,
      mass: 0.9,
    });
  }, [isSelected, selectionProgress]);

  const selectionIndicatorScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + selectionProgress.value * 0.08 }],
  }));
  const selectionCheckStyle = useAnimatedStyle(() => ({
    opacity: selectionProgress.value,
    transform: [{ scale: 0.7 + selectionProgress.value * 0.3 }],
  }));

  const renderReplySnippet = () => {
    if (!head.reply_to_id) return null;
    const replyThumbnailUri = getReplyPreviewThumbnailUri(repliedMessage);
    const author = repliedMessage
      ? getMessageAuthorName(repliedMessage, chatId, currentUserId)
      : 'Исходное сообщение';
    const text = repliedMessage
      ? buildReplyPreviewText(repliedMessage)
      : 'Исходное сообщение недоступно';
    return (
      <ReplyPreview
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
        thumbnailUri={replyThumbnailUri}
        peerFirstLineId={repliedMessage?.chat_id ?? chatId}
        searchHighlightQuery={searchHighlightQuery}
        onPress={onReplyPreviewPress ? () => onReplyPreviewPress(head.reply_to_id!) : undefined}
      />
    );
  };

  const renderForwardHeader = (options?: { compact?: boolean; forceLightText?: boolean }) => {
    if (!head.forwarded_from_name && !head.forwarded_from_message_id) return null;
    const rawAvatar = resolveForwardedSenderAvatarUrl(
      head.forwarded_from_sender_id,
      head.forwarded_from_chat_id,
    );
    const avatarUri = resolveAvatarUrl(rawAvatar);
    const labelColor = options?.forceLightText
      ? 'rgba(255,255,255,0.72)'
      : isMe ? chatTheme.forwardHeaderMeSub : withAlpha(themeColors.accent, 0.72);
    const titleColor = options?.forceLightText
      ? '#FFFFFF'
      : isMe ? chatTheme.forwardHeaderMe : themeColors.accent;
    return (
      <ForwardHeader
        isMe={isMe}
        name={head.forwarded_from_name}
        avatarUri={avatarUri ?? undefined}
        labelColor={labelColor}
        titleColor={titleColor}
        compact={options?.compact}
        onPress={onForwardHeaderPress ? () => onForwardHeaderPress(head) : undefined}
      />
    );
  };

  const renderAuthorLabel = (options?: { forceLightText?: boolean }) => {
    if (!showAuthorName) return null;
    const tag = authorPresentation.tag?.trim() || null;
    const tagPalette = getAuthorTagStyle(authorPresentation.tagColor);
    return (
      <View style={styles.authorLabelRow}>
        <Text
          style={[styles.authorLabel, options?.forceLightText ? { color: '#FFFFFF' } : { color: authorColor }]}
          numberOfLines={1}
        >
          {authorName}
        </Text>
        {tag ? (
          <View style={[styles.authorTagChip, { backgroundColor: tagPalette.bubble }]}>
            <Text style={[styles.authorTagText, { color: tagPalette.text }]} numberOfLines={1}>
              {tag}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderIncomingHeader = (options?: { suppressForwardHeader?: boolean; forceLightText?: boolean }) => {
    if (isMe) {
      const forward = options?.suppressForwardHeader ? null : renderForwardHeader(options);
      if (!forward) return null;
      return <>{forward}</>;
    }
    const authorLabel = renderAuthorLabel(options);
    const forwardHeader = options?.suppressForwardHeader ? null : renderForwardHeader(options);
    if (!authorLabel && !forwardHeader) return null;
    return (
      <>
        {authorLabel}
        {forwardHeader}
      </>
    );
  };

  const reactionsNode =
    inlineReactionList?.length ? (
      <MessageReactionInline
        reactions={inlineReactionList}
        isMe={isMe}
        allowReactions={allowReactions}
        onToggle={(emoji) => onToggleReaction(head.id, emoji)}
        accentColor={chatTheme.bubbleMeAccent}
      />
    ) : null;

  const handleMessageRowPress = () => {
    if (selectionMode) {
      onPressMessage(head.id);
      return;
    }
    if (!allowReactions || head.is_deleted === 1) return;
    const now = Date.now();
    if (now - lastTapAtRef.current < 380) {
      lastTapAtRef.current = 0;
      onToggleReaction(head.id, DOUBLE_TAP_REACTION_EMOJI);
      return;
    }
    lastTapAtRef.current = now;
  };

  const handleMessageRowLongPress =
    selectionMode || head.is_deleted === 1 ? undefined : () => onLongPressMessage(head);

  const bubblePressableProps = {
    delayLongPress: 220 as const,
    onPress: handleMessageRowPress,
    onLongPress: handleMessageRowLongPress,
  };

  const groupAvatarVisual =
    authorAvatarUri != null && authorAvatarUri !== '' ? (
      <Image source={{ uri: authorAvatarUri }} style={styles.groupAvatarImage} contentFit="cover" cachePolicy="disk" />
    ) : (
      <View style={[styles.groupAvatarFallback, { backgroundColor: authorColor }]}>
        <Text style={styles.groupAvatarInitial}>{authorPresentation.initial}</Text>
      </View>
    );

  const stickerBody = (
    <StickerGroupMessageBubble
      messages={stickerGroupMessages}
      isMe={isMe}
      time={formatTime(head.created_at)}
      status={head.status}
      timeColor={themeColors.textSecondary}
      iconColor={themeColors.textSecondary}
      topHeader={renderIncomingHeader()}
      replySnippet={renderReplySnippet()}
      reactions={reactionsNode}
    />
  );

  const card = (
    <View style={styles.messagePressable}>
      <View style={styles.messageRowShell}>
        {selectionMode ? (
          <Pressable onPress={handleMessageRowPress} style={styles.selectionIndicatorSlot}>
            <Reanimated.View style={selectionIndicatorScaleStyle}>
              <View
                style={[
                  styles.selectionIndicator,
                  isSelected ? styles.selectionIndicatorActive : styles.selectionIndicatorIdle,
                ]}
              >
                <Reanimated.View style={selectionCheckStyle}>
                  <Feather name="check" size={14} color="#FFFFFF" />
                </Reanimated.View>
              </View>
            </Reanimated.View>
          </Pressable>
        ) : null}

        {isGroupIncoming ? (
          <View style={styles.messageCardColumn}>
            <View
              style={[
                styles.messageWrap,
                selectionMode && styles.messageWrapSelection,
                isMe ? styles.messageWrapMe : styles.messageWrapOther,
              ]}
            >
              <View style={styles.groupIncomingRow}>
                <View style={styles.groupAvatarSlot}>
                  {showGroupAvatarImage ? (
                    selectionMode ? (
                      <View>{groupAvatarVisual}</View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          authorName.trim().length > 0 ? `Профиль: ${authorName}` : 'Профиль участника'
                        }
                        accessibilityHint="Открывает профиль участника"
                        hitSlop={10}
                        onPress={() => {
                          navigation.navigate('ChatProfile', {
                            chatId,
                            userId: head.sender_id,
                          });
                        }}
                      >
                        {groupAvatarVisual}
                      </Pressable>
                    )
                  ) : null}
                </View>
                <Pressable style={{ flex: 1, minWidth: 0 }} {...bubblePressableProps}>
                  <View
                    ref={(node) => setContentRef(head.id, node)}
                    collapsable={false}
                    style={[
                      styles.messageContentMeasure,
                      styles.groupIncomingContent,
                      isHighlighted && styles.messageContentHighlighted,
                    ]}
                  >
                    {stickerBody}
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Pressable style={styles.messageCardColumn} {...bubblePressableProps}>
            <View
              style={[
                styles.messageWrap,
                selectionMode && styles.messageWrapSelection,
                isMe ? styles.messageWrapMe : styles.messageWrapOther,
              ]}
            >
              <View
                ref={(node) => setContentRef(head.id, node)}
                collapsable={false}
                style={[styles.messageContentMeasure, isHighlighted && styles.messageContentHighlighted]}
              >
                {stickerBody}
              </View>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (!shouldUseOuterReplySwipe) {
    return wrapChatRowWithDaySeparator(card, showDaySeparator, dayLabel);
  }
  return wrapChatRowWithDaySeparator(
    <ReplySwipeWrapper enabled onReply={onReply}>{card}</ReplySwipeWrapper>,
    showDaySeparator,
    dayLabel,
  );
});

function effectiveBodyItemForRow(p: MessageRowProps): Message {
  return p.item;
}

function messageRowUsesDarkDefaultOutgoingGradient(p: MessageRowProps): boolean {
  const body = effectiveBodyItemForRow(p);
  return (
    p.item.sender_id === p.currentUserId &&
    body.is_deleted !== 1 &&
    shouldUseDarkDefaultOutgoingBubbleGradient(p.chatTheme, p.resolvedScheme)
  );
}

const MessageRow = React.memo(function MessageRow({
  item,
  chatId,
  isGroupChat,
  currentUserId,
  repliedMessage,
  selectionMode,
  isSelected,
  isHighlighted,
  canSwipe,
  onReply,
  allowReactions,
  onToggleReaction,
  onPressMessage,
  onLongPressMessage,
  onOpenAlbumMedia,
  onForwardHeaderPress,
  onReplyPreviewPress,
  setContentRef,
  formatTime,
  getMessageAuthorPresentation,
  getMessageAuthorName,
  getDeletedPlaceholder,
  repliedVoiceBubbleWidth,
  chatTheme,
  navigation,
  resolvedScheme,
  scrollTick,
  searchHighlightQuery,
  groupOlderAdjacent,
  groupNewerAdjacent,
  showDaySeparator,
  dayLabel,
  activeGroupCallRoomId,
  isUserInGroupCall = false,
  onJoinGroupCall,
}: MessageRowProps) {
  const lastTapAtRef = useRef(0);
  const { colors: themeColors } = useTheme();
  const isMe = item.sender_id === currentUserId;
  const bodyItem = item;
  const groupCallPayload =
    bodyItem.msg_type === 'system' ? parseGroupCallSystemContent(bodyItem.content) : null;
  const isGroupCallSystem = groupCallPayload != null;
  /** Как в Telegram: на сообщении только из одного стикера реакции не ставятся. */
  const isPureChatusStickerOnly =
    bodyItem.msg_type === 'text' &&
    bodyItem.is_deleted !== 1 &&
    isChatusStickerMessage(bodyItem.content ?? '');
  const effectiveAllowReactions = allowReactions && !isPureChatusStickerOnly;
  const isGroupIncoming = isGroupChat && !isMe;
  const isGroupedAbove =
    isGroupIncoming &&
    isSameChatusGroupRunAdjacent(groupOlderAdjacent, item, true, currentUserId);
  const isGroupedBelow =
    isGroupIncoming &&
    isSameChatusGroupRunAdjacent(item, groupNewerAdjacent, true, currentUserId);
  const showGroupAvatarImage = isGroupIncoming && bodyItem.is_deleted !== 1 && !isGroupedBelow;
  const useViewportOutgoingGradient =
    isMe &&
    bodyItem.is_deleted !== 1 &&
    shouldUseDarkDefaultOutgoingBubbleGradient(chatTheme, resolvedScheme);
  const meBubbleFill = useViewportOutgoingGradient ? '#00000000' : chatTheme.bubbleMe;
  const ownsInlineReplySwipe = item.msg_type === 'video_note';
  const shouldUseOuterReplySwipe = canSwipe && !ownsInlineReplySwipe;
  const authorPresentation = React.useMemo(
    () => getMessageAuthorPresentation(item, chatId, currentUserId),
    [chatId, currentUserId, getMessageAuthorPresentation, item]
  );
  const authorName = authorPresentation.name;
  const authorColor = authorPresentation.color;
  const authorAvatarUri = React.useMemo(
    () => resolveAvatarUrl(authorPresentation.avatarUrl ?? null),
    [authorPresentation.avatarUrl]
  );
  const showAuthorName = isGroupIncoming && bodyItem.is_deleted !== 1 && !isGroupedAbove;
  const inlineReactionList =
    selectionMode || !effectiveAllowReactions || !(bodyItem.reactions?.length ?? 0)
      ? undefined
      : bodyItem.reactions;
  const isForwarded = !!(bodyItem.forwarded_from_name || bodyItem.forwarded_from_message_id);
  const forwardBorderStyle = isForwarded ? {
    borderLeftWidth: 3,
    borderLeftColor: isMe ? (chatTheme.replyAccentMe || '#FFFFFF') : themeColors.accent,
    paddingLeft: 8,
    marginLeft: 2,
  } : null;
  const selectionProgress = useSharedValue(isSelected ? 1 : 0);

  React.useEffect(() => {
    selectionProgress.value = withSpring(isSelected ? 1 : 0, {
      damping: 16,
      stiffness: 240,
      mass: 0.9,
    });
  }, [isSelected, selectionProgress]);

  const selectionIndicatorScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + selectionProgress.value * 0.08 }],
  }));

  const selectionCheckStyle = useAnimatedStyle(() => ({
    opacity: selectionProgress.value,
    transform: [{ scale: 0.7 + selectionProgress.value * 0.3 }],
  }));

  const renderReplySnippet = (opts?: { nestedInMedia?: boolean }) => {
    if (!bodyItem.reply_to_id) return null;

    const replyThumbnailUri = getReplyPreviewThumbnailUri(repliedMessage);
    const author = repliedMessage
      ? getMessageAuthorName(repliedMessage, chatId, currentUserId)
      : 'Исходное сообщение';
    const text = repliedMessage
      ? buildReplyPreviewText(repliedMessage)
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
        thumbnailUri={replyThumbnailUri}
        peerFirstLineId={repliedMessage?.chat_id ?? chatId}
        searchHighlightQuery={searchHighlightQuery}
        onPress={onReplyPreviewPress ? () => onReplyPreviewPress(bodyItem.reply_to_id!) : undefined}
      />
    );
  };

  const renderForwardHeader = (options?: { compact?: boolean; forceLightText?: boolean }) => {
    if (!bodyItem.forwarded_from_name && !bodyItem.forwarded_from_message_id) {
      return null;
    }

    const rawAvatar = resolveForwardedSenderAvatarUrl(
      bodyItem.forwarded_from_sender_id,
      bodyItem.forwarded_from_chat_id
    );
    const avatarUri = resolveAvatarUrl(rawAvatar);

    const labelColor = options?.forceLightText
      ? 'rgba(255,255,255,0.72)'
      : isMe ? chatTheme.forwardHeaderMeSub : withAlpha(themeColors.accent, 0.72);
    const titleColor = options?.forceLightText
      ? '#FFFFFF'
      : isMe ? chatTheme.forwardHeaderMe : themeColors.accent;

    return (
      <ForwardHeader
        isMe={isMe}
        name={bodyItem.forwarded_from_name}
        avatarUri={avatarUri ?? undefined}
        labelColor={labelColor}
        titleColor={titleColor}
        compact={options?.compact}
        onPress={onForwardHeaderPress ? () => onForwardHeaderPress(bodyItem) : undefined}
      />
    );
  };

  const renderAuthorLabel = (options?: { forceLightText?: boolean }) => {
    if (!showAuthorName) return null;

    const tag = authorPresentation.tag?.trim() || null;
    const tagPalette = getAuthorTagStyle(authorPresentation.tagColor);

    return (
      <View style={styles.authorLabelRow}>
        <Text
          style={[styles.authorLabel, options?.forceLightText ? { color: '#FFFFFF' } : { color: authorColor }]}
          numberOfLines={1}
        >
          {authorName}
        </Text>
        {tag ? (
          <View style={[styles.authorTagChip, { backgroundColor: tagPalette.bubble }]}>
            <Text style={[styles.authorTagText, { color: tagPalette.text }]} numberOfLines={1}>
              {tag}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderIncomingHeader = (options?: { suppressForwardHeader?: boolean; forceLightText?: boolean }) => {
    if (isMe) {
      const forward = options?.suppressForwardHeader ? null : renderForwardHeader(options);
      if (!forward) return null;
      return <>{forward}</>;
    }

    const authorLabel = renderAuthorLabel(options);
    const forwardHeader = options?.suppressForwardHeader ? null : renderForwardHeader(options);

    if (!authorLabel && !forwardHeader) return null;

    return (
      <>
        {authorLabel}
        {forwardHeader}
      </>
    );
  };

  const renderBody = () => {
    if (item.is_deleted === 1) {
      return (
        <View
          style={[
            styles.deletedBubble,
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
            source={item.source}
          />
        </View>
      );
    }

    if (bodyItem.msg_type === 'system') {
      if (groupCallPayload) {
        const canJoin =
          groupCallPayload.action === 'started' &&
          Boolean(activeGroupCallRoomId && activeGroupCallRoomId === groupCallPayload.room_id) &&
          !isUserInGroupCall;
        return (
          <GroupCallSystemMessage
            payload={groupCallPayload}
            canJoin={canJoin}
            onJoin={canJoin && onJoinGroupCall ? () => onJoinGroupCall(groupCallPayload.room_id) : undefined}
            time={formatTime(bodyItem.created_at)}
            status={bodyItem.status}
            isMe
          />
        );
      }
    }

    const bubbleCore = () => {
    if (bodyItem.msg_type === 'text') {
      const rawContent = bodyItem.content ?? '';
      const displayContent = rawContent.trim() || ' ';
      const compositeParsed = tryParseCompositeMessage(rawContent);
      const compositeStickerRefs = compositeParsed ? getCompositeStickerRefs(compositeParsed) : [];
      if (compositeParsed && compositeStickerRefs.length > 0) {
        const textBodyRaw = getCompositeTextBody(compositeParsed);
        const trimmedText = textBodyRaw.trim();
        const stickerMetaColor = isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary;
        const stickerIconColor = isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary;
        const reactionsNode =
          inlineReactionList?.length ? (
            <MessageReactionInline
              reactions={inlineReactionList}
              isMe={isMe}
              allowReactions={effectiveAllowReactions}
              onToggle={(emoji) => onToggleReaction(bodyItem.id, emoji)}
              accentColor={chatTheme.bubbleMeAccent}
            />
          ) : null;

        if (!trimmedText && compositeStickerRefs.length === 1) {
          const only = compositeStickerRefs[0]!;
          return (
            <StickerMessageBubble
              rawContent={encodeStickerPayload(only)}
              isMe={isMe}
              time={formatTime(bodyItem.created_at)}
              status={bodyItem.status}
              timeColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
              iconColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
              topHeader={renderIncomingHeader()}
              replySnippet={renderReplySnippet()}
              reactions={reactionsNode}
              playOutgoingEntrance={isMe && bodyItem.chatus_sticker_solo_send === true}
            />
          );
        }

        const multiStickerSoloCell = (n: number) => {
          const base = soloChatusStickerDisplayDp();
          if (n >= 4) return Math.round(base * 0.42);
          if (n === 3) return Math.round(base * 0.5);
          if (n === 2) return Math.round(base * 0.62);
          return base;
        };

        if (!trimmedText && compositeStickerRefs.length > 1) {
          const cell = multiStickerSoloCell(compositeStickerRefs.length);
          const thumbInner = Math.max(24, cell - 10);
          const strip = (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                justifyContent: isMe ? 'flex-end' : 'flex-start',
                maxWidth: 272,
              }}
            >
              {compositeStickerRefs.map((stickerRef, idx) => (
                <View
                  key={`${stickerRef.packId}:${stickerRef.stickerId}:${idx}`}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isMe
                      ? withAlpha('#FFFFFF', 0.12)
                      : withAlpha(themeColors.textSecondary, 0.08),
                  }}
                >
                  <Image
                    source={resolveStickerImageOrPlaceholder(stickerRef)}
                    style={{ width: thumbInner, height: thumbInner }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    recyclingKey={`${stickerRef.packId}:${stickerRef.stickerId}:${idx}`}
                    accessibilityRole="image"
                    accessibilityLabel="Стикер"
                  />
                </View>
              ))}
            </View>
          );
          const metaRow = (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: isMe ? 'flex-end' : 'flex-start',
                marginTop: 4,
              }}
            >
              <MessageTimeStatus
                time={formatTime(bodyItem.created_at)}
                status={bodyItem.status}
                isMe={isMe}
                compact
                timeColor={stickerMetaColor}
                iconColor={stickerIconColor}
                source={bodyItem.source}
              />
            </View>
          );
          if (!isMe) {
            return (
              <View style={{ alignSelf: 'flex-start', maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT }}>
                {renderIncomingHeader()}
                {renderReplySnippet()}
                {strip}
                {metaRow}
                {reactionsNode}
              </View>
            );
          }
          return (
            <View style={{ alignSelf: 'flex-end', maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT }}>
              {renderIncomingHeader()}
              {renderReplySnippet()}
              {strip}
              {metaRow}
              {reactionsNode}
            </View>
          );
        }

        const stickerSlot = COMPOSITE_INLINE_STICKER_PX + 6;
        const stickerStripW = Math.min(200, Math.max(stickerSlot, compositeStickerRefs.length * stickerSlot));

        const compositeBubbleBody = (
          <View style={styles.bubbleContentRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {renderTextWithSearchHighlight(trimmedText, searchHighlightQuery, [
                styles.textContent,
                isMe ? styles.textContentMe : null,
                isMe ? { color: chatTheme.bubbleMeText } : { color: themeColors.textPrimary },
              ])}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ width: stickerStripW, flexShrink: 0 }}
              contentContainerStyle={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 6,
                paddingLeft: 2,
              }}
            >
              {compositeStickerRefs.map((stickerRef, idx) => (
                <Image
                  key={`${stickerRef.packId}:${stickerRef.stickerId}:${idx}`}
                  source={resolveStickerImageOrPlaceholder(stickerRef)}
                  style={{ width: COMPOSITE_INLINE_STICKER_PX, height: COMPOSITE_INLINE_STICKER_PX }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={`${stickerRef.packId}:${stickerRef.stickerId}:${idx}`}
                  accessibilityRole="image"
                  accessibilityLabel="Стикер"
                />
              ))}
            </ScrollView>
            <MessageTimeStatus
              time={formatTime(bodyItem.created_at)}
              status={bodyItem.status}
              isMe={isMe}
              compact
              timeColor={stickerMetaColor}
              iconColor={stickerIconColor}
              source={bodyItem.source}
            />
          </View>
        );

        if (!isMe) {
          return (
            <View style={{ alignSelf: 'flex-start', maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT }}>
              {renderIncomingHeader()}
              {renderReplySnippet()}
              <View
                style={[
                  styles.bubble,
                  isGroupIncoming && styles.groupMessageSurface,
                  styles.bubbleOther,
                  {
                    backgroundColor: themeColors.bubbleOther,
                    borderColor: themeColors.bubbleOtherBorder,
                  },
                ]}
              >
                {compositeBubbleBody}
              </View>
              {reactionsNode}
            </View>
          );
        }

        return (
          <View style={{ alignSelf: 'flex-end', maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT }}>
            {renderIncomingHeader()}
            {renderReplySnippet()}
            <MeBubbleChrome
              active={useViewportOutgoingGradient}
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[
                styles.bubble,
                isGroupIncoming && styles.groupMessageSurface,
                !useViewportOutgoingGradient ? styles.bubbleMe : null,
              ]}
            >
              {compositeBubbleBody}
            </MeBubbleChrome>
            {reactionsNode}
          </View>
        );
      }

      const channelLink = parseChannelDeepLinkFromMessage(rawContent);

      if (channelLink) {
        return (
          <View
            style={[
              styles.channelLinkOuter,
              isGroupIncoming && styles.groupMessageSurface,
            ]}
          >
            {renderIncomingHeader()}
            {renderReplySnippet()}
            <ChannelLinkRichMessage
              parsed={channelLink}
              rawUrlLine={displayContent}
              isMe={isMe}
              time={formatTime(bodyItem.created_at)}
              status={bodyItem.status}
              navigation={navigation}
              chatTheme={chatTheme}
              useViewportOutgoingGradient={useViewportOutgoingGradient}
              scrollTick={scrollTick}
            />
            {inlineReactionList?.length ? (
              <MessageReactionInline
                reactions={inlineReactionList}
                isMe={isMe}
                allowReactions={effectiveAllowReactions}
                onToggle={(emoji) => onToggleReaction(bodyItem.id, emoji)}
                accentColor={chatTheme.bubbleMeAccent}
              />
            ) : null}
          </View>
        );
      }

      if (isChatusStickerMessage(rawContent)) {
        const reactionsNode =
          inlineReactionList?.length ? (
            <MessageReactionInline
              reactions={inlineReactionList}
              isMe={isMe}
              allowReactions={effectiveAllowReactions}
              onToggle={(emoji) => onToggleReaction(bodyItem.id, emoji)}
              accentColor={chatTheme.bubbleMeAccent}
            />
          ) : null;

        return (
          <StickerMessageBubble
            rawContent={rawContent}
            isMe={isMe}
            time={formatTime(bodyItem.created_at)}
            status={bodyItem.status}
            timeColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
            iconColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
            topHeader={renderIncomingHeader()}
            replySnippet={renderReplySnippet()}
            reactions={reactionsNode}
            playOutgoingEntrance={isMe && bodyItem.chatus_sticker_solo_send === true}
          />
        );
      }

      if (!isMe) {
        return (
          <View
            style={[
              styles.bubble,
              { alignSelf: 'flex-start' as const },
              isGroupIncoming && styles.groupMessageSurface,
              styles.bubbleOther,
              {
                backgroundColor: themeColors.bubbleOther,
                borderColor: themeColors.bubbleOtherBorder,
              },
            ]}
          >
            {renderIncomingHeader()}
            {renderReplySnippet()}
            <MessageTextBubbleBody
              text={searchHighlightQuery ? undefined : displayContent}
              textStyle={[styles.textContent, { color: themeColors.textPrimary }]}
              rowStyle={[styles.bubbleContentRow, forwardBorderStyle]}
              meta={
                <MessageTimeStatus
                  time={formatTime(bodyItem.created_at)}
                  status={bodyItem.status}
                  isMe={isMe}
                  compact
                  timeColor={themeColors.textSecondary}
                  iconColor={themeColors.textSecondary}
                />
              }
            >
              {searchHighlightQuery
                ? renderTextWithSearchHighlight(displayContent, searchHighlightQuery, [
                    styles.textContent,
                    { color: themeColors.textPrimary },
                  ])
                : null}
            </MessageTextBubbleBody>
            {inlineReactionList?.length ? (
              <MessageReactionInline
                reactions={inlineReactionList}
                isMe={isMe}
                allowReactions={effectiveAllowReactions}
                onToggle={(emoji) => onToggleReaction(bodyItem.id, emoji)}
                accentColor={chatTheme.bubbleMeAccent}
              />
            ) : null}
          </View>
        );
      }

      return (
        <MeBubbleChrome
          active={useViewportOutgoingGradient}
          scrollTick={scrollTick}
          fillColor={chatTheme.bubbleMe}
          style={[
            styles.bubble,
            { alignSelf: 'flex-end' as const },
            isGroupIncoming && styles.groupMessageSurface,
            !useViewportOutgoingGradient ? styles.bubbleMe : null,
          ]}
        >
          {renderIncomingHeader()}
          {renderReplySnippet()}
          <MessageTextBubbleBody
            text={searchHighlightQuery ? undefined : displayContent}
            textStyle={[
              styles.textContent,
              styles.textContentMe,
              { color: chatTheme.bubbleMeText },
            ]}
            rowStyle={[styles.bubbleContentRow, forwardBorderStyle]}
            meta={
              <MessageTimeStatus
                time={formatTime(bodyItem.created_at)}
                status={bodyItem.status}
                isMe
                compact
                timeColor={chatTheme.bubbleMeMeta}
                iconColor={chatTheme.bubbleMeMeta}
              />
            }
          >
            {searchHighlightQuery
              ? renderTextWithSearchHighlight(displayContent, searchHighlightQuery, [
                  styles.textContent,
                  styles.textContentMe,
                  { color: chatTheme.bubbleMeText },
                ])
              : null}
          </MessageTextBubbleBody>
          {inlineReactionList?.length ? (
            <MessageReactionInline
              reactions={inlineReactionList}
              isMe
              allowReactions={effectiveAllowReactions}
              onToggle={(emoji) => onToggleReaction(bodyItem.id, emoji)}
              accentColor={chatTheme.bubbleMeAccent}
            />
          ) : null}
        </MeBubbleChrome>
      );
    }

    if (bodyItem.msg_type === 'voice' && bodyItem.media?.[0]) {
      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const topHeader = replySnippet ? null : renderIncomingHeader();
      const voiceUri =
        resolveVoiceMessageUri(bodyItem) ?? bodyItem.media[0].remote_url ?? `file://${bodyItem.id}`;
      const voiceContent = (
        <PeerFirstVoiceBubble
          lineId={chatId}
          serverUri={voiceUri}
          waveform={bodyItem.media[0].waveform ?? []}
          durationMs={bodyItem.media[0].duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(bodyItem.created_at)}
          status={bodyItem.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          inlineReactions={inlineReactionList}
          allowMessageReactions={effectiveAllowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(bodyItem.id, emoji)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingDurationColor={!isMe ? themeColors.textSecondary : undefined}
          isForwarded={isForwarded}
          forwardAccentColor={isMe ? (chatTheme.replyAccentMe || '#FFFFFF') : themeColors.accent}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                { width: repliedVoiceBubbleWidth, maxWidth: isGroupIncoming ? '100%' : CHAT_BUBBLE_MAX_WIDTH_PCT },
                isGroupIncoming && styles.groupMessageSurface,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {voiceContent}
            </View>
          );
        }
        if (useViewportOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[
                styles.repliedMediaBubble,
                { width: repliedVoiceBubbleWidth, maxWidth: isGroupIncoming ? '100%' : CHAT_BUBBLE_MAX_WIDTH_PCT },
                isGroupIncoming && styles.groupMessageSurface,
                bubbleRadius.mine,
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {voiceContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              { width: repliedVoiceBubbleWidth, maxWidth: isGroupIncoming ? '100%' : CHAT_BUBBLE_MAX_WIDTH_PCT },
              isGroupIncoming && styles.groupMessageSurface,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
            ]}
          >
            {renderIncomingHeader()}
            {replySnippet}
            {voiceContent}
          </View>
        );
      }

      return (
        <View
          style={[
            styles.mediaStack,
            isGroupIncoming && styles.groupMessageSurface,
          ]}
        >
          {isMe && useViewportOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
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

    if (bodyItem.msg_type === 'video_note' && bodyItem.media?.[0]) {
      const media = bodyItem.media[0];
      const rawVideo = media.remote_url?.trim() ?? '';
      const videoUri =
        resolveVoiceMessageUri(bodyItem) ?? resolveMediaUrl(rawVideo || null) ?? rawVideo;
      if (!videoUri) return null;

      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      
      let topHeaderRaw = replySnippet
        ? null
        : renderIncomingHeader({ forceLightText: true });

      let topHeader: React.ReactNode = null;
      if (topHeaderRaw) {
        topHeader = (
          <View style={styles.videoNoteHeaderBadge}>
            {topHeaderRaw}
          </View>
        );
      }

      const videoContent = (
        <PeerFirstVideoNoteBubble
          lineId={chatId}
          serverUri={videoUri}
          messageId={bodyItem.id}
          thumbnailUri={
            media.thumbnail_url
              ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
              : undefined
          }
          durationMs={media.duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(bodyItem.created_at)}
          status={bodyItem.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={meBubbleFill}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          viewportOutgoingGradient={!!isMe && useViewportOutgoingGradient && !replySnippet}
          scrollTick={scrollTick}
          enableReplySwipe={canSwipe}
          onReplySwipe={onReply}
          inlineReactions={inlineReactionList}
          allowMessageReactions={effectiveAllowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(bodyItem.id, emoji)}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {videoContent}
            </View>
          );
        }
        if (useViewportOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[
                styles.repliedMediaBubble,
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                bubbleRadius.mine,
                { overflow: 'hidden' },
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {videoContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              isGroupIncoming && styles.groupMessageSurface,
              isGroupIncoming && styles.groupRepliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
            ]}
          >
            {renderIncomingHeader()}
            {replySnippet}
            {videoContent}
          </View>
        );
      }

      return (
        <View
          style={[
            styles.mediaStack,
            isGroupIncoming && styles.groupMessageSurface,
          ]}
        >
          {videoContent}
        </View>
      );
    }

    const visualMediaCount =
      bodyItem.msg_type === 'image' || bodyItem.msg_type === 'video'
        ? bodyItem.media?.filter((media) => media.remote_url?.trim()).length ?? 0
        : 0;

    if (visualMediaCount > 1) {
      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const albumContent = (
        <MediaAlbumBubble
          message={bodyItem}
          lineId={bodyItem.chat_id || chatId}
          isMe={isMe}
          time={formatTime(bodyItem.created_at)}
          status={bodyItem.status}
          chatTheme={chatTheme}
          onOpenMedia={onOpenAlbumMedia}
          inlineReactions={inlineReactionList}
          allowMessageReactions={effectiveAllowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(bodyItem.id, emoji)}
          viewportOutgoingGradient={useViewportOutgoingGradient}
          scrollTick={scrollTick}
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
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {albumContent}
            </View>
          );
        }
        if (useViewportOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[
                styles.repliedMediaBubble,
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                bubbleRadius.mine,
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {albumContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              isGroupIncoming && styles.groupMessageSurface,
              isGroupIncoming && styles.groupRepliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
            ]}
          >
            {renderIncomingHeader()}
            {replySnippet}
            {albumContent}
          </View>
        );
      }

      return (
        <View
          style={[
            styles.mediaStack,
            isGroupIncoming && styles.groupMessageSurface,
          ]}
        >
          {albumContent}
        </View>
      );
    }

    if (bodyItem.msg_type === 'image') {
      const media = bodyItem.media?.[0];
      const rawImage = media?.remote_url ?? '';
      const imageUri = resolveMediaUrl(rawImage.trim() || null) ?? rawImage;
      if (!imageUri.trim()) return null;

      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const topHeader = replySnippet ? null : renderIncomingHeader();
      const imageContent = (
        <PeerFirstImageBubble
          lineId={chatId}
          serverUri={imageUri}
          isMe={isMe}
          width={media?.width}
          height={media?.height}
          caption={bodyItem.content ?? undefined}
          time={formatTime(bodyItem.created_at)}
          status={bodyItem.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          inlineReactions={inlineReactionList}
          allowMessageReactions={effectiveAllowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(bodyItem.id, emoji)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingCaptionTextColor={!isMe ? themeColors.textPrimary : undefined}
          isForwarded={isForwarded}
          forwardAccentColor={isMe ? (chatTheme.replyAccentMe || '#FFFFFF') : themeColors.accent}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {imageContent}
            </View>
          );
        }
        if (useViewportOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[
                styles.repliedMediaBubble,
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                bubbleRadius.mine,
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {imageContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              isGroupIncoming && styles.groupMessageSurface,
              isGroupIncoming && styles.groupRepliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
            ]}
          >
            {renderIncomingHeader()}
            {replySnippet}
            {imageContent}
          </View>
        );
      }

      return (
        <View
          style={[
            styles.mediaStack,
            isGroupIncoming && styles.groupMessageSurface,
          ]}
        >
          {isMe && useViewportOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
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

    if (bodyItem.msg_type === 'video') {
      const media = bodyItem.media?.[0];
      const rawVideo = media?.remote_url ?? '';
      const videoUri = resolveMediaUrl(rawVideo.trim() || null) ?? rawVideo;
      if (!videoUri.trim()) return null;

      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const topHeader = replySnippet ? null : renderIncomingHeader();
      const thumbResolved = media?.thumbnail_url
        ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
        : undefined;
      const videoContent = (
        <PeerFirstVideoBubble
          lineId={chatId}
          serverUri={videoUri}
          thumbnailUri={thumbResolved}
          isMe={isMe}
          width={media?.width}
          height={media?.height}
          durationMs={media?.duration_ms ?? 0}
          caption={bodyItem.content ?? undefined}
          time={formatTime(bodyItem.created_at)}
          status={bodyItem.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          inlineReactions={inlineReactionList}
          allowMessageReactions={effectiveAllowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(bodyItem.id, emoji)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingCaptionTextColor={!isMe ? themeColors.textPrimary : undefined}
          isForwarded={isForwarded}
          forwardAccentColor={isMe ? (chatTheme.replyAccentMe || '#FFFFFF') : themeColors.accent}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                styles.repliedMediaBubbleOther,
                {
                  backgroundColor: themeColors.bubbleOther,
                  borderColor: themeColors.bubbleOtherBorder,
                },
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {videoContent}
            </View>
          );
        }
        if (useViewportOutgoingGradient) {
          return (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[
                styles.repliedMediaBubble,
                isGroupIncoming && styles.groupMessageSurface,
                isGroupIncoming && styles.groupRepliedMediaBubble,
                bubbleRadius.mine,
              ]}
            >
              {renderIncomingHeader()}
              {replySnippet}
              {videoContent}
            </MeBubbleChrome>
          );
        }
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              isGroupIncoming && styles.groupMessageSurface,
              isGroupIncoming && styles.groupRepliedMediaBubble,
              styles.repliedMediaBubbleMe,
              { backgroundColor: chatTheme.bubbleMe },
            ]}
          >
            {renderIncomingHeader()}
            {replySnippet}
            {videoContent}
          </View>
        );
      }

      return (
        <View
          style={[
            styles.mediaStack,
            isGroupIncoming && styles.groupMessageSurface,
          ]}
        >
          {isMe && useViewportOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
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

    if (bodyItem.msg_type === 'file' && bodyItem.media?.[0]) {
      const replySnippet = renderReplySnippet({ nestedInMedia: true });
      const rawFile = bodyItem.media[0].remote_url ?? '';
      const fileUri =
        rawFile.trim().length > 0
          ? resolveMediaUrl(rawFile) ?? rawFile
          : undefined;
      const fileBubbleEl = (
        <PeerFirstFileBubble
          lineId={chatId}
          serverUri={fileUri ?? ''}
          fileName={bodyItem.media[0].file_name ?? 'File'}
          fileSize={bodyItem.media[0].file_size}
          isMe={isMe}
          caption={bodyItem.content ?? undefined}
          time={formatTime(bodyItem.created_at)}
          status={bodyItem.status}
          header={renderIncomingHeader()}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          reactionAccentColor={getOutgoingReactionAccent(chatTheme)}
          inlineReactions={inlineReactionList}
          allowMessageReactions={effectiveAllowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(bodyItem.id, emoji)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingFileNameColor={!isMe ? themeColors.textPrimary : undefined}
          incomingSecondaryTextColor={!isMe ? themeColors.textSecondary : undefined}
          incomingCaptionColor={!isMe ? themeColors.textPrimary : undefined}
          isForwarded={isForwarded}
          forwardAccentColor={isMe ? (chatTheme.replyAccentMe || '#FFFFFF') : themeColors.accent}
        />
      );

      return (
        <View
          style={[
            styles.fileStack,
            isGroupIncoming && styles.groupFileStack,
          ]}
        >
          {replySnippet}
          {isMe && useViewportOutgoingGradient ? (
            <MeBubbleChrome
              active
              scrollTick={scrollTick}
              fillColor={chatTheme.bubbleMe}
              style={[
                { alignSelf: 'flex-end', width: FILE_ROW_WIDTH, maxWidth: '100%' },
                bubbleRadius.mine,
                { overflow: 'hidden' },
              ]}
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
    };

    return bubbleCore();
  };

  const handleMessageRowPress = () => {
    if (selectionMode) {
      onPressMessage(item.id);
      return;
    }
    if (!effectiveAllowReactions || item.is_deleted === 1) return;
    const now = Date.now();
    if (now - lastTapAtRef.current < 380) {
      lastTapAtRef.current = 0;
      onToggleReaction(item.id, DOUBLE_TAP_REACTION_EMOJI);
      return;
    }
    lastTapAtRef.current = now;
  };

  const handleMessageRowLongPress =
    selectionMode || item.is_deleted === 1 ? undefined : () => onLongPressMessage(item);

  const bubblePressableProps = {
    delayLongPress: 220 as const,
    onPress: handleMessageRowPress,
    onLongPress: handleMessageRowLongPress,
  };

  const groupAvatarVisual =
    authorAvatarUri != null && authorAvatarUri !== '' ? (
      <Image source={{ uri: authorAvatarUri }} style={styles.groupAvatarImage} contentFit="cover" cachePolicy="disk" />
    ) : (
      <View style={[styles.groupAvatarFallback, { backgroundColor: authorColor }]}>
        <Text style={styles.groupAvatarInitial}>{authorPresentation.initial}</Text>
      </View>
    );

  const card = isGroupCallSystem ? (
    <View style={styles.messagePressable}>
      <View style={[styles.messageWrap, styles.messageWrapMe]}>
        <View
          ref={(node) => setContentRef(item.id, node)}
          collapsable={false}
          style={[
            styles.messageContentMeasure,
            isHighlighted && styles.messageContentHighlighted,
          ]}
        >
          {renderBody()}
        </View>
      </View>
    </View>
  ) : (
    <View style={styles.messagePressable}>
      <View style={styles.messageRowShell}>
        {selectionMode ? (
          <Pressable onPress={handleMessageRowPress} style={styles.selectionIndicatorSlot}>
            <Reanimated.View style={selectionIndicatorScaleStyle}>
              <View
                style={[
                  styles.selectionIndicator,
                  isSelected ? styles.selectionIndicatorActive : styles.selectionIndicatorIdle,
                ]}
              >
                <Reanimated.View style={selectionCheckStyle}>
                  <Feather name="check" size={14} color="#FFFFFF" />
                </Reanimated.View>
              </View>
            </Reanimated.View>
          </Pressable>
        ) : null}

        {isGroupIncoming ? (
          <View style={styles.messageCardColumn}>
            <View
              style={[
                styles.messageWrap,
                selectionMode && styles.messageWrapSelection,
                isMe ? styles.messageWrapMe : styles.messageWrapOther,
              ]}
            >
              <View style={styles.groupIncomingRow}>
                <View style={styles.groupAvatarSlot}>
                  {showGroupAvatarImage ? (
                    selectionMode ? (
                      <View>{groupAvatarVisual}</View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          authorName.trim().length > 0 ? `Профиль: ${authorName}` : 'Профиль участника'
                        }
                        accessibilityHint="Открывает профиль участника"
                        hitSlop={10}
                        onPress={() => {
                          navigation.navigate('ChatProfile', {
                            chatId,
                            userId: item.sender_id,
                          });
                        }}
                      >
                        {groupAvatarVisual}
                      </Pressable>
                    )
                  ) : null}
                </View>
                <Pressable style={{ flex: 1, minWidth: 0 }} {...bubblePressableProps}>
                  <View
                    ref={(node) => setContentRef(item.id, node)}
                    collapsable={false}
                    style={[
                      styles.messageContentMeasure,
                      styles.groupIncomingContent,
                      isHighlighted && styles.messageContentHighlighted,
                    ]}
                  >
                    {renderBody()}
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Pressable style={styles.messageCardColumn} {...bubblePressableProps}>
            <View
              style={[
                styles.messageWrap,
                selectionMode && styles.messageWrapSelection,
                isMe ? styles.messageWrapMe : styles.messageWrapOther,
              ]}
            >
              <View
                ref={(node) => setContentRef(item.id, node)}
                collapsable={false}
                style={[
                  styles.messageContentMeasure,
                  isHighlighted && styles.messageContentHighlighted,
                ]}
              >
                {renderBody()}
              </View>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (!shouldUseOuterReplySwipe) {
    return wrapChatRowWithDaySeparator(card, showDaySeparator, dayLabel);
  }

  return wrapChatRowWithDaySeparator(
    <ReplySwipeWrapper enabled onReply={onReply}>{card}</ReplySwipeWrapper>,
    showDaySeparator,
    dayLabel,
  );
}, (prev, next) => {
  const scrollOk =
    prev.scrollTick === next.scrollTick ||
    (!messageRowUsesDarkDefaultOutgoingGradient(prev) &&
      !messageRowUsesDarkDefaultOutgoingGradient(next));
  return (
    scrollOk &&
    prev.showDaySeparator === next.showDaySeparator &&
    prev.dayLabel === next.dayLabel &&
    prev.item === next.item &&
    prev.repliedMessage === next.repliedMessage &&
    prev.isGroupChat === next.isGroupChat &&
    prev.selectionMode === next.selectionMode &&
    prev.isSelected === next.isSelected &&
    prev.isHighlighted === next.isHighlighted &&
    prev.searchHighlightQuery === next.searchHighlightQuery &&
    prev.canSwipe === next.canSwipe &&
    prev.allowReactions === next.allowReactions &&
    prev.currentUserId === next.currentUserId &&
    prev.chatId === next.chatId &&
    prev.chatTheme === next.chatTheme &&
    prev.resolvedScheme === next.resolvedScheme &&
    prev.getMessageAuthorPresentation === next.getMessageAuthorPresentation &&
    prev.onForwardHeaderPress === next.onForwardHeaderPress &&
    prev.onReplyPreviewPress === next.onReplyPreviewPress &&
    prev.onOpenAlbumMedia === next.onOpenAlbumMedia &&
    prev.onToggleReaction === next.onToggleReaction &&
    prev.groupOlderAdjacent === next.groupOlderAdjacent &&
    prev.groupNewerAdjacent === next.groupNewerAdjacent
  );
});

export const ChatMessageList = React.memo(function ChatMessageList({
  chatId,
  isGroupChat,
  currentUserId,
  messages,
  selectionMode,
  selectedMessageIdSet,
  highlightedMessageId,
  searchHighlightQuery,
  listRef,
  listAnimatedStyle,
  contentPaddingTop,
  canSwipeReply,
  onSwipeReply,
  allowReactions,
  onToggleReaction,
  onMessagePress,
  onMessageLongPress,
  onForwardHeaderPress,
  onReplyPreviewPress,
  setContentRef,
  onScrollToIndexFailed,
  formatTime,
  getMessageAuthorPresentation,
  getMessageAuthorName,
  getDeletedPlaceholder,
  repliedVoiceBubbleWidth,
  chatTheme,
  activeVideoNoteVisible,
  scrollFabBottomOffset,
  enableScrollFab = true,
  activeGroupCallRoomId = null,
  isUserInGroupCall = false,
  onJoinGroupCall,
}: ChatMessageListProps) {
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const { resolvedScheme } = useTheme();
  const [scrollTick, setScrollTick] = React.useState(0);
  const lastScrollBumpAt = React.useRef(0);
  const bumpScrollTickThrottled = React.useCallback(() => {
    const now = Date.now();
    if (now - lastScrollBumpAt.current < 48) return;
    lastScrollBumpAt.current = now;
    setScrollTick((t) => (t + 1) & 0xffff);
  }, []);
  const bumpScrollTickImmediate = React.useCallback(() => {
    setScrollTick((t) => (t + 1) & 0xffff);
  }, []);
  const {
    showScrollToBottom,
    handleScroll: handleChatScroll,
    handleScrollEnd: handleChatScrollEnd,
    recheckFabVisibility,
    scrollToBottom,
  } = useInvertedChatScrollFab(listRef, chatId);

  const lastMessagesLengthRef = React.useRef(messages.length);
  React.useEffect(() => {
    if (messages.length > lastMessagesLengthRef.current) {
      const latest = messages[0];
      if (latest && latest.sender_id === currentUserId) {
        scrollToBottom();
      }
    }
    lastMessagesLengthRef.current = messages.length;
  }, [messages, currentUserId, scrollToBottom]);
  const handleListScroll = React.useCallback(
    (event: Parameters<typeof handleChatScroll>[0]) => {
      handleChatScroll(event);
      bumpScrollTickThrottled();
    },
    [bumpScrollTickThrottled, handleChatScroll],
  );
  const handleListScrollEnd = React.useCallback(
    (event: Parameters<typeof handleChatScrollEnd>[0]) => {
      handleChatScrollEnd(event);
      bumpScrollTickImmediate();
    },
    [bumpScrollTickImmediate, handleChatScrollEnd],
  );

  const messageByIdInternal = React.useMemo(() => {
    const m = new Map<string, Message>();
    for (const msg of messages) {
      m.set(msg.id, msg);
    }
    return m;
  }, [messages]);
  const messageByIdRef = React.useRef(messageByIdInternal);
  messageByIdRef.current = messageByIdInternal;

  const messageIndexById = React.useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < messages.length; i += 1) {
      m.set(messages[i]!.id, i);
    }
    return m;
  }, [messages]);

  const listRows = React.useMemo(
    () => buildStickerGroupedChatRows(messages, currentUserId),
    [messages, currentUserId],
  );

  const [albumViewerState, setAlbumViewerState] = React.useState<AlbumViewerState>(null);
  const handleOpenAlbumMedia = React.useCallback((media: VisualMediaItem[], index: number) => {
    setAlbumViewerState({
      media,
      initialIndex: Math.max(0, Math.min(media.length - 1, index)),
    });
  }, []);
  const handleCloseAlbumViewer = React.useCallback(() => {
    setAlbumViewerState(null);
  }, []);

  const renderChatRow = React.useCallback(
    ({ item, index }: { item: ChatListRow; index: number }) => {
      const itemDateMs = getChatListRowDateMs(item);
      let olderComparableDateMs: number | null = null;
      for (let j = index + 1; j < listRows.length; j += 1) {
        const candidateMs = getChatListRowDateMs(listRows[j]!);
        if (isValidChatTimestamp(candidateMs)) {
          olderComparableDateMs = candidateMs;
          break;
        }
      }
      const showDaySeparator =
        isValidChatTimestamp(itemDateMs) &&
        (olderComparableDateMs == null ||
          getChatDayKey(itemDateMs) !== getChatDayKey(olderComparableDateMs));
      const dayLabel = formatChatDayLabel(itemDateMs);

      if ('kind' in item && item.kind === 'sticker_group') {
        const head = item.messages[0]!;
        const runIds = new Set(item.messages.map((x) => x.id));
        const headIdx = messageIndexById.get(head.id) ?? -1;
        const tail = item.messages[item.messages.length - 1]!;
        const tailIdx = messageIndexById.get(tail.id) ?? headIdx;
        const groupOlder =
          headIdx >= 0 ? getNeighborOutsideRun(messages, tailIdx, 'older', runIds) : undefined;
        const groupNewer =
          headIdx >= 0 ? getNeighborOutsideRun(messages, headIdx, 'newer', runIds) : undefined;
        const isSelected = item.messages.some((m) => selectedMessageIdSet.has(m.id));
        const isHighlighted = item.messages.some((m) => m.id === highlightedMessageId);
        return (
          <StickerGroupMessageRow
            stickerGroupMessages={item.messages}
            chatId={chatId}
            isGroupChat={isGroupChat}
            currentUserId={currentUserId}
            repliedMessage={
              head.reply_to_id ? messageByIdRef.current.get(head.reply_to_id) ?? null : null
            }
            selectionMode={selectionMode}
            isSelected={isSelected}
            isHighlighted={isHighlighted}
            canSwipe={canSwipeReply(head)}
            onReply={() => onSwipeReply(head)}
            allowReactions={allowReactions}
            onToggleReaction={onToggleReaction}
            onPressMessage={onMessagePress}
            onLongPressMessage={onMessageLongPress}
            onForwardHeaderPress={onForwardHeaderPress}
            onReplyPreviewPress={onReplyPreviewPress}
            setContentRef={setContentRef}
            formatTime={formatTime}
            getMessageAuthorPresentation={getMessageAuthorPresentation}
            getMessageAuthorName={getMessageAuthorName}
            chatTheme={chatTheme}
            navigation={navigation}
            resolvedScheme={resolvedScheme}
            searchHighlightQuery={searchHighlightQuery}
            groupOlderAdjacent={groupOlder}
            groupNewerAdjacent={groupNewer}
            showDaySeparator={showDaySeparator}
            dayLabel={dayLabel}
          />
        );
      }
      const msg = item as Message;
      const msgIdxResolved = messageIndexById.get(msg.id);
      const msgIdx =
        msgIdxResolved !== undefined ? msgIdxResolved : messages.findIndex((m) => m.id === msg.id);
      const groupOlder =
        msgIdx >= 0 ? getGroupChainNeighbor(messages, msgIdx, 'older') : undefined;
      const groupNewer =
        msgIdx >= 0 ? getGroupChainNeighbor(messages, msgIdx, 'newer') : undefined;
      return (
        <MessageRow
          item={msg}
          chatId={chatId}
          isGroupChat={isGroupChat}
          currentUserId={currentUserId}
          repliedMessage={
            msg.reply_to_id ? messageByIdRef.current.get(msg.reply_to_id) ?? null : null
          }
          selectionMode={selectionMode}
          isSelected={selectedMessageIdSet.has(msg.id)}
          isHighlighted={highlightedMessageId === msg.id}
          canSwipe={canSwipeReply(msg)}
          onReply={() => onSwipeReply(msg)}
          allowReactions={allowReactions}
          onToggleReaction={onToggleReaction}
          onPressMessage={onMessagePress}
          onLongPressMessage={onMessageLongPress}
          onOpenAlbumMedia={handleOpenAlbumMedia}
          onForwardHeaderPress={onForwardHeaderPress}
          onReplyPreviewPress={onReplyPreviewPress}
          setContentRef={setContentRef}
          formatTime={formatTime}
          getMessageAuthorPresentation={getMessageAuthorPresentation}
          getMessageAuthorName={getMessageAuthorName}
          getDeletedPlaceholder={getDeletedPlaceholder}
          repliedVoiceBubbleWidth={repliedVoiceBubbleWidth}
          chatTheme={chatTheme}
          navigation={navigation}
          resolvedScheme={resolvedScheme}
          scrollTick={scrollTick}
          searchHighlightQuery={searchHighlightQuery}
          groupOlderAdjacent={groupOlder}
          groupNewerAdjacent={groupNewer}
          showDaySeparator={showDaySeparator}
          dayLabel={dayLabel}
          activeGroupCallRoomId={activeGroupCallRoomId}
          isUserInGroupCall={isUserInGroupCall}
          onJoinGroupCall={onJoinGroupCall}
        />
      );
    },
    [
      activeGroupCallRoomId,
      allowReactions,
      canSwipeReply,
      chatId,
      chatTheme,
      currentUserId,
      formatTime,
      getMessageAuthorPresentation,
      getDeletedPlaceholder,
      getMessageAuthorName,
      handleOpenAlbumMedia,
      highlightedMessageId,
      listRows,
      messageIndexById,
      searchHighlightQuery,
      isGroupChat,
      isUserInGroupCall,
      messages,
      navigation,
      onJoinGroupCall,
      onMessageLongPress,
      onForwardHeaderPress,
      onToggleReaction,
      onMessagePress,
      onReplyPreviewPress,
      onSwipeReply,
      repliedVoiceBubbleWidth,
      resolvedScheme,
      scrollTick,
      selectionMode,
      selectedMessageIdSet,
      setContentRef,
    ],
  );

  const keyExtractor = React.useCallback((row: ChatListRow) => {
    if ('kind' in row && row.kind === 'sticker_group') {
      return `sg:${row.messages.map((m) => m.id).join(':')}`;
    }
    return (row as Message).id;
  }, []);

  return (
    <Reanimated.View style={[styles.listWrap, listAnimatedStyle]}>
      <FlatList
        ref={listRef}
        key={chatId}
        data={listRows}
        keyExtractor={keyExtractor}
        inverted
        onScroll={handleListScroll}
        onMomentumScrollEnd={handleListScrollEnd}
        onScrollEndDrag={handleListScrollEnd}
        onContentSizeChange={recheckFabVisibility}
        scrollEventThrottle={48}
        onScrollToIndexFailed={onScrollToIndexFailed}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android' ? true : !activeVideoNoteVisible}
        initialNumToRender={activeVideoNoteVisible ? 16 : 12}
        maxToRenderPerBatch={Platform.OS === 'android' ? 4 : (activeVideoNoteVisible ? 14 : 6)}
        updateCellsBatchingPeriod={Platform.OS === 'android' ? 60 : (activeVideoNoteVisible ? 24 : 55)}
        windowSize={Platform.OS === 'android' ? 5 : (activeVideoNoteVisible ? 21 : 7)}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: contentPaddingTop },
        ]}
        renderItem={renderChatRow}
      />
      <ChatScrollToBottomButton
        visible={enableScrollFab && showScrollToBottom}
        bottom={scrollFabBottomOffset}
        onPress={scrollToBottom}
      />
      <AlbumMediaViewerModal state={albumViewerState} onClose={handleCloseAlbumViewer} />
    </Reanimated.View>
  );
}, (prev, next) => {
  return (
    prev.chatId === next.chatId &&
    prev.isGroupChat === next.isGroupChat &&
    prev.currentUserId === next.currentUserId &&
    prev.messages === next.messages &&
    prev.selectionMode === next.selectionMode &&
    prev.selectedMessageIdSet === next.selectedMessageIdSet &&
    prev.highlightedMessageId === next.highlightedMessageId &&
    prev.searchHighlightQuery === next.searchHighlightQuery &&
    prev.contentPaddingTop === next.contentPaddingTop &&
    prev.allowReactions === next.allowReactions &&
    prev.canSwipeReply === next.canSwipeReply &&
    prev.onSwipeReply === next.onSwipeReply &&
    prev.onToggleReaction === next.onToggleReaction &&
    prev.onMessagePress === next.onMessagePress &&
    prev.onMessageLongPress === next.onMessageLongPress &&
    prev.onForwardHeaderPress === next.onForwardHeaderPress &&
    prev.onReplyPreviewPress === next.onReplyPreviewPress &&
    prev.setContentRef === next.setContentRef &&
    prev.onScrollToIndexFailed === next.onScrollToIndexFailed &&
    prev.formatTime === next.formatTime &&
    prev.getMessageAuthorPresentation === next.getMessageAuthorPresentation &&
    prev.getMessageAuthorName === next.getMessageAuthorName &&
    prev.getDeletedPlaceholder === next.getDeletedPlaceholder &&
    prev.repliedVoiceBubbleWidth === next.repliedVoiceBubbleWidth &&
    prev.chatTheme === next.chatTheme &&
    prev.activeVideoNoteVisible === next.activeVideoNoteVisible &&
    prev.scrollFabBottomOffset === next.scrollFabBottomOffset &&
    prev.enableScrollFab === next.enableScrollFab
  );
});

const styles = StyleSheet.create({
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  messagePressable: {
    width: '100%',
  },
  messageRowShell: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  selectionIndicatorSlot: {
    width: 38,
    paddingLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicatorActive: {
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.96)',
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  selectionIndicatorIdle: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.8,
    borderColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  messageCardColumn: {
    flex: 1,
    minWidth: 0,
  },
  messageWrap: {
    paddingHorizontal: 12,
    marginVertical: 4,
    width: '100%',
  },
  messageWrapSelection: {
    paddingLeft: 2,
  },
  messageWrapMe: {
    alignItems: 'flex-end',
  },
  messageWrapOther: {
    alignItems: 'flex-start',
  },
  messageWrapService: {
    alignItems: 'center',
  },
  groupIncomingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '100%',
    minWidth: 0,
  },
  groupAvatarSlot: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
    flexShrink: 0,
  },
  groupAvatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  groupAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarInitial: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  messageContentMeasure: {
    flexShrink: 1,
  },
  groupIncomingContent: {
    minWidth: 0,
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
  authorLabelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 4,
    maxWidth: '100%',
  },
  authorLabelRowOutgoingGroup: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  authorLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  authorTagChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 140,
  },
  authorTagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
  },
  /** Групповой входящий пузырь: ширина по контенту с лимитом из `bubble` (86%), не на всю колонку. */
  groupMessageSurface: {
    alignSelf: 'flex-start',
  },
  /** Ограничение как у текстового бабла — короткий `chatus://c/x` не должен сжимать превью. */
  channelLinkOuter: {
    maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
  },
  bubbleMe: {
    backgroundColor: colors.bubbleMe,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.bubbleOtherBorder,
  },
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
  textContentMe: {
    color: '#fff',
  },
  mediaStack: {
    maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
  },
  videoNoteHeaderBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 4,
  },
  albumBubble: {
    maxWidth: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  albumBubbleMe: {
    alignSelf: 'flex-end',
  },
  albumBubbleOther: {
    alignSelf: 'flex-start',
  },
  albumGridClip: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#D8DEE7',
  },
  albumRow: {
    flexDirection: 'row',
    gap: 1.5,
  },
  albumColumn: {
    gap: 1.5,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1.5,
  },
  albumTile: {
    overflow: 'hidden',
    backgroundColor: '#C8D0DC',
  },
  albumImage: {
    width: '100%',
    height: '100%',
  },
  albumVideoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minHeight: 20,
    borderRadius: 999,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.68)',
  },
  albumVideoDuration: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  albumTimeOverlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  albumExtraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
  albumExtraText: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  albumCaptionWrap: {
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 6,
  },
  albumCaptionMe: {
    backgroundColor: colors.bubbleMe,
  },
  albumCaptionOther: {
    backgroundColor: colors.bubbleOther,
  },
  albumCaptionText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerTopBarAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    minHeight: 86,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  viewerSwipeable: {
    flex: 1,
  },
  viewerFlatList: {
    flex: 1,
  },
  viewerCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  viewerCounter: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewerTopSpacer: {
    width: 44,
    height: 44,
  },
  viewerSlide: {
    width: SCREEN_WIDTH,
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerBottomBar: {
    minHeight: 82,
    backgroundColor: '#000000',
  },
  groupRepliedMediaBubble: {
    maxWidth: '100%',
  },
  fileStack: {
    width: FILE_ROW_WIDTH,
    minWidth: 0,
    maxWidth: '100%',
  },
  groupFileStack: {
    maxWidth: '100%',
  },
  repliedMediaBubble: {
    maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  repliedMediaBubbleMe: {
    backgroundColor: colors.bubbleMe,
    ...bubbleRadius.mine,
  },
  repliedMediaBubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.bubbleOtherBorder,
    ...bubbleRadius.other,
  },
  deletedBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: CHAT_BUBBLE_MAX_WIDTH_PCT,
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
});
