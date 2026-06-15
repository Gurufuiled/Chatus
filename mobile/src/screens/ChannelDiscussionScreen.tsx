import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import { BlurTargetView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useChatComposerDockPaddingBottom,
  useChatComposerKeyboardLiftStyles,
} from '../utils/chatComposerKeyboard';
import type { ChatsStackParamList } from '../navigation/types';
import {
  fetchDiscussionThread,
  sendDiscussionMessage,
} from '../services/channelService';
import { ensureDiscussionMediaUploaded } from '../services/discussionMediaUpload';
import { ChatProfileMediaViewerModal } from '../components/ChatProfileMediaViewerModal';
import type { MediaTile } from '../components/ChatProfileMediaSection';
import { buildChannelPostMediaTiles } from '../utils/channelPostMediaTiles';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import type { Message } from '../stores/types';
import type { ThemeColors } from '../theme/palettes';
import { bubbleRadius } from '../theme/colors';
import { withAlpha } from '../theme/stylePrimitives';
import { resolveMediaUrl } from '../config';
import { resolveVoiceMessageUri } from '../utils/messageMediaUri';
import {
  ChatContextMenuOverlay,
  ChatInputDock,
  InteractiveChatBackShell,
  LoadErrorState,
  MessageTimeStatus,
  ReplyPreview,
  buildReplyPreviewText,
  getReplyPreviewThumbnailUri,
} from '../components';
import { CustomAndroidChatHeader } from '../components/CustomAndroidChatHeader';
import {
  PeerFirstFileBubble,
  PeerFirstImageBubble,
  PeerFirstVideoBubble,
  PeerFirstVideoNoteBubble,
  PeerFirstVoiceBubble,
} from '../components/peerFirstMedia';
import type { FilePickResult, MediaPickResult } from '../components/InputBar';
import {
  ChatBackgroundPattern,
  MENU_EDGE_GAP,
  MENU_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  estimateMenuCardHeight,
  formatTime,
} from './chatScreen.shared';
import { resolveAvatarUrl } from '../config';
import { TransportService } from '../services/TransportService';
import { WebSocketService } from '../services/WebSocketService';
import { useTheme } from '../contexts/ThemeContext';

type Route = RouteProp<ChatsStackParamList, 'ChannelDiscussion'>;
type DiscussionMenuActionKey = 'reply' | 'copy' | 'delete';
type DiscussionOverlayActionKey = DiscussionMenuActionKey | 'delete_confirm' | 'delete_cancel';
type DiscussionMenuMode = 'actions' | 'deleteConfirm';

type MenuAction = {
  key: DiscussionOverlayActionKey;
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'] | null;
  color: string;
  disabled: boolean;
  textOnly?: boolean;
};

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

const EMPTY_MESSAGES: Message[] = [];
const REPLY_SWIPE_TRIGGER = 34;
const REPLY_SWIPE_MAX = 72;
const AVATAR_SIZE = 36;
const AVATAR_COLORS = ['#8B5CF6', '#EC4899', '#F97316', '#0EA5E9', '#10B981', '#EAB308'];

function hashColor(id: string, accentFallback: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? accentFallback;
}

function getInitial(name: string | null | undefined): string {
  return name?.trim().charAt(0).toUpperCase() || '?';
}

function clampReplySwipe(value: number) {
  'worklet';
  return Math.max(-REPLY_SWIPE_MAX, Math.min(0, value));
}

function createChannelDiscussionStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.chatBackground },
    /** Outer stack peek (interactive back): transparent over previous screen. */
    discussionRootTransparent: { backgroundColor: 'transparent' },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: c.chatBackground,
    },
    listWrap: { flex: 1 },
    listContent: { paddingHorizontal: 8, paddingTop: 8 },
    row: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      marginBottom: 8,
    },
    rowOther: { justifyContent: 'flex-start' },
    rowMe: { justifyContent: 'flex-end' },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      marginBottom: 2,
    },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    bubbleColumn: { maxWidth: '84%' },
    bubbleColumnMe: { alignSelf: 'flex-end' },
    bubbleColumnOther: { alignSelf: 'flex-start' },
    textBubble: {
      paddingHorizontal: 10,
      paddingTop: 7,
      paddingBottom: 7,
      borderRadius: 16,
    },
    textBubbleOther: {
      backgroundColor: c.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.bubbleOtherBorder,
      ...bubbleRadius.other,
    },
    textBubbleMe: { backgroundColor: c.bubbleMe, ...bubbleRadius.mine },
    authorText: { fontSize: 13, fontWeight: '700', marginBottom: 1 },
    textContentRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
    },
    messageText: { color: c.textPrimary, fontSize: 16, lineHeight: 21, flexShrink: 1 },
    deletedText: { color: c.textSecondary, fontSize: 14, fontStyle: 'italic' },
    mediaWrap: { alignSelf: 'stretch' },
    messageTextMe: { color: '#FFFFFF' },
    reactionSummaryText: {
      marginTop: 2,
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      paddingHorizontal: 4,
    },
    emptyText: {
      marginTop: 30,
      textAlign: 'center',
      color: c.textSecondary,
      fontWeight: '600',
    },
    originalPostWrap: {
      marginBottom: 4,
    },
    originalPostAlign: {
      alignItems: 'flex-start',
    },
    originalPostTextBubble: {
      alignSelf: 'flex-start',
      maxWidth: '82%',
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.bubbleOtherBorder,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 6,
    },
    originalPostText: {
      color: c.textPrimary,
      fontSize: 16,
      lineHeight: 22,
    },
    originalPostMeta: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 5,
    },
    originalPostMetaText: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
    discussionDivider: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
    discussionDividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: withAlpha(c.textSecondary, 0.22),
    },
    discussionDividerText: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
    inputBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'visible' },
    replyGestureContainer: { width: '100%', position: 'relative', overflow: 'visible' },
    replySwipeAction: { position: 'absolute', right: 10, top: '50%', marginTop: -16, zIndex: 2 },
    replySwipeIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.94),
      borderWidth: 1,
      borderColor: withAlpha(c.accent, 0.35),
    },
  });
}

