import React, { useRef } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Animated,
  Dimensions,
  FlatList,
  FlatListProps,
  Image as RNImage,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Message } from '../stores/types';
import { bubbleRadius, colors, withAlpha } from '../theme/colors';
import type { ChatTheme } from '../theme/chatThemes';
import { FileBubble } from './FileBubble';
import { ForwardHeader } from './ForwardHeader';
import { ImageBubble } from './ImageBubble';
import { MessageTimeStatus } from './MessageTimeStatus';
import {
  ReplyPreview,
  buildReplyPreviewText,
  getReplyPreviewThumbnailUri,
} from './ReplyPreview';
import { VideoBubble } from './VideoBubble';
import { VideoNoteBubble } from './VideoNoteBubble';
import { VoiceBubble } from './VoiceBubble';
import { MessageReactionInline } from './MessageReactionInline';
import { resolveAvatarUrl, resolveMediaUrl } from '../config';
import { resolveVoiceMessageUri } from '../utils/messageMediaUri';
import {
  type MessageAuthorPresentation,
  resolveForwardedSenderAvatarUrl,
} from '../screens/chatScreen.shared';
import { DOUBLE_TAP_REACTION_EMOJI } from './ChatContextMenuOverlay';
import { formatMediaDuration } from '../utils/mediaDuration';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { ChannelLinkRichMessage } from './ChannelLinkRichMessage';
import { parseChannelDeepLinkFromMessage } from '../utils/channelDeepLink';
import { useTheme } from '../contexts/ThemeContext';
import type { ResolvedColorScheme } from '../theme/palettes';
import {
  MeBubbleChrome,
  shouldUseDarkDefaultOutgoingBubbleGradient,
} from './OutgoingBubbleViewportGradient';

const REPLY_SWIPE_TRIGGER = 34;
const REPLY_SWIPE_MAX = 72;
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Same threshold as ChatProfileMediaViewerModal — vertical swipe closes the viewer. */
const ALBUM_VIEWER_CLOSE_SWIPE_DISTANCE = 84;
const FILE_ROW_WIDTH = Math.min(Dimensions.get('window').width * 0.76, 320);
const ALBUM_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 280);

function clampReplySwipe(value: number) {
  'worklet';
  return Math.max(-REPLY_SWIPE_MAX, Math.min(0, value));
}

type ChatMessageListProps = {
  chatId: string;
  isGroupChat: boolean;
  currentUserId: string | null;
  messages: Message[];
  selectionMode: boolean;
  selectedMessageIdSet: Set<string>;
  highlightedMessageId: string | null;
  listRef: React.RefObject<FlatList<Message> | null>;
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
  onScrollToIndexFailed?: FlatListProps<Message>['onScrollToIndexFailed'];
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
};

