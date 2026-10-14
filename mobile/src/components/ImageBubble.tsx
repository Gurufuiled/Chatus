import React, { useCallback, useEffect, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
import { colors, bubbleRadius, typography } from '../theme/colors';
import { MessageReactionInline, type InlineReactionItem } from './MessageReactionInline';
import { MessageTimeStatus } from './MessageTimeStatus';
import type { MessageSource } from '../stores/types';
import { MessageTextBubbleBody } from './MessageTextBubbleBody';
import { SingleImageViewerModal } from './SingleImageViewerModal';
import { registerMediaThumb, unregisterMediaThumb } from '../utils/mediaThumbRegistry';
import { computeMediaDisplaySize, shouldFloatMediaReactions } from '../utils/mediaBubbleLayout';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.68, 300);
const MAX_BUBBLE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.48, 360);
const DEFAULT_PLACEHOLDER_SIZE = {
  width: Math.min(MAX_BUBBLE_WIDTH, 192),
  height: Math.min(MAX_BUBBLE_HEIGHT, 192),
};
const loadedImageUris = new Set<string>();

export interface ImageBubbleProps {
  uri: string;
  isMe: boolean;
  width?: number;
  height?: number;
  caption?: string;
  time?: string;
  status?: string;
  embedded?: boolean;
  header?: React.ReactNode;
  bubbleMeColor?: string;
  outgoingTextColor?: string;
  centered?: boolean;
  viewCount?: number;
  contentFit?: ImageContentFit;
  /** If true, use provided width/height as-is without internal clamping. */
  fixedSize?: boolean;
  /** Parent handles fullscreen (e.g. swipe-to-dismiss profile viewer). */
  onOpenFullscreen?: () => void;
  /** id медиа во вьювере родителя: регистрирует фото, чтобы при закрытии свайпом оно «садилось» сюда. */
  thumbId?: string;
  inlineReactions?: InlineReactionItem[];
  allowMessageReactions?: boolean;
  onToggleInlineReaction?: (emoji: string) => void;
  reactionAccentColor?: string;
  incomingBubbleBackground?: string;
  incomingBubbleBorderColor?: string;
  incomingCaptionTextColor?: string;
  /** Override clamp for media box (e.g. Telegram channel almost full width). */
  mediaClamp?: { maxWidth: number; maxHeight: number };
  /** Channel incoming post: stretch card, flush media top corners, optional footer bar. */
  incomingChannelPost?: boolean;
  footer?: React.ReactNode;
  viewCountShortLabel?: string;
  /** Full-resolution file still downloading (show centered loader over preview). */
  loadingFullQuality?: boolean;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  source?: MessageSource;
}

function computeDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = MAX_BUBBLE_WIDTH,
  maxHeight: number = MAX_BUBBLE_HEIGHT,
): { width: number; height: number } {
  return computeMediaDisplaySize(naturalWidth, naturalHeight, maxWidth, maxHeight, {
    width: maxWidth,
    height: maxHeight,
  });
}

function resolveKnownDisplaySize(
  width?: number,
  height?: number,
  maxWidth: number = MAX_BUBBLE_WIDTH,
  maxHeight: number = MAX_BUBBLE_HEIGHT,
): { width: number; height: number } | null {
  if (width == null || height == null) return null;
  return computeDisplaySize(width, height, maxWidth, maxHeight);
}