type ChannelDiscussionStyles = ReturnType<typeof createChannelDiscussionStyles>;

type ReplySwipeWrapperProps = {
  enabled: boolean;
  onReply: () => void;
  children: React.ReactNode;
  st: ChannelDiscussionStyles;
  accent: string;
};

const ReplySwipeWrapper = React.memo(function ReplySwipeWrapper({
  enabled,
  onReply,
  children,
  st,
  accent,
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
        triggerPop.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 120 }));
        runOnJS(onReply)();
      }
    })
    .onFinalize(() => {
      translateX.value = withTiming(0, { duration: 140 });
      hasTriggered.value = false;
    });

  const contentStyle = useAnimatedStyle(() => {
    const scale = interpolate(triggerPop.value, [0, 1], [1, 0.985], Extrapolation.CLAMP);
    return { transform: [{ translateX: translateX.value }, { scale }] as const };
  });

  const iconStyle = useAnimatedStyle(() => {
    const progress = Math.abs(translateX.value) / REPLY_SWIPE_TRIGGER;
    const opacity = interpolate(progress, [0, 0.3, 1], [0, 0.45, 1], Extrapolation.CLAMP);
    const baseScale = interpolate(progress, [0, 1], [0.84, 1], Extrapolation.CLAMP);
    const scaleBoost = interpolate(triggerPop.value, [0, 1], [0, 0.18], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale: baseScale + scaleBoost }] };
  });

  if (!enabled) {
    return <View style={st.replyGestureContainer}>{children}</View>;
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={st.replyGestureContainer}>
        <Reanimated.View style={[st.replySwipeAction, iconStyle]}>
          <View style={st.replySwipeIconWrap}>
            <Feather name="corner-left-up" size={18} color={accent} />
          </View>
        </Reanimated.View>
        <Reanimated.View style={contentStyle}>{children}</Reanimated.View>
      </View>
    </GestureDetector>
  );
});
type DiscussionMessageBubbleProps = {
  item: Message;
  isMe: boolean;
  repliedMessage: Message | null;
  /** LineSync line id (= discussion chat id). */
  lineSyncLineId: string;
  forcedWidth?: number;
  setContentRef?: (node: View | null) => void;
  onLongPress?: () => void;
  onReplyPreviewPress?: (messageId: string) => void;
  st: ChannelDiscussionStyles;
};

