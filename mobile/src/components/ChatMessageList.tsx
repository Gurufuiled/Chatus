import React from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  FlatList,
  FlatListProps,
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
  withTiming,
} from 'react-native-reanimated';
import type { Message } from '../stores/types';
import { bubbleRadius, colors } from '../theme/colors';
import { FileBubble } from './FileBubble';
import { ImageBubble } from './ImageBubble';
import { MessageTimeStatus } from './MessageTimeStatus';
import { ReplyPreview, buildReplyPreviewText } from './ReplyPreview';
import { VoiceBubble } from './VoiceBubble';

const REPLY_SWIPE_TRIGGER = 34;
const REPLY_SWIPE_MAX = 72;

function clampReplySwipe(value: number) {
  'worklet';
  return Math.max(-REPLY_SWIPE_MAX, Math.min(0, value));
}

type ChatMessageListProps = {
  chatId: string;
  currentUserId: string | null;
  messages: Message[];
  messageById: Map<string, Message>;
  selectedMessageIdSet: Set<string>;
  highlightedMessageId: string | null;
  listRef: React.RefObject<FlatList<Message> | null>;
  listAnimatedStyle: React.ComponentProps<typeof Reanimated.View>['style'];
  contentPaddingTop: number;
  canSwipeReply: (message: Message) => boolean;
  onSwipeReply: (message: Message) => void;
  onMessagePress: (messageId: string) => void;
  onMessageLongPress: (message: Message) => void;
  setContentRef: (messageId: string, node: View | null) => void;
  onScrollToIndexFailed?: FlatListProps<Message>['onScrollToIndexFailed'];
  formatTime: (timestamp: number) => string;
  getMessageAuthorName: (message: Message, chatId: string, currentUserId: string | null) => string;
  getDeletedPlaceholder: (isMe: boolean) => string;
  repliedVoiceBubbleWidth: number;
};

type ReplySwipeWrapperProps = {
  enabled: boolean;
  onReply: () => void;
  children: React.ReactNode;
};

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
            <Feather name="corner-left-up" size={18} color="#4D8DFF" />
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
  currentUserId: string | null;
  repliedMessage: Message | null;
  isSelected: boolean;
  isHighlighted: boolean;
  canSwipe: boolean;
  onReply: () => void;
  onPressMessage: (messageId: string) => void;
  onLongPressMessage: (message: Message) => void;
  setContentRef: (messageId: string, node: View | null) => void;
  formatTime: (timestamp: number) => string;
  getMessageAuthorName: (message: Message, chatId: string, currentUserId: string | null) => string;
  getDeletedPlaceholder: (isMe: boolean) => string;
  repliedVoiceBubbleWidth: number;
};

const MessageRow = React.memo(function MessageRow({
  item,
  chatId,
  currentUserId,
  repliedMessage,
  isSelected,
  isHighlighted,
  canSwipe,
  onReply,
  onPressMessage,
  onLongPressMessage,
  setContentRef,
  formatTime,
  getMessageAuthorName,
  getDeletedPlaceholder,
  repliedVoiceBubbleWidth,
}: MessageRowProps) {
  const isMe = item.sender_id === currentUserId;

  const renderReplySnippet = () => {
    if (!item.reply_to_id) return null;
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
        accentColor={isMe ? '#DFF2A8' : '#F28C28'}
        backgroundColor={isMe ? '#6A9EFF' : '#F2F4D9'}
        textColor={isMe ? 'rgba(255,255,255,0.88)' : '#5F6368'}
        authorColor={isMe ? '#FFD08A' : '#D1782B'}
      />
    );
  };

  const renderBody = () => {
    if (item.is_deleted === 1) {
      return (
        <View
          style={[
            styles.deletedBubble,
            isMe ? styles.deletedBubbleMe : styles.deletedBubbleOther,
            isSelected && styles.selectedBubble,
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
        <View
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleOther,
            isSelected && styles.selectedBubble,
          ]}
        >
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
              { width: repliedVoiceBubbleWidth, maxWidth: '82%' },
              isMe ? styles.repliedMediaBubbleMe : styles.repliedMediaBubbleOther,
              isSelected && styles.selectedBubble,
            ]}
          >
            {replySnippet}
            {voiceContent}
          </View>
        );
      }

      return (
        <View style={[styles.mediaStack, isSelected && styles.selectedBubble]}>
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
              isSelected && styles.selectedBubble,
            ]}
          >
            {replySnippet}
            {imageContent}
          </View>
        );
      }

      return (
        <View style={[styles.mediaStack, isSelected && styles.selectedBubble]}>
          {imageContent}
        </View>
      );
    }

    if (item.msg_type === 'file' && item.media?.[0]) {
      return (
        <View style={[styles.mediaStack, isSelected && styles.selectedBubble]}>
          {renderReplySnippet()}
          <FileBubble
            fileName={item.media[0].file_name ?? 'File'}
            fileSize={item.media[0].file_size}
            uri={item.media[0].remote_url ?? undefined}
            isMe={isMe}
          />
        </View>
      );
    }

    return null;
  };

  const card = (
    <Pressable
      delayLongPress={220}
      onPress={() => onPressMessage(item.id)}
      onLongPress={() => onLongPressMessage(item)}
      style={styles.messagePressable}
    >
      <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
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
  );

  if (!canSwipe) {
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
    prev.isSelected === next.isSelected &&
    prev.isHighlighted === next.isHighlighted &&
    prev.canSwipe === next.canSwipe &&
    prev.currentUserId === next.currentUserId &&
    prev.chatId === next.chatId
  );
});