export function ImageBubble({
  uri,
  isMe,
  width: propWidth,
  height: propHeight,
  caption,
  time,
  status,
  embedded = false,
  header,
  bubbleMeColor,
  outgoingTextColor,
  centered = false,
  viewCount,
  contentFit = 'cover',
  fixedSize = false,
  onOpenFullscreen,
  thumbId,
  inlineReactions,
  allowMessageReactions,
  onToggleInlineReaction,
  reactionAccentColor,
  incomingBubbleBackground,
  incomingBubbleBorderColor,
  incomingCaptionTextColor,
  mediaClamp,
  incomingChannelPost = false,
  footer,
  viewCountShortLabel,
  loadingFullQuality = false,
  style,
  source,
}: ImageBubbleProps) {
  const normalizedUri = uri.trim();
  const maxW = mediaClamp?.maxWidth ?? MAX_BUBBLE_WIDTH;
  const maxH = mediaClamp?.maxHeight ?? MAX_BUBBLE_HEIGHT;
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(() =>
    fixedSize && propWidth && propHeight
      ? { width: propWidth, height: propHeight }
      : resolveKnownDisplaySize(propWidth, propHeight, maxW, maxH)
  );
  const [imageLoaded, setImageLoaded] = useState(() =>
    normalizedUri.length > 0 && loadedImageUris.has(normalizedUri)
  );
  const [loadError, setLoadError] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  useEffect(() => {
    setLoadError(false);
    setImageLoaded(normalizedUri.length > 0 && loadedImageUris.has(normalizedUri));

    if (fixedSize && propWidth && propHeight) {
      setDisplaySize({ width: propWidth, height: propHeight });
      return;
    }
    const knownDisplaySize = resolveKnownDisplaySize(propWidth, propHeight, maxW, maxH);
    if (!normalizedUri) {
      setDisplaySize({
        width: Math.min(maxW, DEFAULT_PLACEHOLDER_SIZE.width),
        height: Math.min(maxH, DEFAULT_PLACEHOLDER_SIZE.height),
      });
      return;
    }
    if (knownDisplaySize) {
      setDisplaySize(knownDisplaySize);
      return;
    }

    // Wait for expo-image onLoad instead of blocking getSize.
    setDisplaySize({
      width: Math.min(maxW, DEFAULT_PLACEHOLDER_SIZE.width),
      height: Math.min(maxH, DEFAULT_PLACEHOLDER_SIZE.height),
    });
  }, [normalizedUri, propWidth, propHeight, fixedSize, maxW, maxH]);

  const isDataPreviewUri = normalizedUri.startsWith('data:');
  const isLocalFileUri = normalizedUri.startsWith('file://');
  const hasUri = normalizedUri.length > 0;
  /**
   * Мини-превью (data:), которое уже было на экране до полного фото. Когда адрес меняется на файл, оно остаётся
   * плейсхолдером и плавно переходит в полное фото. Раньше картинка пересоздавалась: мини-превью пропадало, на
   * секунду появлялся спиннер, и фото «долго прогружалось».
   */
  const lastPreviewUriRef = useRef('');
  const placeholderUri = !isDataPreviewUri && hasUri ? lastPreviewUriRef.current : '';
  useEffect(() => {
    if (isDataPreviewUri) {
      lastPreviewUriRef.current = normalizedUri;
    } else if (!normalizedUri) {
      lastPreviewUriRef.current = '';
    }
  }, [isDataPreviewUri, normalizedUri]);
  useEffect(() => {
    if (!isDataPreviewUri || incomingChannelPost || loadingFullQuality) return;
    const t = setTimeout(() => setImageLoaded(true), 80);
    return () => clearTimeout(t);
  }, [isDataPreviewUri, incomingChannelPost, loadingFullQuality, normalizedUri]);

  useEffect(() => {
    if (incomingChannelPost && isLocalFileUri) {
      setImageLoaded(true);
    }
  }, [incomingChannelPost, isLocalFileUri, normalizedUri]);

  /** Avoid endless gray placeholder if decode callbacks never fire (seen on some Android builds). */
  useEffect(() => {
    if (!normalizedUri || imageLoaded || loadError) return;
    const t = setTimeout(() => {
      setImageLoaded(true);
    }, 35000);
    return () => clearTimeout(t);
  }, [normalizedUri, imageLoaded, loadError]);

  const handlePress = useCallback(() => {
    if (onOpenFullscreen) {
      onOpenFullscreen();
      return;
    }
    setFullscreenVisible(true);
  }, [onOpenFullscreen]);

  const handleClose = useCallback(() => {
    setFullscreenVisible(false);
  }, []);

  /** Само фото в сообщении: сюда «садится» полноэкранное при закрытии свайпом. */
  const imageWrapperRef = useRef<View>(null);
  useEffect(() => {
    const node = imageWrapperRef.current;
    if (!node || !thumbId) return;
    registerMediaThumb(thumbId, node);
    return () => unregisterMediaThumb(thumbId, node);
  }, [thumbId]);

  const w = displaySize?.width ?? Math.min(maxW, DEFAULT_PLACEHOLDER_SIZE.width);
  const h = displaySize?.height ?? Math.min(maxH, DEFAULT_PLACEHOLDER_SIZE.height);
  // Для канальных постов: ширина фото = вся карточка, высота вычисляется из аспекта (как в Telegram).
  const channelImageW = maxW; // примерная ширина карточки канала
  const channelAspect = w > 0 && h > 0 ? h / w : 9 / 16;
  const channelImageH = Math.min(Math.round(channelImageW * channelAspect), maxH);
  const hasCaption = (caption ?? '').trim().length > 0;
  const hasFooter = Boolean(footer);
  const mediaBottomRounded = !hasCaption && !hasFooter;
  const showInitialLoader = incomingChannelPost
    ? !hasUri && !loadError
    : !hasUri || (!imageLoaded && !loadError && !isDataPreviewUri && !placeholderUri);
  const loaderBoxStyle = incomingChannelPost
    ? { width: '100%' as const, height: channelImageH }
    : { width: w, height: h };

  const floatReactions = shouldFloatMediaReactions({
    hasReactions: !!inlineReactions?.length,
    hasCaption,
    hasFooter,
    embedded,
    incomingChannelPost,
  });

  const bubble = (
      <View
        style={[
          styles.container,
          centered && styles.containerCentered,
          embedded ? styles.containerEmbedded : isMe ? styles.bubbleMe : styles.bubbleOther,
          incomingChannelPost && styles.containerChannelPost,
          !isMe && incomingBubbleBackground
            ? {
                backgroundColor: incomingBubbleBackground,
                borderColor: incomingBubbleBorderColor ?? colors.bubbleOtherBorder,
              }
            : null,
          isMe && bubbleMeColor ? { backgroundColor: bubbleMeColor } : null,
          { maxWidth: incomingChannelPost ? '100%' : (w + 8) },
          style,
        ]}
      >
        {header ? (
          <View style={{ maxWidth: w, alignSelf: 'flex-start' }}>{header}</View>
        ) : null}

        <>
          <Pressable
            ref={imageWrapperRef}
            accessibilityRole="button"
            accessibilityLabel="View image fullscreen"
            onPress={handlePress}
            style={[
              styles.imageWrapper,
              incomingChannelPost
                ? { width: '100%', height: channelImageH }
                : { width: w, height: h },
              isMe ? styles.imageWrapperMe : styles.imageWrapperOther,
              embedded && styles.imageWrapperEmbedded,
              incomingChannelPost &&
                (mediaBottomRounded ? styles.imageWrapperChannelSolo : styles.imageWrapperChannelStacked),
            ]}
          >
            {showInitialLoader ? (
              <View pointerEvents="none" style={[styles.loadingOverlay, loaderBoxStyle]}>
                <ActivityIndicator size="large" color={colors.iconMuted} />
              </View>
            ) : null}
            {loadError ? (
              <View pointerEvents="none" style={[styles.errorOverlay, loaderBoxStyle]}>
                <Feather name="image" size={28} color={colors.iconMuted} />
              </View>
            ) : null}
            {hasUri ? (
              <Image
                key={normalizedUri}
                source={{ uri: normalizedUri }}
                placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
                placeholderContentFit="cover"
                transition={incomingChannelPost && !placeholderUri ? undefined : 150}
                cachePolicy="memory-disk"
                onError={() => {
                  setLoadError(true);
                  setImageLoaded(true);
                }}
                onLoad={(e) => {
                  loadedImageUris.add(normalizedUri);
                  if (!propWidth || !propHeight) {
                    setDisplaySize(computeDisplaySize(e.source.width, e.source.height, maxW, maxH));
                  }
                  setLoadError(false);
                  setImageLoaded(true);
                }}
                style={[
                  incomingChannelPost ? styles.imageChannel : styles.image,
                  incomingChannelPost
                    ? { width: '100%', height: channelImageH }
                    : { width: w, height: h },
                ]}
                contentFit={incomingChannelPost ? 'cover' : contentFit}
              />
            ) : null}

            {!hasCaption && (time || viewCount != null) ? (
              <View style={styles.overlayMeta}>
                {viewCount != null ? (
                  <View style={styles.overlayMetric}>
                    <Feather name="eye" size={12} color="#FFFFFF" />
                    <Text style={styles.overlayMetricText}>
                      {viewCountShortLabel ?? String(viewCount)}
                    </Text>
                  </View>
                ) : null}
                {time ? (
                  <MessageTimeStatus
                    time={time}
                    status={status ?? 'sent'}
                    isMe={isMe}
                    compact
                    timeColor="#FFFFFF"
                    iconColor="#FFFFFF"
                    source={source}
                  />
                ) : null}
              </View>
            ) : null}
          </Pressable>

          {hasCaption ? (
            <MessageTextBubbleBody
              fillWidth
              text={caption ?? ''}
              textStyle={[
                styles.caption,
                incomingChannelPost && styles.captionChannel,
                isMe && styles.captionMe,
                isMe && outgoingTextColor ? { color: outgoingTextColor } : null,
                !isMe && incomingCaptionTextColor ? { color: incomingCaptionTextColor } : null,
              ]}
              hasViews={viewCount != null}
              meta={
                <View style={styles.textMeta}>
                  {viewCount != null ? (
                    <View style={styles.textMetric}>
                      <Feather name="eye" size={13} color={isMe ? 'rgba(255,255,255,0.7)' : colors.iconMuted} />
                      <Text style={[styles.textMetricText, isMe ? { color: 'rgba(255,255,255,0.7)' } : null]}>
                        {viewCountShortLabel ?? String(viewCount)}
                      </Text>
                    </View>
                  ) : null}
                  {time ? (
                    <MessageTimeStatus
                      time={time}
                      status={status ?? 'sent'}
                      isMe={isMe}
                      compact
                      source={source}
                    />
                  ) : null}
                </View>
              }
            />
          ) : null}
        </>

        {footer}

        {inlineReactions?.length && !floatReactions ? (
          <MessageReactionInline
            reactions={inlineReactions}
            isMe={isMe}
            allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
            onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
            accentColor={reactionAccentColor}
          />
        ) : null}
      </View>
  );

  return (
    <>
      {floatReactions ? (
        // Фото без подписи: реакции — отдельная «таблетка» под пузырём (как в Telegram), а не цветная полоса внутри него
        <View style={styles.floatingReactionsWrap}>
          {bubble}
          <View style={[styles.floatingReactions, isMe ? styles.floatingReactionsEnd : styles.floatingReactionsStart]}>
            <MessageReactionInline
              reactions={inlineReactions ?? []}
              isMe={isMe}
              allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
              onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
              variant="floatingTail"
              tailAlign={isMe ? 'end' : 'start'}
              accentColor={reactionAccentColor}
            />
          </View>
        </View>
      ) : (
        bubble
      )}

      {!onOpenFullscreen ? (
        <SingleImageViewerModal
          visible={fullscreenVisible}
          uri={normalizedUri}
          sourceRef={imageWrapperRef}
          imageSize={propWidth && propHeight ? { width: propWidth, height: propHeight } : null}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  floatingReactionsWrap: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  floatingReactions: {
    marginTop: 4,
    maxWidth: '100%',
  },
  floatingReactionsEnd: {
    alignSelf: 'flex-end',
  },
  floatingReactionsStart: {
    alignSelf: 'flex-start',
  },
  container: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  containerChannelPost: {
    alignSelf: 'stretch',
    width: '100%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 14,
    overflow: 'hidden',
  },
  containerCentered: {
    alignSelf: 'center',
  },
  containerEmbedded: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 2,
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
  },
  bubbleMe: {
    backgroundColor: colors.bubbleMe,
    ...bubbleRadius.mine,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.bubbleOtherBorder,
    ...bubbleRadius.other,
  },
  imageWrapper: {
    overflow: 'hidden',
    borderRadius: 12,
    position: 'relative',
  },
  imageWrapperMe: {
    backgroundColor: 'transparent',
  },
  imageWrapperOther: {
    backgroundColor: 'transparent',
  },
  imageWrapperEmbedded: {
    borderRadius: 0,
  },
  imageWrapperChannelSolo: {
    borderRadius: 14,
  },
  imageWrapperChannelStacked: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243, 244, 246, 0.92)',
    zIndex: 2,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.placeholderBg,
    zIndex: 1,
  },
  image: {
    maxWidth: MAX_BUBBLE_WIDTH,
    maxHeight: MAX_BUBBLE_HEIGHT,
  },
  imageChannel: {
    width: '100%',
  },
  overlayMeta: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  overlayMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  overlayMetricText: {
    color: '#FFFFFF',
    fontSize: typography.timeStatus,
    lineHeight: 14,
    fontWeight: '600',
  },
  caption: {
    marginTop: 6,
    paddingHorizontal: 4,
    paddingBottom: 2,
    fontSize: 14,
    lineHeight: 19,
    color: '#111827',
  },
  captionChannel: {
    marginTop: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    fontSize: 15,
    lineHeight: 21,
  },
  captionMe: {
    color: '#FFFFFF',
  },
  textMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 4,
    paddingBottom: 2,
  },
  textMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  textMetricText: {
    color: colors.iconMuted,
    fontSize: typography.timeStatus,
    lineHeight: 14,
    fontWeight: '600',
  },
});