function DiscussionMessageBubble({
  item,
  isMe,
  repliedMessage,
  lineSyncLineId,
  forcedWidth,
  setContentRef,
  onLongPress,
  onReplyPreviewPress,
  st,
}: DiscussionMessageBubbleProps) {
  const { colors: c, resolvedScheme } = useTheme();
  const time = formatTime(item.created_at);
  const displayStatus =
    isMe && (item.status === 'delivered' || item.status === 'read')
      ? 'sent'
      : item.status;
  const reactionSummary =
    item.reactions && item.reactions.length > 0
      ? item.reactions.map((reaction) => `${reaction.emoji} ${reaction.count}`).join('   ')
      : null;

  const renderReplySnippet = () => {
    if (!item.reply_to_id) return null;
    const author = repliedMessage ? repliedMessage.sender_name || repliedMessage.sender_id : 'Original message';
    const text = repliedMessage ? buildReplyPreviewText(repliedMessage) : 'Original message unavailable';
    return (
      <ReplyPreview
        author={author}
        text={text}
        accentColor={isMe ? '#DFF2A8' : '#F28C28'}
        backgroundColor={
          isMe ? '#6A9EFF' : resolvedScheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#F2F4D9'
        }
        textColor={
          isMe ? 'rgba(255,255,255,0.88)' : resolvedScheme === 'dark' ? c.textSecondary : '#5F6368'
        }
        authorColor={isMe ? '#FFD08A' : resolvedScheme === 'dark' ? c.accent : '#D1782B'}
        thumbnailUri={getReplyPreviewThumbnailUri(repliedMessage)}
        peerFirstLineId={repliedMessage?.chat_id ?? lineSyncLineId}
        onPress={onReplyPreviewPress && item.reply_to_id ? () => onReplyPreviewPress(item.reply_to_id!) : undefined}
      />
    );
  };

  const media = item.media?.[0];
  const replySnippet = renderReplySnippet();

  const content = (() => {
    if (item.is_deleted === 1) {
      return (
        <View style={[st.textBubble, isMe ? st.textBubbleMe : st.textBubbleOther]}>
          {replySnippet}
          <Text style={st.deletedText}>{isMe ? 'Вы удалили сообщение' : 'Сообщение удалено'}</Text>
          <MessageTimeStatus time={time} status={displayStatus} isMe={isMe} compact />
        </View>
      );
    }

    if (item.msg_type === 'voice' && media) {
      const voiceUri =
        resolveVoiceMessageUri(item) ?? media.remote_url ?? `file://${item.id}`;
      return (
        <View style={st.mediaWrap}>
          {replySnippet}
          <PeerFirstVoiceBubble
            lineId={lineSyncLineId}
            serverUri={voiceUri}
            waveform={media.waveform ?? []}
            durationMs={media.duration_ms ?? 0}
            isMe={isMe}
            time={time}
            status={displayStatus}
            embedded={!!replySnippet}
          />
        </View>
      );
    }

    if (item.msg_type === 'video_note' && media) {
      const vnBase =
        resolveVoiceMessageUri(item) ?? media.remote_url?.trim() ?? '';
      if (vnBase) {
        const vnUri = resolveMediaUrl(vnBase || null) ?? vnBase;
        const vnThumb = media.thumbnail_url
          ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
          : undefined;
        return (
          <View style={st.mediaWrap}>
            {replySnippet}
            <PeerFirstVideoNoteBubble
              lineId={lineSyncLineId}
              serverUri={vnUri}
              messageId={item.id}
              thumbnailUri={vnThumb}
              durationMs={media.duration_ms ?? 0}
              isMe={isMe}
              time={time}
              status={displayStatus}
              embedded={!!replySnippet}
              registerPlaybackState={false}
            />
          </View>
        );
      }
    }

    if (item.msg_type === 'image' && media?.remote_url) {
      const imgUri = resolveMediaUrl(media.remote_url) ?? media.remote_url;
      return (
        <View style={st.mediaWrap}>
          {replySnippet}
          <PeerFirstImageBubble
            lineId={lineSyncLineId}
            serverUri={imgUri}
            isMe={isMe}
            width={media.width}
            height={media.height}
            caption={item.content ?? undefined}
            time={time}
            status={displayStatus}
            embedded={!!replySnippet}
          />
        </View>
      );
    }

    if (item.msg_type === 'video' && media?.remote_url) {
      const vidUri = resolveMediaUrl(media.remote_url) ?? media.remote_url;
      const vidThumb = media.thumbnail_url
        ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
        : undefined;
      return (
        <View style={st.mediaWrap}>
          {replySnippet}
          <PeerFirstVideoBubble
            lineId={lineSyncLineId}
            serverUri={vidUri}
            thumbnailUri={vidThumb}
            isMe={isMe}
            width={media.width}
            height={media.height}
            durationMs={media.duration_ms ?? 0}
            caption={item.content ?? undefined}
            time={time}
            status={displayStatus}
            embedded={!!replySnippet}
          />
        </View>
      );
    }

    if (item.msg_type === 'file' && media) {
      const rawFile = media.remote_url ?? '';
      const fileUri =
        rawFile.trim().length > 0
          ? resolveMediaUrl(rawFile) ?? rawFile
          : undefined;
      return (
        <View style={st.mediaWrap}>
          {replySnippet}
          <PeerFirstFileBubble
            lineId={lineSyncLineId}
            serverUri={fileUri ?? ''}
            fileName={media.file_name ?? item.content ?? 'File'}
            fileSize={media.file_size}
            isMe={isMe}
            caption={item.content ?? undefined}
            time={time}
            status={displayStatus}
          />
        </View>
      );
    }

    return (
      <View style={[st.textBubble, isMe ? st.textBubbleMe : st.textBubbleOther]}>
        {replySnippet}
        {!isMe ? (
          <Text style={[st.authorText, { color: hashColor(item.sender_id, c.accent) }]}>{item.sender_name || item.sender_id}</Text>
        ) : null}
        <View style={st.textContentRow}>
          <Text style={[st.messageText, isMe && st.messageTextMe]}>{item.content?.trim() || 'Сообщение'}</Text>
          <MessageTimeStatus time={time} status={displayStatus} isMe={isMe} compact />
        </View>
      </View>
    );
  })();

  return (
    <View
      ref={setContentRef}
      style={[
        st.bubbleColumn,
        isMe ? st.bubbleColumnMe : st.bubbleColumnOther,
        forcedWidth ? { width: Math.ceil(forcedWidth), maxWidth: Math.ceil(forcedWidth) } : null,
      ]}
    >
      {onLongPress ? (
        <GestureDetector
          gesture={Gesture.LongPress()
            .minDuration(220)
            .onStart(() => {
              runOnJS(onLongPress)();
            })}
        >
          <View collapsable={false}>{content}</View>
        </GestureDetector>
      ) : (
        content
      )}
      {reactionSummary ? <Text style={st.reactionSummaryText}>{reactionSummary}</Text> : null}
    </View>
  );
}

