import React, { useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
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
import Reanimated, { runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useChatComposerDockPaddingBottom,
  useChatComposerKeyboard,
  useChatComposerKeyboardLiftStyles,
} from '../utils/chatComposerKeyboard';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BlurTargetView } from 'expo-blur';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ChatInputDock,
  ChatContextMenuOverlay,
  ChatForwardSheet,
  InteractiveChatBackShell,
  LoadErrorState,
} from '../components';
import { CustomAndroidChatHeader, ANDROID_CHAT_HEADER_TOOLBAR_HEIGHT } from '../components/CustomAndroidChatHeader';
import {
  PeerFirstFileBubble,
  PeerFirstImageBubble,
  PeerFirstVideoBubble,
  PeerFirstVideoNoteBubble,
  PeerFirstVoiceBubble,
} from '../components/peerFirstMedia';
import type { FilePickResult, MediaAlbumPickResult, MediaPickResult } from '../components/InputBar';
import type { ChatsStackParamList } from '../navigation/types';
import {
  fetchChannelDetail,
  fetchChannelFeed,
  publishChannelPost,
  subscribeToChannel,
  toggleChannelReaction,
} from '../services/channelService';
import { ensureChannelPostMediaUploaded } from '../services/discussionMediaUpload';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import { canForwardMessage, TransportService } from '../services/TransportService';
import { WebSocketService } from '../services/WebSocketService';
import type { Message } from '../stores/types';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { ChatProfileMediaViewerModal } from '../components/ChatProfileMediaViewerModal';
import type { MediaTile } from '../components/ChatProfileMediaSection';
import { buildChannelPostMediaTiles, getVisualMediaKind } from '../utils/channelPostMediaTiles';
import { channelPostMediaTileId } from '../utils/channelPostMediaTileId';
import { MediaThumbPressable } from '../components/MediaThumbPressable';
import {
  ChatBackgroundPattern,
  formatTime,
  getCopyableContent,
  MENU_EDGE_GAP,
  MENU_WIDTH,
  estimateMenuCardHeight,
} from './chatScreen.shared';
import { formatMediaDuration } from '../utils/mediaDuration';
import { resolveAvatarUrl, resolveMediaUrl } from '../config';
import { resolveVoiceMessageUri } from '../utils/messageMediaUri';
import { usePeerFirstResolvedUri } from '../components/peerFirstMedia';

type Route = RouteProp<ChatsStackParamList, 'ChannelFeed'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelFeed'>;

const QUICK_REACTIONS = ['🔥', '👍', '❤️', '👏'];
const EMPTY_FEED: Message[] = [];
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CHANNEL_MEDIA_MAX_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 320);
const CHANNEL_MEDIA_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.5, 380);
const CHANNEL_MEDIA_MIN_PORTRAIT_WIDTH = 154;

function cloneForwardMedia(message: Message): Message['media'] | undefined {
  if (!message.media?.length) return undefined;
  return message.media.map((item) => ({ ...item }));
}

function buildChannelForwardPreview(message: Message): string {
  switch (message.msg_type) {
    case 'text':
      return message.content?.trim() || 'Сообщение';
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

type MenuMode = 'actions' | 'deleteConfirm';
type PostMenuActionKey = 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'delete_confirm' | 'delete_cancel';

/**
 * Разрешено ли комментировать КОНКРЕТНЫЙ пост с учётом настроек канала.
 * Дублирует серверный `resolveCommentAccessForPost`, чтобы UI сразу прятал
 * кнопку без лишнего запроса и без рассинхрона с 403 от сервера.
 */
function canCommentOnPost(
  post: Message,
  channel: { disable_comments_all?: number; disable_comments_new?: number; disable_comments_new_since?: number | null } | undefined,
  globalCanComment: boolean,
): boolean {
  if (!globalCanComment) return false;
  if (!channel) return true;
  if (channel.disable_comments_all) return false;
  if (
    channel.disable_comments_new &&
    channel.disable_comments_new_since &&
    post.created_at >= channel.disable_comments_new_since
  ) {
    return false;
  }
  return true;
}

function sortPostsOldestFirst(messages: Message[]) {
  return [...messages].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at - b.created_at;
    if (a.updated_at !== b.updated_at) return a.updated_at - b.updated_at;
    return String(a.id).localeCompare(String(b.id));
  });
}

function computeChannelMediaWidth(media?: NonNullable<Message['media']>[number]): number | null {
  const rawWidth = media?.width ?? null;
  const rawHeight = media?.height ?? null;
  if (!rawWidth || !rawHeight || rawWidth <= 0 || rawHeight <= 0) {
    return null;
  }

  const baseScale = Math.min(
    CHANNEL_MEDIA_MAX_WIDTH / rawWidth,
    CHANNEL_MEDIA_MAX_HEIGHT / rawHeight,
    1,
  );
  let width = Math.round(rawWidth * baseScale);
  const isPortrait = rawHeight / rawWidth > 1.28;
  if (isPortrait && width < CHANNEL_MEDIA_MIN_PORTRAIT_WIDTH) {
    const minWidthScale = CHANNEL_MEDIA_MIN_PORTRAIT_WIDTH / rawWidth;
    const safeScale = Math.min(
      Math.max(baseScale, minWidthScale),
      CHANNEL_MEDIA_MAX_HEIGHT / rawHeight,
      1,
    );
    width = Math.round(rawWidth * safeScale);
  }

  return Math.min(Math.max(width, 120), CHANNEL_MEDIA_MAX_WIDTH);
}

type ChannelPostMedia = {
  media_type?: string;
  url?: string;
  duration_ms?: number;
  waveform?: number[];
  thumbnail_url?: string;
  is_round?: boolean;
  width?: number;
  height?: number;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
};

type VisualMediaItem = NonNullable<Message['media']>[number];

type RenderPostContentOptions = {
  visualMediaWidth?: number;
};

function resolveVisualMediaSize(
  media: NonNullable<Message['media']>[number] | undefined,
  targetWidth?: number,
): { width?: number; height?: number } {
  if (!targetWidth || !media?.width || !media.height || media.width <= 0 || media.height <= 0) {
    return {
      width: media?.width,
      height: media?.height,
    };
  }

  return {
    width: targetWidth,
    height: Math.round((media.height / media.width) * targetWidth),
  };
}


type ChannelAlbumOptions = {
  visualMediaWidth?: number;
  onTilePress?: (index: number) => void;
  /** Muted icon on album tile fallback (theme). */
  mutedIcon?: string;
  /** LineSync line id (channel chat id) for peer-first tiles. */
  lineSyncLineId?: string;
};

type ChannelFeedStyles = ReturnType<typeof createChannelFeedStyles>;

function createChannelFeedStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.chatBackground,
    },
    feedRootTransparent: {
      backgroundColor: 'transparent',
    },
    listWrap: {
      flex: 1,
    },
    inputBarWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'visible',
    },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.chatBackground,
    },
    list: {
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    listWithoutComposer: {
      paddingBottom: 24,
    },
    postWrap: {
      marginBottom: 8,
      width: '100%',
      alignSelf: 'stretch',
      alignItems: 'flex-start',
    },
    postBubble: {
      maxWidth: '90%',
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 8,
      alignItems: 'flex-start',
      backgroundColor: c.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.bubbleOtherBorder,
      borderRadius: 12,
    },
    postBubbleVisualMedia: {
      alignSelf: 'flex-start',
      alignItems: 'stretch',
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
    },
    postBubbleVoice: {
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 6,
    },
    menuPreviewBubble: {
      maxWidth: '90%',
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 8,
      alignItems: 'flex-start',
      backgroundColor: c.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.bubbleOtherBorder,
      overflow: 'hidden',
      borderRadius: 12,
    },
    mediaContentWrap: {
      width: '100%',
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    channelAlbumClip: {
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: c.placeholderBg,
    },
    channelAlbumRow: {
      flexDirection: 'row',
      gap: 1.5,
    },
    channelAlbumColumn: {
      gap: 1.5,
    },
    channelAlbumGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 1.5,
    },
    channelAlbumTile: {
      overflow: 'hidden',
      backgroundColor: c.inputBackground,
    },
    channelAlbumTilePressed: {
      opacity: 0.92,
    },
    channelAlbumImage: {
      width: '100%',
      height: '100%',
    },
    channelAlbumImageFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBackgroundSolid,
    },
    channelAlbumVideoBadge: {
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
    channelAlbumVideoDuration: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    channelAlbumExtraOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15,23,42,0.42)',
    },
    channelAlbumExtraText: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    channelAlbumMetaOverlay: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(15, 23, 42, 0.52)',
    },
    channelAlbumMetaText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    postActionsRowMedia: {
      alignSelf: 'stretch',
      width: '100%',
      paddingHorizontal: 10,
      paddingBottom: 10,
      marginTop: 4,
    },
    postActionsRowPreviewMedia: {
      width: '100%',
      alignSelf: 'stretch',
      paddingHorizontal: 10,
      marginRight: 0,
      paddingRight: 10,
    },
    postText: {
      color: c.textPrimary,
      fontSize: 16,
      lineHeight: 20,
    },
    mediaCaptionBlock: {
      alignSelf: 'stretch',
      paddingHorizontal: 10,
      paddingTop: 4,
    },
    mediaCaptionText: {
      color: c.textPrimary,
      fontSize: 16,
      lineHeight: 20,
    },
    mediaCaptionMetaRight: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-end',
    },
    postFooter: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 5,
    },
    footerMetric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metaText: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    postActionsRow: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: withAlpha(c.textSecondary, 0.28),
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 6,
    },
    discussionPill: {
      minHeight: 32,
      paddingHorizontal: 10,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 5,
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.92),
      alignSelf: 'stretch',
    },
    discussionPillMedia: {
      borderRadius: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      justifyContent: 'flex-start',
    },
    discussionPillPressed: {
      opacity: 0.82,
    },
    discussionPillPreview: {
      width: '100%',
      minHeight: 28,
      paddingHorizontal: 0,
      borderRadius: 0,
      backgroundColor: 'transparent',
      justifyContent: 'space-between',
    },
    discussionPreviewLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginLeft: 10,
    },
    discussionPreviewChevron: {
      marginRight: 4,
    },
    discussionLink: {
      color: c.accent,
      fontSize: 12,
      fontWeight: '700',
      flexShrink: 0,
    },
    reactionSummaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 2,
      paddingHorizontal: 2,
    },
    reactionSummaryText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    reactionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    reactionButton: {
      borderRadius: 8,
      paddingHorizontal: 0,
      minHeight: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    reactionButtonActive: {
      backgroundColor: withAlpha(c.accent, 0.14),
    },
    reactionButtonPressed: {
      opacity: 0.72,
    },
    reactionText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    emptyText: {
      marginTop: 40,
      textAlign: 'center',
      color: c.textSecondary,
      fontWeight: '600',
    },
    privateGateWrap: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    privateGateAvatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      marginBottom: 14,
    },
    privateGateAvatarPlaceholder: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: c.iconMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    privateGateAvatarLetter: {
      fontSize: 36,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    privateGateTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    privateGateDesc: {
      marginTop: 8,
      fontSize: 16,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    privateGateHint: {
      marginTop: 16,
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    privateGateButton: {
      marginTop: 22,
      minWidth: 200,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privateGateButtonPressed: { opacity: 0.88 },
    privateGateButtonDisabled: { opacity: 0.65 },
    privateGateButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    subscribePillWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    subscribePill: {
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: c.accent,
      minWidth: 160,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    subscribePillPressed: { opacity: 0.9 },
    subscribePillDisabled: { opacity: 0.65 },
    subscribePillText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}


/** Album tiles must load remote URLs without gallery permission — show fallback on failure instead of blank white. */
function ChannelAlbumTileImage({
  lineSyncLineId,
  rawUri,
  st,
  mutedIcon,
}: {
  lineSyncLineId: string;
  rawUri: string;
  st: ChannelFeedStyles;
  mutedIcon: string;
}) {
  const uri = usePeerFirstResolvedUri(lineSyncLineId, rawUri);
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <View style={[st.channelAlbumImage, st.channelAlbumImageFallback]}>
        <MaterialCommunityIcons name="image-off-outline" size={24} color={mutedIcon} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={st.channelAlbumImage}
      contentFit="cover"
      cachePolicy="disk"
      onError={() => setFailed(true)}
    />
  );
}

function renderChannelMediaAlbum(
  item: Message,
  time: string,
  st: ChannelFeedStyles,
  options?: ChannelAlbumOptions,
) {
  const media = (item.media ?? []).filter((entry) => entry.remote_url?.trim()).slice(0, 10);
  if (media.length <= 1) return null;

  const visibleMedia = media.slice(0, 9);
  const albumWidth = Math.max(
    120,
    Math.min(options?.visualMediaWidth ?? CHANNEL_MEDIA_MAX_WIDTH, CHANNEL_MEDIA_MAX_WIDTH),
  );
  const onTilePress = options?.onTilePress;
  const gap = 1.5;
  const caption = item.content?.trim() ?? '';
  const hasCaption = caption.length > 0;
  const mutedIcon = options?.mutedIcon ?? '#9CA3AF';
  const lineSyncLineId = options?.lineSyncLineId ?? item.chat_id ?? '';

  const renderTile = (mediaItem: VisualMediaItem, index: number, style: object) => {
    const kind = getVisualMediaKind(item, mediaItem);
    const rawUri =
      kind === 'video'
        ? mediaItem.thumbnail_url || mediaItem.remote_url
        : mediaItem.remote_url;
    const extraCount = media.length - visibleMedia.length;
    const showExtra = index === visibleMedia.length - 1 && extraCount > 0;

    const tileContent = (
      <>
        <ChannelAlbumTileImage
          lineSyncLineId={lineSyncLineId}
          rawUri={(rawUri ?? '').trim()}
          st={st}
          mutedIcon={mutedIcon}
        />
        {kind === 'video' ? (
          <View style={st.channelAlbumVideoBadge}>
            <Feather name="play" size={10} color="#FFFFFF" />
            <Text style={st.channelAlbumVideoDuration}>
              {formatMediaDuration(mediaItem.duration_ms ?? 0)}
            </Text>
          </View>
        ) : null}
        {showExtra ? (
          <View style={st.channelAlbumExtraOverlay}>
            <Text style={st.channelAlbumExtraText}>+{extraCount}</Text>
          </View>
        ) : null}
      </>
    );

    if (onTilePress) {
      return (
        <MediaThumbPressable
          key={`${mediaItem.remote_url}-${index}`}
          thumbId={channelPostMediaTileId(item.id, index)}
          onPress={() => onTilePress(index)}
          style={({ pressed }) => [
            st.channelAlbumTile,
            style,
            pressed && st.channelAlbumTilePressed,
          ]}
        >
          {tileContent}
        </MediaThumbPressable>
      );
    }

    return (
      <View key={`${mediaItem.remote_url}-${index}`} style={[st.channelAlbumTile, style]}>
        {tileContent}
      </View>
    );
  };

  const grid = (() => {
    if (visibleMedia.length === 2) {
      const tileWidth = (albumWidth - gap) / 2;
      return (
        <View style={st.channelAlbumRow}>
          {visibleMedia.map((mediaItem, index) =>
            renderTile(mediaItem, index, { width: tileWidth, height: albumWidth })
          )}
        </View>
      );
    }

    if (visibleMedia.length === 3) {
      const sideWidth = (albumWidth - gap) * 0.58;
      const rightWidth = albumWidth - sideWidth - gap;
      const halfHeight = (albumWidth - gap) / 2;
      return (
        <View style={st.channelAlbumRow}>
          {renderTile(visibleMedia[0], 0, { width: sideWidth, height: albumWidth })}
          <View style={[st.channelAlbumColumn, { width: rightWidth }]}>
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
        <View style={[st.channelAlbumColumn, { width: albumWidth }]}>
          <View style={st.channelAlbumRow}>
            {renderTile(visibleMedia[0], 0, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[1], 1, { width: tileW, height: tileH })}
          </View>
          <View style={st.channelAlbumRow}>
            {renderTile(visibleMedia[2], 2, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[3], 3, { width: tileW, height: tileH })}
          </View>
        </View>
      );
    }

    const columns = 3;
    const tileWidth = (albumWidth - gap * (columns - 1)) / columns;
    return (
      <View style={st.channelAlbumGrid}>
        {visibleMedia.map((mediaItem, index) =>
          renderTile(mediaItem, index, { width: tileWidth, height: tileWidth })
        )}
      </View>
    );
  })();

  return (
    <>
      <View style={[st.channelAlbumClip, { width: albumWidth }]}>
        {grid}
        {!hasCaption ? (
          <View style={st.channelAlbumMetaOverlay}>
            <View style={st.footerMetric}>
              <Feather name="eye" size={13} color="#FFFFFF" />
              <Text style={st.channelAlbumMetaText}>{item.view_count ?? 0}</Text>
            </View>
            <Text style={st.channelAlbumMetaText}>{time}</Text>
          </View>
        ) : null}
      </View>
      {hasCaption ? (
        <View style={st.mediaCaptionBlock}>
          <Text style={st.mediaCaptionText}>{caption}</Text>
          <View style={st.mediaCaptionMetaRight}>
            <Feather name="eye" size={13} color={mutedIcon} />
            <Text style={st.metaText}>{item.view_count ?? 0}</Text>
            <Text style={st.metaText}>{time}</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}


function buildOptimisticMessage({
  channelId,
  userId,
  type,
  content,
  media,
}: {
  channelId: string;
  userId: string;
  type: Message['msg_type'];
  content: string | null;
  media?: Message['media'];
}): Message {
  const now = Date.now();
  return {
    id: `temp-channel-post-${now}-${Math.round(Math.random() * 1000)}`,
    chat_id: channelId,
    sender_id: userId,
    msg_type: type,
    content,
    reply_to_id: null,
    thread_root_message_id: null,
    is_channel_post: 1,
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
    media,
  };
}

export function ChannelFeedScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelFeedStyles(c), [c]);
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const route = useRoute<Route>();
  const blurTargetRef = React.useRef<View | null>(null);
  const postContentRefs = React.useRef<Record<string, View | null>>({});
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const composerDockPaddingBottom = useChatComposerDockPaddingBottom(insets.bottom);
  const chatComposerKeyboard = useChatComposerKeyboard();
  const { dockAnimatedStyle: inputBarAnimatedStyle, listWrapAnimatedStyle } =
    useChatComposerKeyboardLiftStyles(chatComposerKeyboard);
  const { channelId, inviteToken: routeInviteToken } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const linkResolve = channelStore((state) => state.linkResolveByChannelId[channelId]);
  const feed = channelStore((state) => state.feedByChannelId[channelId] ?? EMPTY_FEED);
  const channelChat = chatStore(
    React.useCallback((state) => state.chats.find((chat) => chat.id === channelId) ?? null, [channelId])
  );
  const currentUserId = authStore((state) => state.user?.id ?? null);
  const [loading, setLoading] = React.useState(feed.length === 0);
  const [feedError, setFeedError] = React.useState<string | null>(null);
  const [privateInviteGate, setPrivateInviteGate] = React.useState(false);
  const [subscribeBusy, setSubscribeBusy] = React.useState(false);
  const [inputBarHeight, setInputBarHeight] = React.useState(88);
  const [menuState, setMenuState] = React.useState<{
    messageId: string;
    isMe: boolean;
    previewTop: number;
    previewLeft: number;
    previewWidth: number;
    previewHeight: number;
    menuTop: number;
    menuLeft: number;
    placement: 'above' | 'below';
    previewVerticalAlign?: 'top' | 'bottom';
  } | null>(null);
  const [menuMode, setMenuMode] = React.useState<MenuMode>('actions');
  const [forwardSourceMessageIds, setForwardSourceMessageIds] = React.useState<string[]>([]);
  const [feedMediaViewer, setFeedMediaViewer] = React.useState<{
    items: MediaTile[];
    index: number;
  } | null>(null);
  const sortedFeed = React.useMemo(() => sortPostsOldestFirst(feed), [feed]);
  const canComment = detail?.can_comment ?? false;
  const canReact = detail?.can_react ?? false;
  const activeMenuMessage = React.useMemo(
    () => (menuState ? sortedFeed.find((item) => item.id === menuState.messageId) ?? null : null),
    [menuState, sortedFeed],
  );

  const showStaffPostActions = React.useMemo(() => {
    if (!detail || !currentUserId) return false;
    const p = detail.channel_permissions;
    const m = detail.channel.members?.find((x) => x.user_id === currentUserId);
    if (m?.role === 'owner' || m?.role === 'admin') return true;
    if (detail.can_post) return true;
    if (p?.can_edit_channel) return true;
    if (p?.can_moderate_subscribers) return true;
    return false;
  }, [detail, currentUserId]);

  const pinnedMessageId = detail?.channel.pinned_message_id ?? null;
  const forwardTargets = React.useMemo(
    () => forwardSourceMessageIds.length > 0
      ? chatStore.getState().chats.filter((c) => c.id !== channelId)
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelId, forwardSourceMessageIds.length > 0]
  );

  const openChannelFeedMediaViewer = React.useCallback((message: Message, initialIndex: number) => {
    const items = buildChannelPostMediaTiles(message);
    if (items.length === 0) return;
    const idx = Math.max(0, Math.min(initialIndex, items.length - 1));
    setFeedMediaViewer({ items, index: idx });
  }, []);

  const closeChannelFeedMediaViewer = React.useCallback(() => {
    setFeedMediaViewer(null);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setFeedError(null);
    try {
      const next = await fetchChannelFeed(channelId);
      const store = channelStore.getState();
      store.upsertChannel(next.channel);
      store.setFeed(channelId, sortPostsOldestFirst(next.posts));
      chatStore.getState().addOrUpdateChat(next.channel);

      const currentDetail = store.detailsById[channelId];
      store.setDetail(channelId, {
        ...(currentDetail ?? {
          channel: next.channel,
          preview_posts: [],
          can_view_full_feed: next.can_view_full_feed,
          can_comment: next.can_comment,
          can_react: next.can_react,
          can_post: next.can_post,
          is_subscribed: next.is_subscribed,
          linked_discussion_chat_id: next.channel.linked_discussion_chat_id ?? null,
          channel_permissions: next.channel.channel_permissions,
        }),
        channel: next.channel,
          preview_posts: sortPostsOldestFirst(next.posts),
        can_view_full_feed: next.can_view_full_feed,
        can_comment: next.can_comment,
        can_react: next.can_react,
        can_post: next.can_post,
        is_subscribed: next.is_subscribed,
        linked_discussion_chat_id: next.channel.linked_discussion_chat_id ?? null,
        channel_permissions: next.channel.channel_permissions,
      });
      channelStore.getState().setLinkResolve(channelId, null);
      setPrivateInviteGate(false);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Не удалось загрузить ленту канала.';
      const lr = channelStore.getState().linkResolveByChannelId[channelId];
      const hasCached = (channelStore.getState().feedByChannelId[channelId]?.length ?? 0) > 0;
      if (
        lr &&
        lr.visibility === 'private' &&
        !lr.is_subscribed &&
        !hasCached
      ) {
        setPrivateInviteGate(true);
        setFeedError(null);
      } else if (hasCached) {
        Alert.alert('Не удалось обновить ленту', msg);
      } else {
        setFeedError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSubscribePublic = React.useCallback(async () => {
    setSubscribeBusy(true);
    try {
      await subscribeToChannel(channelId);
      const fresh = await fetchChannelDetail(channelId);
      channelStore.getState().setDetail(channelId, fresh);
      chatStore.getState().addOrUpdateChat(fresh.channel);
      await load();
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось подписаться.');
    } finally {
      setSubscribeBusy(false);
    }
  }, [channelId, load]);

  const handleSubscribePrivateInvite = React.useCallback(async () => {
    const ch = linkResolve?.channel;
    if (ch?.access_type === 'paid') {
      navigation.navigate('ChannelPreview', { channelId });
      return;
    }

    const token =
      routeInviteToken?.trim() ||
      linkResolve?.channel.invite_token?.trim() ||
      undefined;
    if (!token && linkResolve?.subscribe_requires_invite) {
      Alert.alert(
        'Нужна ссылка',
        'Откройте канал по полной пригласительной ссылке.',
      );
      return;
    }
    setSubscribeBusy(true);
    try {
      await subscribeToChannel(channelId, token ? { inviteToken: token } : {});
      const fresh = await fetchChannelDetail(channelId);
      channelStore.getState().setDetail(channelId, fresh);
      chatStore.getState().addOrUpdateChat(fresh.channel);
      channelStore.getState().setLinkResolve(channelId, null);
      setPrivateInviteGate(false);
      await load();
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось подписаться.');
    } finally {
      setSubscribeBusy(false);
    }
  }, [
    channelId,
    linkResolve?.channel,
    linkResolve?.subscribe_requires_invite,
    load,
    navigation,
    routeInviteToken,
  ]);

  const showPublicSubscribePill =
    !!detail &&
    !privateInviteGate &&
    !detail.is_subscribed &&
    (detail.channel.visibility ?? 'public') === 'public' &&
    !detail.can_view_full_feed;

  React.useEffect(() => {
    if (!isFocused) return;
    if (!WebSocketService.isConnected()) {
      WebSocketService.reconnect();
    }
  }, [isFocused]);

  const publishWithOptimistic = React.useCallback(
    async ({
      type,
      content,
      mediaPayload,
      optimisticMedia,
    }: {
      type: Message['msg_type'];
      content: string | null;
      mediaPayload?: ChannelPostMedia | ChannelPostMedia[];
      optimisticMedia?: Message['media'];
    }) => {
      if (!currentUserId) return;

      const optimistic = buildOptimisticMessage({
        channelId,
        userId: currentUserId,
        type,
        content,
        media: optimisticMedia,
      });

      const currentFeedBeforeSend = channelStore.getState().feedByChannelId[channelId] ?? [];
      channelStore
        .getState()
        .setFeed(channelId, sortPostsOldestFirst([...currentFeedBeforeSend, optimistic]));

      try {
        const uploadedMedia =
          mediaPayload !== undefined
            ? await ensureChannelPostMediaUploaded(type, mediaPayload)
            : undefined;
        const saved = await publishChannelPost(channelId, {
          msg_type: type,
          content,
          ...(uploadedMedia !== undefined ? { media: uploadedMedia } : {}),
        });
        const currentFeed = channelStore.getState().feedByChannelId[channelId] ?? [];
        channelStore
          .getState()
          .setFeed(
            channelId,
            sortPostsOldestFirst([
              ...currentFeed.filter((item) => item.id !== optimistic.id && item.id !== saved.id),
              saved,
            ])
          );
      } catch (error) {
        channelStore
          .getState()
          .setFeed(
            channelId,
            (channelStore.getState().feedByChannelId[channelId] ?? []).filter((item) => item.id !== optimistic.id)
          );
        Alert.alert(
          'Не удалось опубликовать пост',
          error instanceof Error ? error.message : 'Попробуйте еще раз.'
        );
      }
    },
    [channelId, currentUserId]
  );

  const handleSendText = React.useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content) return;
      void publishWithOptimistic({
        type: 'text',
        content,
      });
    },
    [publishWithOptimistic]
  );

  const handleSendVoice = React.useCallback(
    async (result: { uri: string; waveform: number[]; durationMs: number }) => {
      await publishWithOptimistic({
        type: 'voice',
        content: null,
        mediaPayload: {
          url: result.uri,
          waveform: result.waveform,
          duration_ms: result.durationMs,
        },
        optimisticMedia: [
          {
            remote_url: result.uri,
            waveform: result.waveform,
            duration_ms: result.durationMs,
          },
        ],
      });
    },
    [publishWithOptimistic]
  );

  const handleSendVideoNote = React.useCallback(
    async (result: { uri: string; durationMs: number; thumbnailUri?: string }) => {
      await publishWithOptimistic({
        type: 'video_note',
        content: null,
        mediaPayload: {
          url: result.uri,
          duration_ms: result.durationMs,
          thumbnail_url: result.thumbnailUri,
          is_round: true,
        },
        optimisticMedia: [
          {
            remote_url: result.uri,
            duration_ms: result.durationMs,
            thumbnail_url: result.thumbnailUri,
            is_round: true,
          },
        ],
      });
    },
    [publishWithOptimistic]
  );

  const handleSendMedia = React.useCallback(
    async (result: MediaPickResult) => {
      const type: Message['msg_type'] = result.kind === 'video' ? 'video' : 'image';
      await publishWithOptimistic({
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
        optimisticMedia: [
          {
            remote_url: result.uri,
            thumbnail_url: result.previewUri,
            width: result.width,
            height: result.height,
            duration_ms: result.durationMs,
            file_name: result.fileName,
          },
        ],
      });
    },
    [publishWithOptimistic]
  );

  const handleSendMediaAlbum = React.useCallback(
    async (result: MediaAlbumPickResult) => {
      const items = result.items.slice(0, 10);
      if (items.length === 0) return;

      const firstKind = items[0]?.kind ?? 'image';
      const type: Message['msg_type'] = firstKind === 'video' ? 'video' : 'image';
      const caption = result.caption?.trim() || null;

      await publishWithOptimistic({
        type,
        content: caption,
        mediaPayload: items.map((item) => ({
          media_type: item.kind,
          url: item.uri,
          thumbnail_url: item.previewUri,
          width: item.width,
          height: item.height,
          duration_ms: item.durationMs,
          file_name: item.fileName,
          mime_type: item.mimeType,
        })),
        optimisticMedia: items.map((item) => ({
          media_type: item.kind,
          remote_url: item.uri,
          thumbnail_url: item.previewUri,
          width: item.width,
          height: item.height,
          duration_ms: item.durationMs,
          file_name: item.fileName,
          mime_type: item.mimeType,
        })),
      });
    },
    [publishWithOptimistic],
  );

  const handleSendFile = React.useCallback(
    async (result: FilePickResult) => {
      await publishWithOptimistic({
        type: 'file',
        content: result.name,
        mediaPayload: {
          url: result.uri,
          file_name: result.name,
          file_size: result.size,
          mime_type: result.mimeType,
        },
        optimisticMedia: [
          {
            remote_url: result.uri,
            file_name: result.name,
            file_size: result.size,
          },
        ],
      });
    },
    [publishWithOptimistic]
  );

  const handleReaction = React.useCallback(
    async (message: Message, emoji: string) => {
      try {
        const reactions = await toggleChannelReaction(channelId, message.id, emoji);
        channelStore.getState().updateFeedMessage(channelId, message.id, { reactions });
      } catch (error) {
        Alert.alert(
          'Не удалось обновить реакцию',
          error instanceof Error ? error.message : 'Попробуйте еще раз.'
        );
      }
    },
    [channelId]
  );

  const setPostContentRef = React.useCallback((messageId: string, node: View | null) => {
    if (node) {
      postContentRefs.current[messageId] = node;
      return;
    }
    delete postContentRefs.current[messageId];
  }, []);

  const closeMenu = React.useCallback(() => {
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

  const menuActions = React.useMemo(() => {
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
          color: c.textPrimary,
          disabled: false,
          textOnly: true,
        },
      ];
    }

    const canFwd = canForwardMessage(activeMenuMessage);
    const isPinned = pinnedMessageId === activeMenuMessage.id;

    const replyCopy = [
      {
        key: 'reply',
        label: 'Ответить',
        icon: 'corner-left-up' as const,
        color: c.textPrimary,
        disabled: false,
      },
      { key: 'copy', label: 'Скопировать', icon: 'copy' as const, color: c.textPrimary, disabled: false },
    ];

    if (showStaffPostActions) {
      return [
        ...replyCopy,
        {
          key: 'pin',
          label: isPinned ? 'Открепить' : 'Закрепить',
          icon: 'bookmark' as const,
          color: c.textPrimary,
          disabled: false,
        },
        {
          key: 'forward',
          label: 'Переслать',
          icon: 'corner-up-right' as const,
          color: canFwd ? c.textPrimary : c.iconMuted,
          disabled: !canFwd,
        },
        {
          key: 'delete',
          label: 'Удалить',
          icon: 'trash-2' as const,
          color: '#E53935',
          disabled: false,
        },
      ];
    }

    return [
      ...replyCopy,
      {
        key: 'forward',
        label: 'Переслать',
        icon: 'corner-up-right' as const,
        color: canFwd ? c.textPrimary : c.iconMuted,
        disabled: !canFwd,
      },
    ];
  }, [activeMenuMessage, menuMode, pinnedMessageId, showStaffPostActions, c]);

  const handlePinToggle = React.useCallback(
    (message: Message) => {
      const nextPinnedId = pinnedMessageId === message.id ? null : message.id;
      if (channelChat) {
        chatStore.getState().updateChat({
          ...channelChat,
          pinned_message_id: nextPinnedId,
        });
      }
      TransportService.pinMessage(channelId, nextPinnedId);
      closeMenu();
    },
    [channelChat, channelId, closeMenu, pinnedMessageId],
  );

  const confirmDeletePost = React.useCallback(
    (message: Message) => {
      channelStore.getState().updateFeedMessage(channelId, message.id, {
        is_deleted: 1,
        content: null,
      });
      if (pinnedMessageId === message.id && channelChat) {
        chatStore.getState().updateChat({
          ...channelChat,
          pinned_message_id: null,
        });
        TransportService.pinMessage(channelId, null);
      }
      TransportService.deleteMessage(channelId, message.id);
      closeMenu();
    },
    [channelChat, channelId, closeMenu, pinnedMessageId],
  );

  const handleForwardFromMenu = React.useCallback(
    (message: Message) => {
      closeMenu();
      setTimeout(() => setForwardSourceMessageIds([message.id]), 150);
    },
    [closeMenu],
  );

  const handleForwardToChat = React.useCallback(
    (targetChatId: string) => {
      if (!currentUserId) {
        Alert.alert('Не удалось переслать', 'Сначала нужно заново авторизоваться.');
        setForwardSourceMessageIds([]);
        return;
      }

      const sourceMessages = forwardSourceMessageIds
        .map((id) => sortedFeed.find((m) => m.id === id) ?? null)
        .filter((m): m is Message => m != null)
        .sort((a, b) => a.created_at - b.created_at);

      if (sourceMessages.length === 0) {
        setForwardSourceMessageIds([]);
        return;
      }

      const channelTitle = detail?.channel?.name?.trim() || 'Канал';
      let sentCount = 0;

      for (const [index, message] of sourceMessages.entries()) {
        const forwardedFromName = channelTitle;
        const forwardedFromMessageId = message.forwarded_from_message_id ?? message.id;
        const forwardedFromChatId = message.forwarded_from_chat_id ?? message.chat_id;
        const forwardedFromSenderId = message.forwarded_from_sender_id ?? message.sender_id;
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
          TransportService.forwardMessage(
            targetChatId,
            message,
            {
              messageId: forwardedFromMessageId,
              name: forwardedFromName,
              chatId: forwardedFromChatId,
              senderId: forwardedFromSenderId,
            },
            tempId,
          )
        ) {
          messageStore.getState().prependMessage(targetChatId, optimisticMessage);
          const targetChat = chatStore.getState().getChatById(targetChatId);
          if (targetChat) {
            chatStore.getState().updateChat({
              ...targetChat,
              last_message_id: tempId,
              last_message_at: now,
              last_message_preview: buildChannelForwardPreview(message),
            });
          }
          sentCount += 1;
        }
      }

      setForwardSourceMessageIds([]);
      if (sentCount === 0) {
        Alert.alert('Не удалось переслать', 'Проверьте соединение.');
      }
    },
    [currentUserId, detail?.channel?.name, forwardSourceMessageIds, sortedFeed],
  );

  const handlePostMenuAction = React.useCallback(
    async (key: string) => {
      if (!activeMenuMessage) return;

      if (menuMode === 'deleteConfirm') {
        if (key === 'delete_confirm') {
          confirmDeletePost(activeMenuMessage);
        } else if (key === 'delete_cancel') {
          setMenuMode('actions');
        }
        return;
      }

      switch (key as PostMenuActionKey) {
        case 'reply':
          closeMenu();
          navigation.navigate('ChannelDiscussion', {
            channelId,
            postId: activeMenuMessage.id,
          });
          return;
        case 'copy': {
          const value = getCopyableContent(activeMenuMessage);
          closeMenu();
          if (!value) {
            Alert.alert('Нечего копировать', 'В этой публикации нет текста для копирования.');
            return;
          }
          await Clipboard.setStringAsync(value);
          return;
        }
        case 'pin':
          handlePinToggle(activeMenuMessage);
          return;
        case 'forward':
          handleForwardFromMenu(activeMenuMessage);
          return;
        case 'delete':
          setMenuMode('deleteConfirm');
          return;
        default:
          return;
      }
    },
    [
      activeMenuMessage,
      channelId,
      closeMenu,
      confirmDeletePost,
      handleForwardFromMenu,
      handlePinToggle,
      menuMode,
      navigation,
    ],
  );

  const openPostInteractionMenu = React.useCallback(
    (message: Message) => {
      const target = postContentRefs.current[message.id];
      if (!target) return;

      Keyboard.dismiss();
      setMenuMode('actions');

      const staff = showStaffPostActions;
      const actionCount = staff ? 5 : 3;
      /** Запас по высоте меню (основное + экран подтверждения удаления, скругления). */
      const menuHeight =
        Math.max(
          estimateMenuCardHeight(actionCount),
          estimateMenuCardHeight(2),
        ) + 10;

      const REACTION_BAR_HEIGHT = 42;
      const REACTION_ABOVE_GAP = 6;
      const menuGap = 4;

      const subscribePillOffset = showPublicSubscribePill && !detail?.can_post ? 58 : 0;
      const composerOffset = (detail?.can_post ? inputBarHeight : 0) + subscribePillOffset;
      const bottomSafety = 28;
      const bottomChrome =
        composerOffset + Math.max(insets.bottom, 12) + bottomSafety;
      const effectiveBottom = SCREEN_HEIGHT - bottomChrome;

      target.measureInWindow((pageX, pageY, width, height) => {
        const previewWidth = Math.min(Math.ceil(width) + 1, SCREEN_WIDTH - MENU_EDGE_GAP * 2);
        const previewLeft = Math.max(
          MENU_EDGE_GAP,
          Math.min(pageX, SCREEN_WIDTH - previewWidth - MENU_EDGE_GAP),
        );

        const minPreviewTopForReactions = canReact
          ? Math.max(insets.top + 6, MENU_EDGE_GAP + REACTION_BAR_HEIGHT + REACTION_ABOVE_GAP)
          : Math.max(insets.top + 6, MENU_EDGE_GAP);

        /** Длинный текст: полная высота поста + меню не помещается на экран — ограничиваем срез превью. */
        const spaceForPreview =
          effectiveBottom - minPreviewTopForReactions - menuGap - menuHeight;
        const previewDisplayHeight = Math.min(height, Math.max(0, spaceForPreview));

        const columnBelowPreview = previewDisplayHeight + menuGap + menuHeight;
        const maxPreviewTopSoMenuFits = effectiveBottom - columnBelowPreview;

        let previewTop = Math.min(pageY, maxPreviewTopSoMenuFits);
        previewTop = Math.max(minPreviewTopForReactions, previewTop);

        if (previewTop + columnBelowPreview > effectiveBottom) {
          previewTop = Math.max(MENU_EDGE_GAP, effectiveBottom - columnBelowPreview);
        }

        const menuTop = previewTop + previewDisplayHeight + menuGap;

        const menuLeft = Math.max(
          MENU_EDGE_GAP,
          Math.min(previewLeft, SCREEN_WIDTH - MENU_WIDTH - MENU_EDGE_GAP),
        );

        setMenuState({
          messageId: message.id,
          isMe: false,
          previewTop,
          previewLeft,
          previewWidth,
          previewHeight: previewDisplayHeight,
          menuTop,
          menuLeft,
          placement: 'below',
          previewVerticalAlign:
            previewDisplayHeight < height ? 'top' : undefined,
        });
      });
    },
    [
      canReact,
      detail?.can_post,
      insets.bottom,
      insets.top,
      inputBarHeight,
      showPublicSubscribePill,
      showStaffPostActions,
    ],
  );

  React.useEffect(() => {
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

  const handlePickReactionFromMenu = React.useCallback(async (emoji: string) => {
    if (!activeMenuMessage) return;
    await handleReaction(activeMenuMessage, emoji);
    closeMenu();
  }, [activeMenuMessage, closeMenu, handleReaction]);

  const handleInputBarLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== inputBarHeight) {
      setInputBarHeight(nextHeight);
    }
  }, [inputBarHeight]);

  const renderPostContent = React.useCallback(
    (item: Message, options?: RenderPostContentOptions) => {
      const media = item.media?.[0];
      const remoteUri =
        media?.remote_url != null && media.remote_url.trim() !== ''
          ? media.remote_url
          : undefined;
      const thumbUri =
        media?.thumbnail_url != null && media.thumbnail_url.trim() !== ''
          ? media.thumbnail_url
          : undefined;
      const visualMediaCount =
        item.msg_type === 'image' || item.msg_type === 'video'
          ? item.media?.filter((entry) => entry.remote_url?.trim()).length ?? 0
          : 0;
      const time = formatTime(item.created_at);
      const lineId = item.chat_id || channelId;

      if (visualMediaCount > 1) {
        return renderChannelMediaAlbum(item, time, styles, {
          visualMediaWidth: options?.visualMediaWidth,
          onTilePress: (idx) => openChannelFeedMediaViewer(item, idx),
          mutedIcon: c.textSecondary,
          lineSyncLineId: lineId,
        });
      }

      const voiceUri =
        item.msg_type === 'voice' ? resolveVoiceMessageUri(item) ?? remoteUri : undefined;

      if (item.msg_type === 'voice' && voiceUri) {
        const m0 = item.media?.[0];
        return (
          <PeerFirstVoiceBubble
            lineId={lineId}
            serverUri={voiceUri}
            waveform={m0?.waveform ?? []}
            durationMs={m0?.duration_ms ?? 0}
            isMe={false}
            embedded
            time={time}
            viewCount={item.view_count ?? 0}
            status={item.status}
            incomingBubbleBackground={c.bubbleOther}
            incomingBubbleBorderColor={c.bubbleOtherBorder}
            incomingDurationColor={c.textSecondary}
          />
        );
      }

      if (item.msg_type === 'video_note' && media) {
        const noteUri =
          resolveVoiceMessageUri(item) ??
          (remoteUri ? resolveMediaUrl(remoteUri.trim() || null) ?? remoteUri : '');
        if (noteUri.trim()) {
          return (
            <PeerFirstVideoNoteBubble
              lineId={lineId}
              serverUri={noteUri}
              messageId={item.id}
              thumbnailUri={thumbUri ?? undefined}
              durationMs={media.duration_ms ?? 0}
              isMe={false}
              embedded
              time={time}
              status={item.status}
              registerPlaybackState={false}
            />
          );
        }
      }

      if (item.msg_type === 'image' && remoteUri) {
        const caption = item.content?.trim() ?? '';
        const hasCaption = caption.length > 0;
        const mediaSize = resolveVisualMediaSize(media, options?.visualMediaWidth);
        const imageUri = resolveMediaUrl(remoteUri.trim() || null) ?? remoteUri;
        return (
          <>
            <PeerFirstImageBubble
              lineId={lineId}
              serverUri={imageUri}
              isMe={false}
              embedded
              centered
              fixedSize
              width={mediaSize.width}
              height={mediaSize.height}
              time={hasCaption ? undefined : time}
              status={item.status}
              viewCount={hasCaption ? undefined : item.view_count ?? 0}
              contentFit="cover"
              onOpenFullscreen={() => openChannelFeedMediaViewer(item, 0)}
              thumbId={channelPostMediaTileId(item.id, 0)}
              incomingBubbleBackground={c.bubbleOther}
              incomingBubbleBorderColor={c.bubbleOtherBorder}
              incomingCaptionTextColor={c.textPrimary}
            />
            {hasCaption ? (
              <View style={styles.mediaCaptionBlock}>
                <Text style={styles.mediaCaptionText}>{caption}</Text>
                <View style={styles.mediaCaptionMetaRight}>
                  <Feather name="eye" size={13} color={c.textSecondary} />
                  <Text style={styles.metaText}>{item.view_count ?? 0}</Text>
                  <Text style={styles.metaText}>{time}</Text>
                </View>
              </View>
            ) : null}
          </>
        );
      }

      if (item.msg_type === 'video' && remoteUri) {
        const caption = item.content?.trim() ?? '';
        const hasCaption = caption.length > 0;
        const mediaSize = resolveVisualMediaSize(media, options?.visualMediaWidth);
        const videoUri = resolveMediaUrl(remoteUri.trim() || null) ?? remoteUri;
        return (
          <>
            <PeerFirstVideoBubble
              lineId={lineId}
              serverUri={videoUri}
              thumbnailUri={thumbUri ?? undefined}
              isMe={false}
              embedded
              centered
              fixedSize
              width={mediaSize.width}
              height={mediaSize.height}
              durationMs={media?.duration_ms ?? 0}
              time={hasCaption ? undefined : time}
              status={item.status}
              viewCount={hasCaption ? undefined : item.view_count ?? 0}
              onOpenFullscreen={() => openChannelFeedMediaViewer(item, 0)}
              thumbId={channelPostMediaTileId(item.id, 0)}
              incomingBubbleBackground={c.bubbleOther}
              incomingBubbleBorderColor={c.bubbleOtherBorder}
              incomingCaptionTextColor={c.textPrimary}
            />
            {hasCaption ? (
              <View style={styles.mediaCaptionBlock}>
                <Text style={styles.mediaCaptionText}>{caption}</Text>
                <View style={styles.mediaCaptionMetaRight}>
                  <Feather name="eye" size={13} color={c.textSecondary} />
                  <Text style={styles.metaText}>{item.view_count ?? 0}</Text>
                  <Text style={styles.metaText}>{time}</Text>
                </View>
              </View>
            ) : null}
          </>
        );
      }

      if (item.msg_type === 'file' && remoteUri) {
        const fileUri = resolveMediaUrl(remoteUri.trim() || null) ?? remoteUri;
        return (
          <PeerFirstFileBubble
            lineId={lineId}
            serverUri={fileUri}
            fileName={media?.file_name ?? item.content ?? 'Файл'}
            fileSize={media?.file_size}
            isMe={false}
            caption={item.content}
            time={time}
            status={item.status}
            incomingBubbleBackground={c.bubbleOther}
            incomingBubbleBorderColor={c.bubbleOtherBorder}
            incomingFileNameColor={c.textPrimary}
            incomingSecondaryTextColor={c.textSecondary}
            incomingCaptionColor={c.textPrimary}
          />
        );
      }

      return (
        <>
          <Text style={styles.postText}>{item.content || 'Публикация'}</Text>
          <View style={styles.postFooter}>
            <View style={styles.footerMetric}>
              <Feather name="eye" size={13} color={c.textSecondary} />
              <Text style={styles.metaText}>{item.view_count ?? 0}</Text>
            </View>
            <Text style={styles.metaText}>{time}</Text>
          </View>
        </>
      );
    },
    [openChannelFeedMediaViewer, styles, c, channelId]
  );

  const renderPostExtras = React.useCallback(
    (item: Message) => {
      const hasReactions = (item.reactions?.length ?? 0) > 0;
      const itemCanComment = canCommentOnPost(item, detail?.channel, canComment);
      if (!itemCanComment && !hasReactions) return null;
      const isVisual = item.msg_type === 'image' || item.msg_type === 'video';

      return (
        <View style={[styles.postActionsRow, isVisual && styles.postActionsRowMedia]}>
          {itemCanComment ? (
            <Pressable
              style={({ pressed }) => [styles.discussionPill, pressed && styles.discussionPillPressed]}
              onPress={() =>
                navigation.navigate('ChannelDiscussion', {
                  channelId,
                  postId: item.id,
                })
              }
            >
              <Feather name="message-circle" size={14} color={c.accent} />
              <Text style={styles.discussionLink}>{item.comment_count ?? 0} комментариев</Text>
            </Pressable>
          ) : null}
          {hasReactions ? (
            <View style={styles.reactionSummaryRow}>
              {item.reactions?.map((reaction) => (
                <Text key={reaction.emoji} style={styles.reactionSummaryText}>
                  {reaction.emoji} {reaction.count}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      );
    },
    [canComment, detail?.channel, channelId, navigation, styles, c],
  );

  const renderPostExtrasPreview = React.useCallback(
    (item: Message) => {
      const hasReactions = (item.reactions?.length ?? 0) > 0;
      const itemCanComment = canCommentOnPost(item, detail?.channel, canComment);
      if (!itemCanComment && !hasReactions) return null;
      const isVisual = item.msg_type === 'image' || item.msg_type === 'video';

      return (
        <View
          style={[
            styles.postActionsRow,
            isVisual && styles.postActionsRowMedia,
            isVisual && styles.postActionsRowPreviewMedia,
          ]}
        >
          {itemCanComment ? (
            <Pressable
              style={({ pressed }) => [
                styles.discussionPill,
                isVisual && styles.discussionPillPreview,
                pressed && styles.discussionPillPressed,
              ]}
              onPress={() =>
                navigation.navigate('ChannelDiscussion', {
                  channelId,
                  postId: item.id,
                })
              }
            >
              <View style={styles.discussionPreviewLeft}>
                <Feather name="message-circle" size={14} color={c.accent} />
                <Text style={styles.discussionLink}>
                  {item.comment_count ?? 0} комментариев
                </Text>
              </View>
              {isVisual ? (
                <Feather
                  name="chevron-right"
                  size={16}
                  color={c.accent}
                  style={styles.discussionPreviewChevron}
                />
              ) : null}
            </Pressable>
          ) : null}
          {hasReactions ? (
            <View style={styles.reactionSummaryRow}>
              {item.reactions?.map((reaction) => (
                <Text key={reaction.emoji} style={styles.reactionSummaryText}>
                  {reaction.emoji} {reaction.count}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      );
    },
    [canComment, detail?.channel, channelId, navigation, styles, c],
  );

  const renderPost = React.useCallback(
    ({ item }: { item: Message }) => {
      const media = item.media?.[0];
      const isVisualMediaPost = item.msg_type === 'image' || item.msg_type === 'video';
      const isVoicePost = item.msg_type === 'voice';
      const mediaWidth = isVisualMediaPost ? (computeChannelMediaWidth(media) ?? 240) : null;
      const hasReactions = (item.reactions?.length ?? 0) > 0;
      const itemCanComment = canCommentOnPost(item, detail?.channel, canComment);

      const openMenuGesture = Gesture.LongPress()
        .minDuration(220)
        .onStart(() => {
          runOnJS(openPostInteractionMenu)(item);
        });

      return (
      <GestureDetector gesture={openMenuGesture}>
        <View style={styles.postWrap} collapsable={false}>
          <View
            ref={(node) => setPostContentRef(item.id, node)}
            style={[
              styles.postBubble,
              isVisualMediaPost && styles.postBubbleVisualMedia,
              isVoicePost && styles.postBubbleVoice,
              isVisualMediaPost && mediaWidth ? { width: mediaWidth } : null,
            ]}
          >
            {isVisualMediaPost ? (
              <View style={styles.mediaContentWrap}>
                {renderPostContent(item, { visualMediaWidth: mediaWidth ?? undefined })}
              </View>
            ) : (
              renderPostContent(item)
            )}

            {itemCanComment || hasReactions ? (
              <View style={[styles.postActionsRow, isVisualMediaPost && styles.postActionsRowMedia]}>
                {itemCanComment ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.discussionPill,
                      isVisualMediaPost && styles.discussionPillMedia,
                      pressed && styles.discussionPillPressed,
                    ]}
                    onPress={() =>
                      navigation.navigate('ChannelDiscussion', {
                        channelId,
                        postId: item.id,
                      })
                    }
                  >
                    <Feather name="message-circle" size={14} color={c.accent} />
                    {/* Без numberOfLines + flexShrink: иначе после возврата с профиля RN даёт тексту чуть меньшую ширину и режет хвост / «…» */}
                    <Text style={styles.discussionLink}>
                      {(item.comment_count ?? 0) > 0
                        ? `${item.comment_count} комментариев`
                        : 'Прокомментировать'}
                    </Text>
                  </Pressable>
                ) : null}
                {hasReactions ? (
                  <View style={styles.reactionSummaryRow}>
                    {item.reactions?.map((reaction) => (
                      <Text key={reaction.emoji} style={styles.reactionSummaryText}>
                        {reaction.emoji} {reaction.count}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </GestureDetector>
      );
    },
    [canComment, detail?.channel, channelId, navigation, openPostInteractionMenu, renderPostContent, setPostContentRef, styles, c]
  );

  const renderMenuPreviewBody = React.useCallback(
    (message: Message, forcedWidth?: number) => {
      const isVisualMediaPost = message.msg_type === 'image' || message.msg_type === 'video';
      const previewWidth = forcedWidth ? Math.ceil(forcedWidth) : undefined;
      const visualMediaWidth = isVisualMediaPost && previewWidth
        ? Math.max(120, previewWidth - 12)
        : undefined;

      return (
        <View
          style={[
            styles.menuPreviewBubble,
            isVisualMediaPost && styles.postBubbleVisualMedia,
            message.msg_type === 'voice' && styles.postBubbleVoice,
            previewWidth ? { width: previewWidth } : null,
          ]}
        >
          {isVisualMediaPost ? (
            <View style={styles.mediaContentWrap}>
              {renderPostContent(message, { visualMediaWidth })}
            </View>
          ) : (
            renderPostContent(message)
          )}
          {renderPostExtrasPreview(message)}
        </View>
      );
    },
    [renderPostContent, renderPostExtrasPreview, styles, c],
  );

  const headerChannel = React.useMemo(
    () => detail?.channel ?? channelChat ?? linkResolve?.channel ?? null,
    [channelChat, detail?.channel, linkResolve?.channel],
  );
  const headerTitle = headerChannel?.name?.trim() || 'Канал';
  const headerAvatar = resolveAvatarUrl(headerChannel?.avatar_url ?? null);
  const headerSubtitle = `${headerChannel?.subscriber_count ?? 0} подписчиков`;

  const openChannelProfile = React.useCallback(() => {
    navigation.navigate('ChannelProfile', { channelId });
  }, [channelId, navigation]);

  const gateChannel = linkResolve?.channel ?? headerChannel;
  const lockedAvatar = resolveAvatarUrl(gateChannel?.avatar_url ?? null);
  const lockedTitle = gateChannel?.name?.trim() || headerTitle;
  const lockedDesc = gateChannel?.description?.trim() || '';

  if (privateInviteGate && linkResolve && sortedFeed.length === 0) {
    return (
      <View style={styles.container}>
        <ChatBackgroundPattern />
        <View style={[styles.privateGateWrap, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {lockedAvatar ? (
            <Image source={{ uri: lockedAvatar }} style={styles.privateGateAvatar} contentFit="cover" cachePolicy="disk" />
          ) : (
            <View style={styles.privateGateAvatarPlaceholder}>
              <Text style={styles.privateGateAvatarLetter}>{(lockedTitle[0] || '?').toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.privateGateTitle}>{lockedTitle}</Text>
          {lockedDesc ? <Text style={styles.privateGateDesc}>{lockedDesc}</Text> : null}
          <Text style={styles.privateGateHint}>
            Частный канал. Подпишитесь, чтобы видеть публикации.
          </Text>
          <Pressable
            onPress={() => void handleSubscribePrivateInvite()}
            disabled={subscribeBusy}
            style={({ pressed }) => [
              styles.privateGateButton,
              pressed && styles.privateGateButtonPressed,
              subscribeBusy && styles.privateGateButtonDisabled,
            ]}
          >
            {subscribeBusy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.privateGateButtonText}>Подписаться</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.feedRootTransparent]}>
      <InteractiveChatBackShell
        navigation={navigation}
        gestureEnabled={!menuState && forwardSourceMessageIds.length === 0}
        onBackPress={() => {
          if (menuState) {
            closeMenu();
            return true;
          }
          if (forwardSourceMessageIds.length > 0) {
            setForwardSourceMessageIds([]);
            return true;
          }
          return false;
        }}
      >
        {Platform.OS === 'android' ? (
          <CustomAndroidChatHeader
            title={headerTitle}
            subtitle={headerSubtitle}
            avatarUrl={headerAvatar}
            isGroupChat={false}
            peerId={null}
            chatId={channelId}
            navigation={navigation}
            onTitlePress={openChannelProfile}
            floating
          />
        ) : null}

      <BlurTargetView ref={blurTargetRef} collapsable={false} style={[styles.container, { backgroundColor: c.chatBackground }]}>
      <ChatBackgroundPattern />
      {Platform.OS === 'android' ? (
        <View style={{ height: insets.top + ANDROID_CHAT_HEADER_TOOLBAR_HEIGHT }} />
      ) : null}
      {feedError && sortedFeed.length === 0 ? (
        <LoadErrorState message={feedError} onRetry={() => void load()} />
      ) : loading && feed.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <Reanimated.View style={[styles.listWrap, listWrapAnimatedStyle]}>
          <FlatList
            data={sortedFeed}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            removeClippedSubviews={false}
            refreshing={loading}
            onRefresh={() => void load()}
            contentContainerStyle={[
              styles.list,
              detail?.can_post
                ? {
                    paddingBottom:
                      inputBarHeight +
                      composerDockPaddingBottom +
                      12 +
                      (showPublicSubscribePill ? 56 : 0),
                  }
                : {
                    ...styles.listWithoutComposer,
                    paddingBottom:
                      24 + (showPublicSubscribePill ? 56 + Math.max(insets.bottom, 8) : 0),
                  },
            ]}
            ListEmptyComponent={<Text style={styles.emptyText}>Пока нет публикаций</Text>}
          />
        </Reanimated.View>
      )}

      {showPublicSubscribePill ? (
        <View
          style={[
            styles.subscribePillWrap,
            {
              bottom:
                Math.max(composerDockPaddingBottom, 10) +
                (detail?.can_post ? inputBarHeight : 0),
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => void handleSubscribePublic()}
            disabled={subscribeBusy}
            style={({ pressed }) => [
              styles.subscribePill,
              pressed && styles.subscribePillPressed,
              subscribeBusy && styles.subscribePillDisabled,
            ]}
          >
            {subscribeBusy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.subscribePillText}>Подписаться</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {detail?.can_post ? (
        <ChatInputDock
          onLayout={handleInputBarLayout}
          animatedStyle={[
            styles.inputBarWrap,
            inputBarAnimatedStyle,
            { paddingBottom: composerDockPaddingBottom },
          ]}
          placeholder="Публикация"
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendVideoNote={handleSendVideoNote}
          onSendMedia={handleSendMedia}
          onSendMediaAlbum={handleSendMediaAlbum}
          onSendFile={handleSendFile}
          blurTargetRef={blurTargetRef}
          replyToMessage={null}
          replyAuthorName={null}
          onCancelReply={() => undefined}
          isScreenFocused={isFocused}
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
        showReactions={canReact && menuMode === 'actions'}
        showMenuCard={menuActions.length > 0}
        menuCardWidth={menuMode === 'deleteConfirm' ? 224 : undefined}
        onClose={closeMenu}
        onMenuAction={(key) => {
          void handlePostMenuAction(key);
        }}
        onPickReaction={(emoji) => {
          void handlePickReactionFromMenu(emoji);
        }}
        renderMenuPreviewBody={renderMenuPreviewBody}
      />

      <ChatForwardSheet
        visible={forwardSourceMessageIds.length > 0}
        chats={forwardTargets}
        onClose={() => setForwardSourceMessageIds([])}
        onSelectChat={(targetChatId) => handleForwardToChat(targetChatId)}
      />

      <ChatProfileMediaViewerModal
        visible={feedMediaViewer != null}
        items={feedMediaViewer?.items ?? []}
        selectedIndex={feedMediaViewer?.index ?? 0}
        onChangeIndex={(idx) =>
          setFeedMediaViewer((prev) => (prev ? { ...prev, index: idx } : null))
        }
        onClose={closeChannelFeedMediaViewer}
      />
    </View>
  );
}