export const ChatMessageList = React.memo(function ChatMessageList({
  chatId,
  currentUserId,
  messages,
  messageById,
  selectedMessageIdSet,
  highlightedMessageId,
  listRef,
  listAnimatedStyle,
  contentPaddingTop,
  canSwipeReply,
  onSwipeReply,
  onMessagePress,
  onMessageLongPress,
  setContentRef,
  onScrollToIndexFailed,
  formatTime,
  getMessageAuthorName,
  getDeletedPlaceholder,
  repliedVoiceBubbleWidth,
}: ChatMessageListProps) {
  const renderMessageRow = React.useCallback(({ item }: { item: Message }) => (
    <MessageRow
      item={item}
      chatId={chatId}
      currentUserId={currentUserId}
      repliedMessage={item.reply_to_id ? messageById.get(item.reply_to_id) ?? null : null}
      isSelected={selectedMessageIdSet.has(item.id)}
      isHighlighted={highlightedMessageId === item.id}
      canSwipe={canSwipeReply(item)}
      onReply={() => onSwipeReply(item)}
      onPressMessage={onMessagePress}
      onLongPressMessage={onMessageLongPress}
      setContentRef={setContentRef}
      formatTime={formatTime}
      getMessageAuthorName={getMessageAuthorName}
      getDeletedPlaceholder={getDeletedPlaceholder}
      repliedVoiceBubbleWidth={repliedVoiceBubbleWidth}
    />
  ), [
    canSwipeReply,
    chatId,
    currentUserId,
    formatTime,
    getDeletedPlaceholder,
    getMessageAuthorName,
    highlightedMessageId,
    messageById,
    onMessageLongPress,
    onMessagePress,
    onSwipeReply,
    repliedVoiceBubbleWidth,
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
        removeClippedSubviews
        initialNumToRender={16}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={45}
        windowSize={9}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: contentPaddingTop },
        ]}
        renderItem={renderMessageRow}
      />
    </Reanimated.View>
  );
}, (prev, next) => {
  return (
    prev.chatId === next.chatId &&
    prev.currentUserId === next.currentUserId &&
    prev.messages === next.messages &&
    prev.messageById === next.messageById &&
    prev.selectedMessageIdSet === next.selectedMessageIdSet &&
    prev.highlightedMessageId === next.highlightedMessageId &&
    prev.contentPaddingTop === next.contentPaddingTop &&
    prev.canSwipeReply === next.canSwipeReply &&
    prev.onSwipeReply === next.onSwipeReply &&
    prev.onMessagePress === next.onMessagePress &&
    prev.onMessageLongPress === next.onMessageLongPress &&
    prev.setContentRef === next.setContentRef &&
    prev.onScrollToIndexFailed === next.onScrollToIndexFailed &&
    prev.formatTime === next.formatTime &&
    prev.getMessageAuthorName === next.getMessageAuthorName &&
    prev.getDeletedPlaceholder === next.getDeletedPlaceholder &&
    prev.repliedVoiceBubbleWidth === next.repliedVoiceBubbleWidth
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
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