function scaleMedia(media: NonNullable<Message['media']>[number] | undefined, maxWidth: number) {
  const w = media?.width ?? 0;
  const h = media?.height ?? 0;
  if (!w || !h) return null;
  const scale = Math.min(maxWidth / w, 1);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function OriginalPostHeader({ post, st }: { post: Message | null; st: ChannelDiscussionStyles }) {
  const { colors: themeIcon } = useTheme();
  const [originalMediaViewer, setOriginalMediaViewer] = React.useState<{
    items: MediaTile[];
    index: number;
  } | null>(null);

  React.useEffect(() => {
    setOriginalMediaViewer(null);
  }, [post?.id]);

  const openOriginalPostMediaViewer = React.useCallback(() => {
    if (!post) return;
    const items = buildChannelPostMediaTiles(post);
    if (items.length === 0) return;
    setOriginalMediaViewer({ items, index: 0 });
  }, [post]);

  if (!post) return null;
  const lineId = post.chat_id;
  const time = formatTime(post.created_at);
  const media = post.media?.[0];
  const text = post.content?.trim() ?? '';
  const isVisualMedia = post.msg_type === 'image' || post.msg_type === 'video';
  const captionText = isVisualMedia ? text : '';
  const originalVideoNoteUri =
    post.msg_type === 'video_note' && media
      ? (() => {
          const b = resolveVoiceMessageUri(post) ?? media.remote_url?.trim() ?? '';
          return b ? resolveMediaUrl(b || null) ?? b : '';
        })()
      : '';

  return (
    <>
    <View style={st.originalPostWrap}>
      <View style={st.originalPostAlign}>
        {post.msg_type === 'image' && media?.remote_url ? (
          <PeerFirstImageBubble
            lineId={lineId}
            serverUri={resolveMediaUrl(media.remote_url) ?? media.remote_url}
            isMe={false}
            width={media.width}
            height={media.height}
            caption={captionText || undefined}
            time={time}
            status={post.status}
            viewCount={post.view_count ?? 0}
            contentFit="cover"
            onOpenFullscreen={openOriginalPostMediaViewer}
          />
        ) : null}
        {post.msg_type === 'video' && media?.remote_url ? (
          <PeerFirstVideoBubble
            lineId={lineId}
            serverUri={resolveMediaUrl(media.remote_url) ?? media.remote_url}
            thumbnailUri={
              media.thumbnail_url
                ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
                : undefined
            }
            isMe={false}
            width={media.width}
            height={media.height}
            durationMs={media.duration_ms ?? 0}
            caption={captionText || undefined}
            time={time}
            status={post.status}
            viewCount={post.view_count ?? 0}
            onOpenFullscreen={openOriginalPostMediaViewer}
          />
        ) : null}
        {post.msg_type === 'voice' && media ? (
          <PeerFirstVoiceBubble
            lineId={lineId}
            serverUri={
              resolveVoiceMessageUri(post) ??
              media.remote_url ??
              `file://${post.id}`
            }
            waveform={media.waveform ?? []}
            durationMs={media.duration_ms ?? 0}
            isMe={false}
            time={time}
            status={post.status}
            viewCount={post.view_count ?? 0}
          />
        ) : null}
        {post.msg_type === 'video_note' && media && originalVideoNoteUri ? (
          <PeerFirstVideoNoteBubble
            lineId={lineId}
            serverUri={originalVideoNoteUri}
            messageId={post.id}
            thumbnailUri={
              media.thumbnail_url
                ? resolveMediaUrl(media.thumbnail_url) ?? media.thumbnail_url
                : undefined
            }
            durationMs={media.duration_ms ?? 0}
            isMe={false}
            time={time}
            status={post.status}
            registerPlaybackState={false}
          />
        ) : null}
        {post.msg_type === 'file' && media ? (
          <PeerFirstFileBubble
            lineId={lineId}
            serverUri={
              media.remote_url?.trim()
                ? resolveMediaUrl(media.remote_url) ?? media.remote_url
                : ''
            }
            fileName={media.file_name ?? post.content ?? 'File'}
            fileSize={media.file_size}
            isMe={false}
            caption={text || undefined}
            time={time}
            status={post.status}
          />
        ) : null}
        {post.msg_type === 'text' || (!isVisualMedia && post.msg_type !== 'voice' && post.msg_type !== 'video_note' && post.msg_type !== 'file') ? (
          <View style={st.originalPostTextBubble}>
            {text ? <Text style={st.originalPostText}>{text}</Text> : null}
            <View style={st.originalPostMeta}>
              <Feather name="eye" size={12} color={themeIcon.textSecondary} />
              <Text style={st.originalPostMetaText}>{post.view_count ?? 0}</Text>
              <Text style={st.originalPostMetaText}>{time}</Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={st.discussionDivider}>
        <View style={st.discussionDividerLine} />
        <Text style={st.discussionDividerText}>Начало обсуждения</Text>
        <View style={st.discussionDividerLine} />
      </View>
    </View>

    <ChatProfileMediaViewerModal
      visible={originalMediaViewer != null}
      items={originalMediaViewer?.items ?? []}
      selectedIndex={originalMediaViewer?.index ?? 0}
      onChangeIndex={(idx) =>
        setOriginalMediaViewer((prev) => (prev ? { ...prev, index: idx } : null))
      }
      onClose={() => setOriginalMediaViewer(null)}
    />
    </>
  );
}

/** Секунды ожидания из текста ошибки API (антифлуд на сервере) */
function parseCooldownSecondsFromApiError(message: string): number | null {
  const ru = message.match(/Подождите (\d+)/);
  if (ru) return Math.max(0, parseInt(ru[1], 10));
  const en = message.match(/Please wait (\d+)s/i);
  if (en) return Math.max(0, parseInt(en[1], 10));
  return null;
}

export function ChannelDiscussionScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelDiscussionStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const composerDockPaddingBottom = useChatComposerDockPaddingBottom(insets.bottom);
  const { dockAnimatedStyle: inputBarAnimatedStyle, listWrapAnimatedStyle } =
    useChatComposerKeyboardLiftStyles(useAnimatedKeyboard());
  const blurTargetRef = React.useRef<View | null>(null);
  const listRef = React.useRef<FlatList<Message> | null>(null);
  const contentRefs = React.useRef<Record<string, View | null>>({});
  const menuAnim = React.useRef(new Animated.Value(0)).current;

  const { channelId, postId } = route.params;
  const key = `${channelId}:${postId}`;
  const thread = channelStore((state) => state.discussionByKey[key]);
  const detailChannel = channelStore((state) => state.detailsById[channelId]?.channel);
  const catalogChannel = channelStore((state) => state.catalog.find((ch) => ch.id === channelId));
  const chatListChannel = chatStore((state) => state.chats.find((ch) => ch.id === channelId));
  const currentUser = authStore((state) => state.user);
  const currentUserId = currentUser?.id ?? null;

  const [loading, setLoading] = React.useState(!thread);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [inputBarHeight, setInputBarHeight] = React.useState(88);
  const [replyToMessageId, setReplyToMessageId] = React.useState<string | null>(null);
  const lastDiscussionSendOkAtRef = React.useRef(0);
  const [commentCooldownEndsAt, setCommentCooldownEndsAt] = React.useState<number | null>(null);
  const clearCommentCooldown = React.useCallback(() => setCommentCooldownEndsAt(null), []);
  const [menuState, setMenuState] = React.useState<MenuState>(null);
  const [menuMode, setMenuMode] = React.useState<DiscussionMenuMode>('actions');

  const messages = thread?.messages ?? EMPTY_MESSAGES;
  const sortedMessages = React.useMemo(() => [...messages].sort((a, b) => a.created_at - b.created_at), [messages]);
  const messageById = React.useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of sortedMessages) {
      map.set(message.id, message);
    }
    return map;
  }, [sortedMessages]);

  /** Детали канала (после настроек/рефреша) важнее снапшота из треда — иначе залипают disable_* */
  const channelForDiscussion =
    detailChannel ?? thread?.channel ?? catalogChannel ?? chatListChannel ?? null;

  const replyToMessage = replyToMessageId ? messageById.get(replyToMessageId) ?? null : null;
  const replyAuthorName = replyToMessage ? replyToMessage.sender_name || replyToMessage.sender_id : null;
  const activeMenuMessage = menuState ? messageById.get(menuState.messageId) ?? null : null;

  const updateThread = React.useCallback(
    (updater: (current: NonNullable<typeof thread>) => NonNullable<typeof thread>) => {
      const current = channelStore.getState().discussionByKey[key];
      if (!current) return;
      channelStore.getState().setDiscussion(key, updater(current));
    },
    [key],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchDiscussionThread(channelId, postId);
      channelStore.getState().setDiscussion(key, {
        channel: next.channel,
        discussion_chat_id: next.discussion_chat_id,
        thread_root_message_id: next.thread_root_message_id,
        can_comment: next.can_comment,
        post: next.post,
        messages: next.messages,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить обсуждение.');
    } finally {
      setLoading(false);
    }
  }, [channelId, key, postId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!replyToMessageId) return;
    if (messageById.has(replyToMessageId)) return;
    setReplyToMessageId(null);
  }, [messageById, replyToMessageId]);

  const closeMenu = React.useCallback(() => {
    Animated.timing(menuAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        setMenuMode('actions');
        setMenuState(null);
      }
    });
  }, [menuAnim]);

  React.useEffect(() => {
    if (!menuState) {
      menuAnim.setValue(0);
      return;
    }
    Animated.spring(menuAnim, { toValue: 1, damping: 18, stiffness: 220, mass: 0.9, useNativeDriver: true }).start();
  }, [menuAnim, menuState]);

  const setContentRef = React.useCallback((messageId: string, node: View | null) => {
    if (node) {
      contentRefs.current[messageId] = node;
      return;
    }
    delete contentRefs.current[messageId];
  }, []);

  const openMessageMenu = React.useCallback((message: Message) => {
    const target = contentRefs.current[message.id];
    if (!target) return;
    Keyboard.dismiss();
    setMenuMode('actions');

    target.measureInWindow((pageX, pageY, width, height) => {
      const reactionBarHeight = 42;
      const reactionGap = 4;
      const menuGap = 4;
      const DISCUSSION_ACTION_COUNT = 3;
      const menuCardHeight =
        Math.max(
          estimateMenuCardHeight(DISCUSSION_ACTION_COUNT),
          estimateMenuCardHeight(2),
        ) + 10;

      const bottomSafety = 28;
      const composerOffset =
        (thread?.can_comment ? inputBarHeight : 0) + Math.max(insets.bottom, 12);
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

      setMenuState({
        messageId: message.id,
        isMe: message.sender_id === currentUserId,
        previewTop,
        previewLeft,
        previewWidth,
        previewHeight: previewDisplayHeight,
        menuTop,
        menuLeft,
        placement: 'below',
      });
    });
  }, [currentUserId, insets.bottom, insets.top, inputBarHeight, thread?.can_comment]);

  const menuActions = React.useMemo<MenuAction[]>(() => {
    if (!activeMenuMessage) return [];
    if (menuMode === 'deleteConfirm') {
      return [
        { key: 'delete_confirm', label: 'Удалить для всех', icon: null, color: '#E53935', disabled: false, textOnly: true },
        { key: 'delete_cancel', label: 'Отмена', icon: null, color: c.textPrimary, disabled: false, textOnly: true },
      ];
    }
    return [
      { key: 'reply', label: 'Ответить', icon: 'corner-left-up', color: c.textPrimary, disabled: false },
      { key: 'copy', label: 'Скопировать', icon: 'copy', color: c.textPrimary, disabled: false },
      { key: 'delete', label: 'Удалить', icon: 'trash-2', color: '#E53935', disabled: activeMenuMessage.sender_id !== currentUserId },
    ];
  }, [activeMenuMessage, currentUserId, menuMode, c]);

  const handleDeleteMessage = React.useCallback((message: Message) => {
    if (!thread) return;
    if (message.sender_id !== currentUserId) {
      closeMenu();
      Alert.alert('Удаление недоступно', 'Можно удалять только свои комментарии.');
      return;
    }
    updateThread((current) => ({
      ...current,
      messages: current.messages.map((item) => (item.id === message.id ? { ...item, is_deleted: 1, content: null } : item)),
    }));
    closeMenu();
    TransportService.deleteMessage(thread.discussion_chat_id, message.id);
  }, [closeMenu, currentUserId, thread, updateThread]);

  const handleMenuAction = React.useCallback(async (keyAction: DiscussionMenuActionKey) => {
    if (!activeMenuMessage) return;
    if (keyAction === 'reply') {
      setReplyToMessageId(activeMenuMessage.id);
      closeMenu();
      return;
    }
    if (keyAction === 'copy') {
      const value = (activeMenuMessage.content ?? '').trim();
      closeMenu();
      if (!value) {
        Alert.alert('Нечего копировать', 'В этом комментарии нет текста.');
        return;
      }
      await Clipboard.setStringAsync(value);
      return;
    }
    if (activeMenuMessage.sender_id !== currentUserId) {
      closeMenu();
      Alert.alert('Удаление недоступно', 'Можно удалять только свои комментарии.');
      return;
    }
    setMenuMode('deleteConfirm');
  }, [activeMenuMessage, closeMenu, currentUserId]);

  const handleDeleteConfirmAction = React.useCallback((action: 'delete_confirm' | 'delete_cancel') => {
    if (!activeMenuMessage) return;
    if (action === 'delete_cancel') {
      setMenuMode('actions');
      return;
    }
    handleDeleteMessage(activeMenuMessage);
  }, [activeMenuMessage, handleDeleteMessage]);
  const canSwipeReply = React.useCallback((message: Message) => {
    if (message.is_deleted === 1) return false;
    return ['text', 'voice', 'video_note', 'image', 'video', 'file'].includes(message.msg_type);
  }, []);

  const sendWithOptimistic = React.useCallback(
    async ({
      type,
      content,
      mediaPayload,
      optimisticMedia,
    }: {
      type: Message['msg_type'];
      content: string | null;
      mediaPayload?: {
        url?: string;
        waveform?: number[];
        duration_ms?: number;
        thumbnail_url?: string;
        is_round?: boolean;
        width?: number;
        height?: number;
        file_name?: string;
        file_size?: number;
        mime_type?: string;
      };
      optimisticMedia?: Message['media'];
    }) => {
      if (!currentUserId || !thread) return;

      // Мягкий pre-check запретов из настроек канала — чтобы не делать
      // лишний сетевой запрос и показать понятное сообщение.
      const channel =
        detailChannel ?? thread.channel ?? catalogChannel ?? chatListChannel ?? null;
      if (type === 'voice' && channel?.disable_voice_comments === 1) {
        Alert.alert('Голосовые отключены', 'В этом канале запрещены голосовые комментарии.');
        return;
      }
      if (
        (type === 'image' || type === 'video' || type === 'video_note' || type === 'file') &&
        channel?.disable_media_comments === 1
      ) {
        Alert.alert('Медиа отключены', 'В этом канале запрещены медиа-комментарии.');
        return;
      }

      const cooldownSec = Math.min(15, Math.max(0, Number(channel?.comment_cooldown_sec) || 0));
      if (cooldownSec > 0 && lastDiscussionSendOkAtRef.current > 0) {
        const unblockAt = lastDiscussionSendOkAtRef.current + cooldownSec * 1000;
        if (Date.now() < unblockAt) {
          setCommentCooldownEndsAt(unblockAt);
          return;
        }
      }

      const now = Date.now();
      const tempId = `temp-discussion-${now}-${Math.round(Math.random() * 1000)}`;
      const optimistic: Message = {
        id: tempId,
        chat_id: thread.discussion_chat_id,
        sender_id: currentUserId,
        sender_name: currentUser?.display_name ?? currentUser?.username ?? null,
        sender_avatar_url: currentUser?.avatar_url ?? null,
        msg_type: type,
        content,
        reply_to_id: replyToMessageId,
        thread_root_message_id: postId,
        is_channel_post: 0,
        view_count: 0,
        comment_count: 0,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'websocket',
        server_id: null,
        created_at: now,
        updated_at: now,
        reactions: [],
        media: optimisticMedia,
      };

      updateThread((current) => ({ ...current, messages: [...current.messages, optimistic] }));
      setReplyToMessageId(null);

      try {
        if (__DEV__) {
          console.log('[Discussion] send start', {
            type,
            channelId,
            postId,
            hasMediaPayload: !!mediaPayload,
            mediaUrl: mediaPayload?.url,
          });
        }
        const mediaToSend =
          mediaPayload && type !== 'text'
            ? await ensureDiscussionMediaUploaded(type, mediaPayload)
            : mediaPayload;
        if (__DEV__) {
          console.log('[Discussion] upload done', {
            type,
            mediaUrl: mediaToSend?.url,
            durationMs: mediaToSend?.duration_ms,
          });
        }
        const saved = await sendDiscussionMessage(channelId, postId, {
          msg_type: type,
          content,
          reply_to_id: optimistic.reply_to_id,
          media: mediaToSend,
        });
        if (__DEV__) {
          console.log('[Discussion] send ok', { savedId: saved.id });
        }
        updateThread((current) => ({
          ...current,
          messages: [...current.messages.filter((item) => item.id !== tempId && item.id !== saved.id), saved],
        }));
        lastDiscussionSendOkAtRef.current = Date.now();
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } catch (error) {
        updateThread((current) => ({ ...current, messages: current.messages.filter((item) => item.id !== tempId) }));
        const errMsg = error instanceof Error ? error.message : String(error);
        if (__DEV__) {
          console.warn('[Discussion] send FAILED', {
            type,
            errMsg,
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        const coolWait = parseCooldownSecondsFromApiError(errMsg);
        if (coolWait != null && coolWait > 0) {
          setCommentCooldownEndsAt(Date.now() + coolWait * 1000);
        } else {
          Alert.alert('Не удалось отправить комментарий', errMsg || 'Попробуйте ещё раз.');
        }
      }
    },
    [
      catalogChannel,
      channelId,
      chatListChannel,
      currentUser,
      currentUserId,
      detailChannel,
      postId,
      replyToMessageId,
      thread,
      updateThread,
    ],
  );

  const handleSendText = React.useCallback((text: string) => {
    const content = text.trim();
    if (!content) return;
    void sendWithOptimistic({ type: 'text', content });
  }, [sendWithOptimistic]);

  const handleSendVoice = React.useCallback(async (result: { uri: string; waveform: number[]; durationMs: number }) => {
    await sendWithOptimistic({
      type: 'voice',
      content: null,
      mediaPayload: { url: result.uri, waveform: result.waveform, duration_ms: result.durationMs },
      optimisticMedia: [{ remote_url: result.uri, waveform: result.waveform, duration_ms: result.durationMs }],
    });
  }, [sendWithOptimistic]);

  const handleSendVideoNote = React.useCallback(async (result: { uri: string; durationMs: number; thumbnailUri?: string }) => {
    await sendWithOptimistic({
      type: 'video_note',
      content: null,
      mediaPayload: { url: result.uri, duration_ms: result.durationMs, thumbnail_url: result.thumbnailUri, is_round: true },
      optimisticMedia: [{ remote_url: result.uri, duration_ms: result.durationMs, thumbnail_url: result.thumbnailUri, is_round: true }],
    });
  }, [sendWithOptimistic]);

  const handleSendMedia = React.useCallback(async (result: MediaPickResult) => {
    const type: Message['msg_type'] = result.kind === 'video' ? 'video' : 'image';
    await sendWithOptimistic({
      type,
      content: result.caption?.trim() || null,
      mediaPayload: {
        url: result.uri,
        thumbnail_url: result.previewUri,
        width: result.width,
        height: result.height,
        duration_ms: result.durationMs,
        file_name: result.fileName,
        mime_type: result.mimeType,
      },
      optimisticMedia: [{
        remote_url: result.uri,
        thumbnail_url: result.previewUri,
        width: result.width,
        height: result.height,
        duration_ms: result.durationMs,
        file_name: result.fileName,
      }],
    });
  }, [sendWithOptimistic]);

  const handleSendFile = React.useCallback(async (result: FilePickResult) => {
    await sendWithOptimistic({
      type: 'file',
      content: result.name,
      mediaPayload: { url: result.uri, file_name: result.name, file_size: result.size, mime_type: result.mimeType },
      optimisticMedia: [{ remote_url: result.uri, file_name: result.name, file_size: result.size }],
    });
  }, [sendWithOptimistic]);

  const handlePickReaction = React.useCallback((emoji: string) => {
    if (!activeMenuMessage || !thread) return;
    WebSocketService.sendEvent('toggle_reaction', {
      chat_id: thread.discussion_chat_id,
      message_id: activeMenuMessage.id,
      emoji,
    });
    closeMenu();
  }, [activeMenuMessage, closeMenu, thread]);

  const handleInputBarLayout = React.useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    if (next > 0 && next !== inputBarHeight) {
      setInputBarHeight(next);
    }
  }, [inputBarHeight]);

  const renderRow = React.useCallback(({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    const avatarUri = resolveAvatarUrl(item.sender_avatar_url ?? null);
    const avatarLabel = item.sender_name || item.sender_id;
    const replied = item.reply_to_id ? messageById.get(item.reply_to_id) ?? null : null;

    return (
      <ReplySwipeWrapper
        enabled={thread?.can_comment === true && canSwipeReply(item)}
        onReply={() => setReplyToMessageId(item.id)}
        st={styles}
        accent={c.accent}
      >
        <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
          {!isMe ? (
            avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: hashColor(item.sender_id, c.accent) }]}>
                <Text style={styles.avatarInitial}>{getInitial(avatarLabel)}</Text>
              </View>
            )
          ) : null}
          <DiscussionMessageBubble
            item={item}
            isMe={isMe}
            repliedMessage={replied}
            lineSyncLineId={thread?.discussion_chat_id ?? ''}
            st={styles}
            setContentRef={(node) => setContentRef(item.id, node)}
            onLongPress={() => openMessageMenu(item)}
            onReplyPreviewPress={(messageId) => {
              const targetIndex = sortedMessages.findIndex((m) => m.id === messageId);
              if (targetIndex < 0) return;
              listRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.5 });
            }}
          />
        </View>
      </ReplySwipeWrapper>
    );
  }, [canSwipeReply, c.accent, currentUserId, messageById, openMessageMenu, setContentRef, sortedMessages, styles, thread?.can_comment, thread?.discussion_chat_id]);

  const renderMenuPreviewBody = React.useCallback((item: Message, forcedWidth?: number) => {
    const replied = item.reply_to_id ? messageById.get(item.reply_to_id) ?? null : null;
    return (
      <DiscussionMessageBubble
        item={item}
        isMe={item.sender_id === currentUserId}
        repliedMessage={replied}
        lineSyncLineId={thread?.discussion_chat_id ?? ''}
        forcedWidth={forcedWidth}
        st={styles}
      />
    );
  }, [currentUserId, messageById, styles, thread?.discussion_chat_id]);

  return (
    <View style={[styles.container, styles.discussionRootTransparent]}>
      <InteractiveChatBackShell navigation={navigation as any} gestureEnabled={!menuState}>
        {Platform.OS === 'android' ? (
          <CustomAndroidChatHeader
            title="Обсуждение"
            subtitle={undefined}
            avatarUrl={null}
            isGroupChat={false}
            peerId={null}
            chatId={channelId}
            navigation={navigation as any}
          />
        ) : null}

      <BlurTargetView
        ref={blurTargetRef}
        collapsable={false}
        style={[styles.container, { backgroundColor: c.chatBackground }]}
      >
        <ChatBackgroundPattern />

        {loading && !thread && !loadError ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={c.accent} /></View>
        ) : loadError && !thread ? (
          <LoadErrorState message={loadError} onRetry={() => void load()} />
        ) : (
          <Reanimated.View style={[styles.listWrap, listWrapAnimatedStyle]}>
          <FlatList
              ref={listRef}
              data={sortedMessages}
            keyExtractor={(item) => item.id}
              renderItem={renderRow}
            refreshing={loading}
            onRefresh={() => void load()}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.listContent, { paddingBottom: (thread?.can_comment ? inputBarHeight : 16) + composerDockPaddingBottom }]}
              ListHeaderComponent={<OriginalPostHeader post={thread?.post ?? null} st={styles} />}
              ListEmptyComponent={!loading ? <Text style={styles.emptyText}>Комментариев пока нет</Text> : null}
            />
          </Reanimated.View>
        )}

        {thread?.can_comment ? (
          <ChatInputDock
            onLayout={handleInputBarLayout}
            animatedStyle={[styles.inputBarWrap, inputBarAnimatedStyle, { paddingBottom: composerDockPaddingBottom }]}
            placeholder="Прокомментировать"
            onSendText={handleSendText}
            onSendVoice={handleSendVoice}
            onSendVideoNote={handleSendVideoNote}
            onSendMedia={handleSendMedia}
            onSendFile={handleSendFile}
            blurTargetRef={blurTargetRef}
            replyToMessage={replyToMessage}
            replyAuthorName={replyAuthorName}
            onCancelReply={() => setReplyToMessageId(null)}
            voiceRestriction={
              channelForDiscussion?.disable_voice_comments === 1
                ? 'В этом канале разрешены только текстовые и медиа-комментарии.'
                : null
            }
            mediaRestriction={
              channelForDiscussion?.disable_media_comments === 1
                ? 'В этом канале запрещены медиа-комментарии.'
                : null
            }
            commentCooldownEndsAt={commentCooldownEndsAt}
            onCommentCooldownClear={clearCommentCooldown}
            replyPeerFirstLineId={replyToMessage?.chat_id ?? thread?.discussion_chat_id ?? null}
          />
        ) : null}
      </BlurTargetView>
      </InteractiveChatBackShell>

      <ChatContextMenuOverlay
        menuState={menuState}
        activeMenuMessage={activeMenuMessage}
        menuActions={menuActions}
        menuAnim={menuAnim}
        blurTargetRef={blurTargetRef}
        screenWidth={SCREEN_WIDTH}
        showReactions={menuMode === 'actions'}
        menuCardWidth={menuMode === 'deleteConfirm' ? 224 : undefined}
        onClose={closeMenu}
        onPickReaction={handlePickReaction}
        onMenuAction={(keyAction) => {
          if (menuMode === 'deleteConfirm') {
            handleDeleteConfirmAction(keyAction as 'delete_confirm' | 'delete_cancel');
            return;
          }
          void handleMenuAction(keyAction as DiscussionMenuActionKey);
        }}
        renderMenuPreviewBody={renderMenuPreviewBody}
      />
    </View>
  );
}