type ReplySwipeWrapperProps = {
  enabled: boolean;
  onReply: () => void;
  children: React.ReactNode;
};

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
    const uri = resolveMediaUrl(rawUri?.trim() ?? null) ?? rawUri ?? '';
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
        <Image source={{ uri }} style={styles.albumImage} contentFit="cover" cachePolicy="disk" transition={100} />
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
            keyExtractor={(item, index) => `${item.remote_url ?? item.thumbnail_url ?? 'media'}-${index}`}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={state?.initialIndex ?? 0}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
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
            renderItem={({ item }) => {
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
            }}
          />

          <View style={[styles.viewerBottomBar, { paddingBottom: insets.bottom + 18 }]} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const ReplySwipeWrapper = React.memo(function ReplySwipeWrapper({
  enabled,
  onReply,
  children,
}: ReplySwipeWrapperProps) {
  const translateX = useSharedValue(0);
  const hasTriggered = useSharedValue(false);
  const triggerPop = useSharedValue(0);

  const gesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(-12)
    .failOffsetY([-12, 12])
    .onBegin(() => {
      hasTriggered.value = false;
    })
    .onUpdate((event) => {
      if (event.translationX > 0) {
        translateX.value = 0;
        return;
      }

      const nextX = clampReplySwipe(event.translationX);
      translateX.value = nextX;

      if (!hasTriggered.value && nextX <= -REPLY_SWIPE_TRIGGER) {
        hasTriggered.value = true;
        triggerPop.value = withSequence(
          withTiming(1, { duration: 70 }),
          withTiming(0, { duration: 120 })
        );
        runOnJS(onReply)();
      }
    })
    .onFinalize(() => {
      translateX.value = withTiming(0, { duration: 140 });
      hasTriggered.value = false;
    });

  const contentStyle = useAnimatedStyle(() => {
    const scale = interpolate(triggerPop.value, [0, 1], [1, 0.985], Extrapolation.CLAMP);

    return {
      transform: [{ translateX: translateX.value }, { scale }] as const,
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const progress = Math.abs(translateX.value) / REPLY_SWIPE_TRIGGER;
    const opacity = interpolate(progress, [0, 0.3, 1], [0, 0.45, 1], Extrapolation.CLAMP);
    const baseScale = interpolate(progress, [0, 1], [0.84, 1], Extrapolation.CLAMP);
    const scaleBoost = interpolate(triggerPop.value, [0, 1], [0, 0.18], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ scale: baseScale + scaleBoost }],
    };
  });

  if (!enabled) {
    return <View style={styles.replyGestureContainer}>{children}</View>;
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.replyGestureContainer}>
        <Reanimated.View style={[styles.replySwipeAction, iconStyle]}>
          <View style={styles.replySwipeIconWrap}>
            <Feather name="corner-left-up" size={18} color={colors.accent} />
          </View>
        </Reanimated.View>
        <Reanimated.View style={[styles.replyGestureContent, contentStyle]}>
          {children}
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
});

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
};

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

