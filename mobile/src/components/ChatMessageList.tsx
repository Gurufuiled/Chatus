import React, { useRef } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Dimensions,
  FlatList,
  FlatListProps,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { bubbleRadius, colors } from '../theme/colors';
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
import { resolveAvatarUrl } from '../config';
import { DOUBLE_TAP_REACTION_EMOJI } from './ChatContextMenuOverlay';
import { formatMediaDuration } from '../utils/mediaDuration';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { ChannelLinkRichMessage } from './ChannelLinkRichMessage';
import { parseChannelDeepLinkFromMessage } from '../utils/channelDeepLink';

const REPLY_SWIPE_TRIGGER = 34;
const REPLY_SWIPE_MAX = 72;
const SCREEN_WIDTH = Dimensions.get('window').width;
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
  messageById: Map<string, Message>;
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
  ) => { name: string; avatarUrl: string | null; color: string; initial: string };
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
}: {
  message: Message;
  isMe: boolean;
  time: string;
  status: string;
  chatTheme: ChatTheme;
  onOpenMedia?: (media: VisualMediaItem[], index: number) => void;
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
    const uri = kind === 'video' ? item.thumbnail_url || item.remote_url : item.remote_url;
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
        <Image source={{ uri }} style={styles.albumImage} resizeMode="cover" />
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

  return (
    <View style={[styles.albumBubble, isMe ? styles.albumBubbleMe : styles.albumBubbleOther]}>
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
              ? [styles.albumCaptionMe, { backgroundColor: chatTheme.bubbleMe }]
              : styles.albumCaptionOther,
          ]}
        >
          <Text
            style={[
              styles.albumCaptionText,
              isMe ? { color: chatTheme.bubbleMeText } : null,
            ]}
          >
            {caption}
          </Text>
          <MessageTimeStatus
            time={time}
            status={status}
            isMe={isMe}
            compact
            timeColor={isMe ? chatTheme.bubbleMeMeta : undefined}
            iconColor={isMe ? chatTheme.bubbleMeMeta : undefined}
          />
        </View>
      ) : null}
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
  const media = state?.media ?? [];

  React.useEffect(() => {
    setActiveIndex(state?.initialIndex ?? 0);
    if (!state) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: state.initialIndex,
        animated: false,
      });
    });
  }, [state]);

  return (
    <Modal
      visible={state != null}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.viewerRoot}>
        <View style={[styles.viewerTopBar, { paddingTop: insets.top + 10 }]}>
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

        <FlatList
          ref={listRef}
          data={media}
          keyExtractor={(item, index) => `${item.remote_url ?? item.thumbnail_url ?? 'media'}-${index}`}
          horizontal
          pagingEnabled
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
            const uri = item.remote_url?.trim() || item.thumbnail_url?.trim() || '';
            return (
              <View style={styles.viewerSlide}>
                {uri ? (
                  <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
                ) : null}
              </View>
            );
          }}
        />

        <View style={[styles.viewerBottomBar, { paddingBottom: insets.bottom + 18 }]} />
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
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
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
  ) => { name: string; avatarUrl: string | null; color: string; initial: string };
  getMessageAuthorName: (message: Message, chatId: string, currentUserId: string | null) => string;
  getDeletedPlaceholder: (isMe: boolean) => string;
  repliedVoiceBubbleWidth: number;
  chatTheme: ChatTheme;
};

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
}: MessageRowProps) {
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const lastTapAtRef = useRef(0);
  const isMe = item.sender_id === currentUserId;
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
        backgroundColor={isMe ? chatTheme.replyBubbleMe : '#F2F4D9'}
        textColor={isMe ? chatTheme.replyTextMe : '#5F6368'}
        authorColor={isMe ? chatTheme.replyAuthorMe : '#D1782B'}
        thumbnailUri={replyThumbnailUri}
        onPress={onReplyPreviewPress ? () => onReplyPreviewPress(item.reply_to_id!) : undefined}
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
        meColor={chatTheme.forwardHeaderMe}
        onPress={onForwardHeaderPress ? () => onForwardHeaderPress(item) : undefined}
      />
    );
  };

  const renderAuthorLabel = () => {
    if (!showAuthorName) return null;

    return (
      <Text style={[styles.authorLabel, { color: authorColor }]} numberOfLines={1}>
        {authorName}
      </Text>
    );
  };

  const renderIncomingHeader = (options?: { suppressForwardHeader?: boolean }) => {
    if (isMe) {
      return options?.suppressForwardHeader ? null : renderForwardHeader();
    }

    const authorLabel = renderAuthorLabel();
    const forwardHeader = options?.suppressForwardHeader ? null : renderForwardHeader();

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
            isMe ? styles.deletedBubbleMe : styles.deletedBubbleOther,
            isMe ? { backgroundColor: chatTheme.deletedBubbleMe } : null,
          ]}
        >
          <Text
            style={[
              styles.deletedText,
              isMe && styles.deletedTextMe,
              isMe ? { color: chatTheme.deletedTextMe } : null,
            ]}
          >
            {getDeletedPlaceholder(isMe)}
          </Text>
          <MessageTimeStatus
            time={formatTime(item.created_at)}
            status={item.status}
            isMe={isMe}
            compact
            timeColor={isMe ? chatTheme.bubbleMeMeta : undefined}
            iconColor={isMe ? chatTheme.bubbleMeMeta : undefined}
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
            />
          </View>
        );
      }

      return (
        <View
          style={[
            styles.bubble,
            showAuthorAvatar && styles.groupMessageSurface,
            isMe ? styles.bubbleMe : styles.bubbleOther,
            isMe ? { backgroundColor: chatTheme.bubbleMe } : null,
          ]}
        >
          {renderIncomingHeader()}
          {renderReplySnippet()}
          <View style={styles.bubbleContentRow}>
            <Text
              style={[
                styles.textContent,
                isMe && styles.textContentMe,
                isMe ? { color: chatTheme.bubbleMeText } : null,
              ]}
            >
              {displayContent}
            </Text>
            <MessageTimeStatus
              time={formatTime(item.created_at)}
              status={item.status}
              isMe={isMe}
              compact
              timeColor={isMe ? chatTheme.bubbleMeMeta : undefined}
              iconColor={isMe ? chatTheme.bubbleMeMeta : undefined}
            />
          </View>
        </View>
      );
    }

    if (item.msg_type === 'voice' && item.media?.[0]) {
      const replySnippet = renderReplySnippet();
      const topHeader = replySnippet ? null : renderIncomingHeader();
      const voiceContent = (
        <VoiceBubble
          uri={item.media[0].remote_url ?? `file://${item.id}`}
          waveform={item.media[0].waveform ?? []}
          durationMs={item.media[0].duration_ms ?? 0}
          isMe={isMe}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={chatTheme.bubbleMe}
          outgoingTextColor={chatTheme.bubbleMeText}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              { width: repliedVoiceBubbleWidth, maxWidth: showAuthorAvatar ? '100%' : '82%' },
              showAuthorAvatar && styles.groupMessageSurface,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              isMe ? { backgroundColor: chatTheme.bubbleMe } : null,
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
          {voiceContent}
        </View>
      );
    }

    if (item.msg_type === 'video_note' && item.media?.[0]) {
      const media = item.media[0];
      const videoUri = media.remote_url?.trim() ?? '';
      if (!videoUri) return null;

      const replySnippet = renderReplySnippet();
      const topHeader = replySnippet ? null : renderIncomingHeader();
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
          bubbleMeColor={chatTheme.bubbleMe}
          outgoingMetaColor={chatTheme.bubbleMeMeta}
          outgoingAccentColor={chatTheme.bubbleMeAccent}
          enableReplySwipe={canSwipe}
          onReplySwipe={onReply}
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              isMe ? { backgroundColor: chatTheme.bubbleMe } : null,
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
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              isMe ? { backgroundColor: chatTheme.bubbleMe } : null,
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
      const imageUri = media?.remote_url ?? '';
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
          bubbleMeColor={chatTheme.bubbleMe}
          outgoingTextColor={chatTheme.bubbleMeText}
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              isMe ? { backgroundColor: chatTheme.bubbleMe } : null,
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
          {imageContent}
        </View>
      );
    }

    if (item.msg_type === 'video') {
      const media = item.media?.[0];
      const videoUri = media?.remote_url ?? '';
      if (!videoUri.trim()) return null;

      const replySnippet = renderReplySnippet();
      const topHeader = replySnippet ? null : renderIncomingHeader();
      const videoContent = (
        <VideoBubble
          uri={videoUri}
          thumbnailUri={media?.thumbnail_url ?? undefined}
          isMe={isMe}
          width={media?.width}
          height={media?.height}
          durationMs={media?.duration_ms ?? 0}
          caption={item.content ?? undefined}
          time={formatTime(item.created_at)}
          status={item.status}
          embedded={!!replySnippet}
          header={topHeader}
          bubbleMeColor={chatTheme.bubbleMe}
          outgoingTextColor={chatTheme.bubbleMeText}
        />
      );

      if (replySnippet) {
        return (
          <View
            style={[
              styles.repliedMediaBubble,
              showAuthorAvatar && styles.groupMessageSurface,
              showAuthorAvatar && styles.groupRepliedMediaBubble,
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              isMe ? { backgroundColor: chatTheme.bubbleMe } : null,
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

    if (item.msg_type === 'file' && item.media?.[0]) {
      const replySnippet = renderReplySnippet();
      return (
        <View
          style={[
            styles.fileStack,
            showAuthorAvatar && styles.groupFileStack,
          ]}
        >
          {replySnippet}
          <FileBubble
            fileName={item.media[0].file_name ?? 'File'}
            fileSize={item.media[0].file_size}
            uri={item.media[0].remote_url ?? undefined}
            isMe={isMe}
            caption={item.content ?? undefined}
            time={formatTime(item.created_at)}
            status={item.status}
            header={renderIncomingHeader()}
            bubbleMeColor={chatTheme.bubbleMe}
            outgoingTextColor={chatTheme.bubbleMeText}
            outgoingMetaColor={chatTheme.bubbleMeMeta}
            outgoingAccentColor={chatTheme.bubbleMeAccent}
          />
        </View>
      );
    }

    return null;
  };

  const renderReactions = () => {
    if (selectionMode || !(item.reactions?.length ?? 0)) return null;
    return (
      <View
        style={[styles.reactionRow, isMe ? styles.reactionRowMe : styles.reactionRowOther]}
      >
        {item.reactions!.map((r) => (
          <Pressable
            key={r.emoji}
            onPress={() => {
              if (allowReactions) onToggleReaction(item.id, r.emoji);
            }}
            disabled={!allowReactions}
            style={({ pressed }) => [
              styles.reactionChip,
              isMe ? styles.reactionChipMine : styles.reactionChipOther,
              pressed && allowReactions && styles.reactionChipPressed,
              !allowReactions && styles.reactionChipDisabled,
            ]}
          >
            <Text style={[styles.reactionChipEmoji, isMe && styles.reactionChipEmojiMe]}>
              {r.emoji}
            </Text>
            <Text style={[styles.reactionChipCount, isMe && styles.reactionChipCountMe]}>
              {r.count}
            </Text>
          </Pressable>
        ))}
      </View>
    );
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
                <View style={styles.groupAvatarSlot}>
                  {authorAvatarUri ? (
                    <Image source={{ uri: authorAvatarUri }} style={styles.groupAvatarImage} />
                  ) : (
                    <View style={[styles.groupAvatarFallback, { backgroundColor: authorColor }]}>
                      <Text style={styles.groupAvatarInitial}>{authorPresentation.initial}</Text>
                    </View>
                  )}
                </View>
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
          {renderReactions()}
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
  return (
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
  messageById,
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
      repliedMessage={item.reply_to_id ? messageById.get(item.reply_to_id) ?? null : null}
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
    messageById,
    onMessageLongPress,
    onForwardHeaderPress,
    onToggleReaction,
    onMessagePress,
    onReplyPreviewPress,
    onSwipeReply,
    repliedVoiceBubbleWidth,
    selectionMode,
    selectedMessageIdSet,
    setContentRef,
  ]);

  return (
    <Reanimated.View style={[styles.listWrap, listAnimatedStyle]}>
      <FlatList
        ref={listRef}
        key={chatId}
        data={messages}
        keyExtractor={(message) => message.id}
        inverted
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
    prev.messageById === next.messageById &&
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
  authorLabel: {
    marginBottom: 4,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#8B5CF6',
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
  viewerTopBar: {
    minHeight: 86,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
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
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 12,
  },
  reactionRowMe: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  reactionRowOther: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  reactionChipMine: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  reactionChipOther: {
    backgroundColor: 'rgba(15,23,42,0.07)',
  },
  reactionChipPressed: {
    opacity: 0.78,
  },
  reactionChipDisabled: {
    opacity: 0.55,
  },
  reactionChipEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  reactionChipEmojiMe: {},
  reactionChipCount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  reactionChipCountMe: {
    color: 'rgba(255,255,255,0.92)',
  },
});