function messageRowUsesDarkDefaultOutgoingGradient(p: MessageRowProps): boolean {
  return (
    p.item.sender_id === p.currentUserId &&
    p.item.is_deleted !== 1 &&
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
}: MessageRowProps) {
  const lastTapAtRef = useRef(0);
  const { colors: themeColors } = useTheme();
  const isMe = item.sender_id === currentUserId;
  const useViewportOutgoingGradient =
    isMe &&
    item.is_deleted !== 1 &&
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
  const showAuthorName = isGroupChat && !isMe && item.is_deleted !== 1;
  const showAuthorAvatar = isGroupChat && !isMe;
  const showOwnGroupAuthorTag =
    isGroupChat &&
    isMe &&
    item.is_deleted !== 1 &&
    !!(authorPresentation.tag?.trim() ?? '');
  const inlineReactionList =
    selectionMode || !(item.reactions?.length ?? 0) ? undefined : item.reactions;
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

  const renderReplySnippet = () => {
    if (!item.reply_to_id) return null;

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
            ? chatTheme.replyBubbleMe
            : resolvedScheme === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : '#F2F4D9'
        }
        textColor={
          isMe ? chatTheme.replyTextMe : resolvedScheme === 'dark' ? themeColors.textSecondary : '#5F6368'
        }
        authorColor={isMe ? chatTheme.replyAuthorMe : resolvedScheme === 'dark' ? themeColors.accent : '#D1782B'}
        thumbnailUri={replyThumbnailUri}
        onPress={onReplyPreviewPress ? () => onReplyPreviewPress(item.reply_to_id!) : undefined}
      />
    );
  };

  const renderForwardHeader = (options?: { compact?: boolean; forceLightText?: boolean }) => {
    if (!item.forwarded_from_name && !item.forwarded_from_message_id) {
      return null;
    }

    const rawAvatar = resolveForwardedSenderAvatarUrl(
      item.forwarded_from_sender_id,
      item.forwarded_from_chat_id
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
        name={item.forwarded_from_name}
        avatarUri={avatarUri ?? undefined}
        labelColor={labelColor}
        titleColor={titleColor}
        compact={options?.compact}
        onPress={onForwardHeaderPress ? () => onForwardHeaderPress(item) : undefined}
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

  /** В группе для своих сообщений — имя + тег над баблом (если тег задан на сервере). */
  const renderOwnGroupAuthorLabel = (options?: { forceLightText?: boolean }) => {
    if (!showOwnGroupAuthorTag) return null;
    const tag = (authorPresentation.tag ?? '').trim();
    const tagPalette = getAuthorTagStyle(authorPresentation.tagColor);

    return (
      <View style={[styles.authorLabelRow, styles.authorLabelRowOutgoingGroup]}>
        <Text
          style={[
            styles.authorLabel,
            options?.forceLightText ? { color: '#FFFFFF' } : { color: chatTheme.bubbleMeText }
          ]}
          numberOfLines={1}
        >
          {authorName}
        </Text>
        <View style={[styles.authorTagChip, { backgroundColor: tagPalette.bubble }]}>
          <Text style={[styles.authorTagText, { color: tagPalette.text }]} numberOfLines={1}>
            {tag}
          </Text>
        </View>
      </View>
    );
  };

  const renderIncomingHeader = (options?: { suppressForwardHeader?: boolean; forceLightText?: boolean }) => {
    if (isMe) {
      const forward = options?.suppressForwardHeader ? null : renderForwardHeader(options);
      const ownTagRow = renderOwnGroupAuthorLabel(options);
      if (!ownTagRow && !forward) return null;
      return (
        <>
          {ownTagRow}
          {forward}
        </>
      );
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
            showAuthorAvatar && styles.groupMessageSurface,
            isMe ? styles.deletedBubbleMe : null,
            isMe
              ? { backgroundColor: chatTheme.deletedBubbleMe }
              : {
                  backgroundColor: themeColors.bubbleOther,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: themeColors.bubbleOtherBorder,
                },
          ]}
        >
          <Text
            style={[
              styles.deletedText,
              isMe && styles.deletedTextMe,
              isMe ? { color: chatTheme.deletedTextMe } : { color: themeColors.textSecondary },
            ]}
          >
            {getDeletedPlaceholder(isMe)}
          </Text>
          <MessageTimeStatus
            time={formatTime(item.created_at)}
            status={item.status}
            isMe={isMe}
            compact
            timeColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
            iconColor={isMe ? chatTheme.bubbleMeMeta : themeColors.textSecondary}
          />
        </View>
      );
    }

    if (item.msg_type === 'text') {
      const rawContent = item.content ?? '';
      const displayContent = rawContent.trim() || ' ';
      const channelLink = parseChannelDeepLinkFromMessage(rawContent);

      if (channelLink) {
        return (
          <View
            style={[
              styles.channelLinkOuter,
              showAuthorAvatar && styles.groupMessageSurface,
            ]}
          >
            {renderIncomingHeader()}
            {renderReplySnippet()}
            <ChannelLinkRichMessage
              parsed={channelLink}
              rawUrlLine={displayContent}
              isMe={isMe}
              time={formatTime(item.created_at)}
              status={item.status}
              navigation={navigation}
              chatTheme={chatTheme}
              useViewportOutgoingGradient={useViewportOutgoingGradient}
              scrollTick={scrollTick}
            />
            {inlineReactionList?.length ? (
              <MessageReactionInline
                reactions={inlineReactionList}
                isMe={isMe}
                allowReactions={allowReactions}
                onToggle={(emoji) => onToggleReaction(item.id, emoji)}
                accentColor={chatTheme.bubbleMeAccent}
              />
            ) : null}
          </View>
        );
      }

      if (!isMe) {
        return (
          <View
            style={[
              styles.bubble,
              showAuthorAvatar && styles.groupMessageSurface,
              styles.bubbleOther,
              {
                backgroundColor: themeColors.bubbleOther,
                borderColor: themeColors.bubbleOtherBorder,
              },
            ]}
          >
            {renderIncomingHeader()}
            {renderReplySnippet()}
            <View style={styles.bubbleContentRow}>
              <Text style={[styles.textContent, { color: themeColors.textPrimary }]}>{displayContent}</Text>
              <MessageTimeStatus
                time={formatTime(item.created_at)}
                status={item.status}
                isMe={isMe}
                compact
                timeColor={themeColors.textSecondary}
                iconColor={themeColors.textSecondary}
              />
            </View>
            {inlineReactionList?.length ? (
              <MessageReactionInline
                reactions={inlineReactionList}
                isMe={isMe}
                allowReactions={allowReactions}
                onToggle={(emoji) => onToggleReaction(item.id, emoji)}
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
            showAuthorAvatar && styles.groupMessageSurface,
            !useViewportOutgoingGradient ? styles.bubbleMe : null,
          ]}
        >
          {renderIncomingHeader()}
          {renderReplySnippet()}
          <View style={styles.bubbleContentRow}>
            <Text
              style={[
                styles.textContent,
                styles.textContentMe,
                { color: chatTheme.bubbleMeText },
              ]}
            >
              {displayContent}
            </Text>
            <MessageTimeStatus
              time={formatTime(item.created_at)}
              status={item.status}
              isMe
              compact
              timeColor={chatTheme.bubbleMeMeta}
              iconColor={chatTheme.bubbleMeMeta}
            />
          </View>
          {inlineReactionList?.length ? (
            <MessageReactionInline
              reactions={inlineReactionList}
              isMe
              allowReactions={allowReactions}
              onToggle={(emoji) => onToggleReaction(item.id, emoji)}
              accentColor={chatTheme.bubbleMeAccent}
            />
          ) : null}
        </MeBubbleChrome>
      );
    }

    if (item.msg_type === 'voice' && item.media?.[0]) {
      const replySnippet = renderReplySnippet();
      const topHeader = replySnippet ? null : renderIncomingHeader();
      const voiceUri =
        resolveVoiceMessageUri(item) ?? item.media[0].remote_url ?? `file://${item.id}`;
      const voiceContent = (
        <VoiceBubble
          uri={voiceUri}
          waveform={item.media[0].waveform ?? []}
          durationMs={item.media[0].duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          reactionAccentColor={chatTheme.bubbleMeAccent}
          inlineReactions={inlineReactionList}
          allowMessageReactions={allowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(item.id, emoji)}
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
                { width: repliedVoiceBubbleWidth, maxWidth: showAuthorAvatar ? '100%' : '82%' },
                showAuthorAvatar && styles.groupMessageSurface,
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
                { width: repliedVoiceBubbleWidth, maxWidth: showAuthorAvatar ? '100%' : '82%' },
                showAuthorAvatar && styles.groupMessageSurface,
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
              { width: repliedVoiceBubbleWidth, maxWidth: showAuthorAvatar ? '100%' : '82%' },
              showAuthorAvatar && styles.groupMessageSurface,
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
            showAuthorAvatar && styles.groupMessageSurface,
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

    if (item.msg_type === 'video_note' && item.media?.[0]) {
      const media = item.media[0];
      const videoUri = media.remote_url?.trim() ?? '';
      if (!videoUri) return null;

      const replySnippet = renderReplySnippet();
      
      let topHeaderRaw = replySnippet
        ? null
        : renderIncomingHeader({ forceLightText: true });

      let topHeader = null;
      if (topHeaderRaw) {
        topHeader = (
          <View style={styles.videoNoteHeaderBadge}>
            {topHeaderRaw}
          </View>
        );
      }

      const videoContent = (
        <VideoNoteBubble
          messageId={item.id}
          uri={videoUri}
          thumbnailUri={media.thumbnail_url ?? undefined}
          durationMs={media.duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
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
          allowMessageReactions={allowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(item.id, emoji)}
        />
      );

      if (replySnippet) {
        if (!isMe) {
          return (
            <View
              style={[
                styles.repliedMediaBubble,
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
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
            showAuthorAvatar && styles.groupMessageSurface,
          ]}
        >
          {videoContent}
        </View>
      );
    }

    const visualMediaCount =
      item.msg_type === 'image' || item.msg_type === 'video'
        ? item.media?.filter((media) => media.remote_url?.trim()).length ?? 0
        : 0;

    if (visualMediaCount > 1) {
      const replySnippet = renderReplySnippet();
      const albumContent = (
        <MediaAlbumBubble
          message={item}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          chatTheme={chatTheme}
          onOpenMedia={onOpenAlbumMedia}
          inlineReactions={inlineReactionList}
          allowMessageReactions={allowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(item.id, emoji)}
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
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
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
            showAuthorAvatar && styles.groupMessageSurface,
          ]}
        >
          {albumContent}
        </View>
      );
    }

    if (item.msg_type === 'image') {
      const media = item.media?.[0];
      const rawImage = media?.remote_url ?? '';
      const imageUri = resolveMediaUrl(rawImage.trim() || null) ?? rawImage;
      if (!imageUri.trim()) return null;

      const replySnippet = renderReplySnippet();
      const topHeader = replySnippet ? null : renderIncomingHeader();
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
          header={topHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          reactionAccentColor={chatTheme.bubbleMeAccent}
          inlineReactions={inlineReactionList}
          allowMessageReactions={allowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(item.id, emoji)}
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
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
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
            showAuthorAvatar && styles.groupMessageSurface,
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

    if (item.msg_type === 'video') {
      const media = item.media?.[0];
      const rawVideo = media?.remote_url ?? '';
      const videoUri = resolveMediaUrl(rawVideo.trim() || null) ?? rawVideo;
      if (!videoUri.trim()) return null;

      const replySnippet = renderReplySnippet();
      const topHeader = replySnippet ? null : renderIncomingHeader();
      const thumbResolved = media?.thumbnail_url
        ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
        : undefined;
      const videoContent = (
        <VideoBubble
          uri={videoUri}
          thumbnailUri={thumbResolved}
          isMe={isMe}
          width={media?.width}
          height={media?.height}
          durationMs={media?.duration_ms ?? 0}
          caption={item.content ?? undefined}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          reactionAccentColor={chatTheme.bubbleMeAccent}
          inlineReactions={inlineReactionList}
          allowMessageReactions={allowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(item.id, emoji)}
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
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
                showAuthorAvatar && styles.groupMessageSurface,
                showAuthorAvatar && styles.groupRepliedMediaBubble,
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
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
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
            showAuthorAvatar && styles.groupMessageSurface,
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

    if (item.msg_type === 'file' && item.media?.[0]) {
      const replySnippet = renderReplySnippet();
      const rawFile = item.media[0].remote_url ?? '';
      const fileUri =
        rawFile.trim().length > 0
          ? resolveMediaUrl(rawFile) ?? rawFile
          : undefined;
      const fileBubbleEl = (
        <FileBubble
          fileName={item.media[0].file_name ?? 'File'}
          fileSize={item.media[0].file_size}
          uri={fileUri}
          isMe={isMe}
          caption={item.content ?? undefined}
          time={formatTime(item.created_at)}
          status={item.status}
          header={renderIncomingHeader()}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor={chatTheme.bubbleMeText}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          reactionAccentColor={chatTheme.bubbleMeAccent}
          inlineReactions={inlineReactionList}
          allowMessageReactions={allowReactions}
          onToggleInlineReaction={(emoji) => onToggleReaction(item.id, emoji)}
          incomingBubbleBackground={!isMe ? themeColors.bubbleOther : undefined}
          incomingBubbleBorderColor={!isMe ? themeColors.bubbleOtherBorder : undefined}
          incomingFileNameColor={!isMe ? themeColors.textPrimary : undefined}
          incomingSecondaryTextColor={!isMe ? themeColors.textSecondary : undefined}
          incomingCaptionColor={!isMe ? themeColors.textPrimary : undefined}
        />
      );

      return (
        <View
          style={[
            styles.fileStack,
            showAuthorAvatar && styles.groupFileStack,
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

  const card = (
    <Pressable
      delayLongPress={220}
      onPress={() => {
        if (selectionMode) {
          onPressMessage(item.id);
          return;
        }
        if (!allowReactions || item.is_deleted === 1) return;
        const now = Date.now();
        if (now - lastTapAtRef.current < 380) {
          lastTapAtRef.current = 0;
          onToggleReaction(item.id, DOUBLE_TAP_REACTION_EMOJI);
          return;
        }
        lastTapAtRef.current = now;
      }}
      onLongPress={selectionMode ? undefined : () => onLongPressMessage(item)}
      style={styles.messagePressable}
    >
      <View style={styles.messageRowShell}>
        {selectionMode ? (
          <View style={styles.selectionIndicatorSlot}>
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
          </View>
        ) : null}

        <View style={styles.messageCardColumn}>
          <View
            style={[
              styles.messageWrap,
              selectionMode && styles.messageWrapSelection,
              isMe ? styles.messageWrapMe : styles.messageWrapOther,
            ]}
          >
            {showAuthorAvatar ? (
              <View style={styles.groupIncomingRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Профиль: ${authorName}`}
                  hitSlop={10}
                  onPress={() => {
                    navigation.navigate('ChatProfile', {
                      chatId,
                      userId: item.sender_id,
                    });
                  }}
                  style={styles.groupAvatarSlot}
                >
                  {authorAvatarUri ? (
                    <Image source={{ uri: authorAvatarUri }} style={styles.groupAvatarImage} contentFit="cover" cachePolicy="disk" />
                  ) : (
                    <View style={[styles.groupAvatarFallback, { backgroundColor: authorColor }]}>
                      <Text style={styles.groupAvatarInitial}>{authorPresentation.initial}</Text>
                    </View>
                  )}
                </Pressable>
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
              </View>
            ) : (
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
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );

  if (!shouldUseOuterReplySwipe) {
    return card;
  }

  return (
    <ReplySwipeWrapper enabled onReply={onReply}>
      {card}
    </ReplySwipeWrapper>
  );
}, (prev, next) => {
  const scrollOk =
    prev.scrollTick === next.scrollTick ||
    (!messageRowUsesDarkDefaultOutgoingGradient(prev) &&
      !messageRowUsesDarkDefaultOutgoingGradient(next));
  return (
    scrollOk &&
    prev.item === next.item &&
    prev.repliedMessage === next.repliedMessage &&
    prev.isGroupChat === next.isGroupChat &&
    prev.selectionMode === next.selectionMode &&
    prev.isSelected === next.isSelected &&
    prev.isHighlighted === next.isHighlighted &&
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
    prev.onToggleReaction === next.onToggleReaction
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

  const messageByIdInternal = React.useMemo(() => {
    const m = new Map<string, Message>();
    for (const msg of messages) {
      m.set(msg.id, msg);
    }
    return m;
  }, [messages]);
  const messageByIdRef = React.useRef(messageByIdInternal);
  messageByIdRef.current = messageByIdInternal;

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

  const renderMessageRow = React.useCallback(({ item }: { item: Message }) => (
    <MessageRow
      item={item}
      chatId={chatId}
      isGroupChat={isGroupChat}
      currentUserId={currentUserId}
      repliedMessage={
        item.reply_to_id ? messageByIdRef.current.get(item.reply_to_id) ?? null : null
      }
      selectionMode={selectionMode}
      isSelected={selectedMessageIdSet.has(item.id)}
      isHighlighted={highlightedMessageId === item.id}
      canSwipe={canSwipeReply(item)}
      onReply={() => onSwipeReply(item)}
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
    />
  ), [
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
    isGroupChat,
    navigation,
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
  ]);

  const keyExtractor = React.useCallback((message: Message) => message.id, []);

  return (
    <Reanimated.View style={[styles.listWrap, listAnimatedStyle]}>
      <FlatList
        ref={listRef}
        key={chatId}
        data={messages}
        keyExtractor={keyExtractor}
        inverted
        onScroll={bumpScrollTickThrottled}
        onMomentumScrollEnd={bumpScrollTickImmediate}
        onScrollEndDrag={bumpScrollTickImmediate}
        scrollEventThrottle={48}
        onScrollToIndexFailed={onScrollToIndexFailed}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={!activeVideoNoteVisible}
        initialNumToRender={activeVideoNoteVisible ? 16 : 10}
        maxToRenderPerBatch={activeVideoNoteVisible ? 14 : 6}
        updateCellsBatchingPeriod={activeVideoNoteVisible ? 24 : 55}
        windowSize={activeVideoNoteVisible ? 21 : 7}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: contentPaddingTop },
        ]}
        renderItem={renderMessageRow}
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
    prev.activeVideoNoteVisible === next.activeVideoNoteVisible
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
  messageWrapSelection: {
    paddingLeft: 2,
  },
  messageWrapMe: {
    alignItems: 'flex-end',
  },
  messageWrapOther: {
    alignItems: 'flex-start',
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
    maxWidth: '82%',
  },
  groupMessageSurface: {
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  /** Ограничение как у текстового бабла — короткий `chatus://c/x` не должен сжимать превью. */
  channelLinkOuter: {
    maxWidth: '82%',
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
    maxWidth: '82%',
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
    maxWidth: '82%',
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
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
