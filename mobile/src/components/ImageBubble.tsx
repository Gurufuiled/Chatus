import React, { useCallback, useEffect, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Dimensions,
  Image as RNImage,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
import { colors, bubbleRadius, typography } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageReactionInline, type InlineReactionItem } from './MessageReactionInline';
import { MessageTimeStatus } from './MessageTimeStatus';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.68, 300);
const MAX_BUBBLE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.48, 360);
const MIN_PORTRAIT_WIDTH = 154;
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
  inlineReactions?: InlineReactionItem[];
  allowMessageReactions?: boolean;
  onToggleInlineReaction?: (emoji: string) => void;
  reactionAccentColor?: string;
  incomingBubbleBackground?: string;
  incomingBubbleBorderColor?: string;
  incomingCaptionTextColor?: string;
}

function computeDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = MAX_BUBBLE_WIDTH,
  maxHeight: number = MAX_BUBBLE_HEIGHT
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  const baseScale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  let width = Math.round(naturalWidth * baseScale);
  let height = Math.round(naturalHeight * baseScale);

  const isPortrait = naturalHeight / naturalWidth > 1.28;
  if (isPortrait && width < MIN_PORTRAIT_WIDTH) {
    const minWidthScale = MIN_PORTRAIT_WIDTH / naturalWidth;
    const safeScale = Math.min(Math.max(baseScale, minWidthScale), maxHeight / naturalHeight, 1);
    width = Math.round(naturalWidth * safeScale);
    height = Math.round(naturalHeight * safeScale);
  }

  return { width, height };
}

function resolveKnownDisplaySize(
  width?: number,
  height?: number,
): { width: number; height: number } | null {
  if (width == null || height == null) return null;
  return computeDisplaySize(width, height);
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
  inlineReactions,
  allowMessageReactions,
  onToggleInlineReaction,
  reactionAccentColor,
  incomingBubbleBackground,
  incomingBubbleBorderColor,
  incomingCaptionTextColor,
}: ImageBubbleProps) {
  const normalizedUri = uri.trim();
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(() =>
    fixedSize && propWidth && propHeight
      ? { width: propWidth, height: propHeight }
      : resolveKnownDisplaySize(propWidth, propHeight)
  );
  const [imageLoaded, setImageLoaded] = useState(() =>
    normalizedUri.length > 0 && loadedImageUris.has(normalizedUri)
  );
  const [loadError, setLoadError] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setLoadError(false);
    setImageLoaded(normalizedUri.length > 0 && loadedImageUris.has(normalizedUri));

    if (fixedSize && propWidth && propHeight) {
      setDisplaySize({ width: propWidth, height: propHeight });
      return;
    }
    const knownDisplaySize = resolveKnownDisplaySize(propWidth, propHeight);
    if (!normalizedUri) {
      setDisplaySize(DEFAULT_PLACEHOLDER_SIZE);
      return;
    }
    if (knownDisplaySize) {
      setDisplaySize(knownDisplaySize);
      return;
    }

    let cancelled = false;
    RNImage.getSize(
      normalizedUri,
      (w, h) => {
        if (!cancelled) {
          setDisplaySize(computeDisplaySize(w, h));
        }
      },
      () => {
        if (!cancelled) {
          setDisplaySize(DEFAULT_PLACEHOLDER_SIZE);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [normalizedUri, propWidth, propHeight, fixedSize]);

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

  const w = displaySize?.width ?? DEFAULT_PLACEHOLDER_SIZE.width;
  const h = displaySize?.height ?? DEFAULT_PLACEHOLDER_SIZE.height;
  const hasCaption = (caption ?? '').trim().length > 0;

  return (
    <>
      <View
        style={[
          styles.container,
          centered && styles.containerCentered,
          embedded ? styles.containerEmbedded : isMe ? styles.bubbleMe : styles.bubbleOther,
          !isMe && incomingBubbleBackground
            ? {
                backgroundColor: incomingBubbleBackground,
                borderColor: incomingBubbleBorderColor ?? colors.bubbleOtherBorder,
              }
            : null,
          isMe && bubbleMeColor ? { backgroundColor: bubbleMeColor } : null,
        ]}
      >
        {header ? (
          <View style={{ maxWidth: w, alignSelf: 'flex-start' }}>{header}</View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View image fullscreen"
          onPress={handlePress}
          style={[
            styles.imageWrapper,
            { width: w, height: h },
            isMe ? styles.imageWrapperMe : styles.imageWrapperOther,
            embedded && styles.imageWrapperEmbedded,
          ]}
        >
          {!imageLoaded && !loadError ? (
            <View pointerEvents="none" style={[styles.loadingOverlay, { width: w, height: h }]}>
              <ActivityIndicator color={colors.iconMuted} />
            </View>
          ) : null}
          {loadError ? (
            <View pointerEvents="none" style={[styles.errorOverlay, { width: w, height: h }]}>
              <Feather name="image" size={28} color={colors.iconMuted} />
            </View>
          ) : null}
          <Image
            source={{ uri: normalizedUri }}
            transition={150}
            cachePolicy="disk"
            onError={() => {
              setLoadError(true);
              setImageLoaded(true);
            }}
            onLoad={() => {
              if (normalizedUri) {
                loadedImageUris.add(normalizedUri);
              }
              setLoadError(false);
              setImageLoaded(true);
            }}
            style={[styles.image, { width: w, height: h }]}
            contentFit={contentFit}
          />

          {time || viewCount != null ? (
            <View style={styles.overlayMeta}>
              {viewCount != null ? (
                <View style={styles.overlayMetric}>
                  <Feather name="eye" size={12} color="#FFFFFF" />
                  <Text style={styles.overlayMetricText}>{viewCount}</Text>
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
                />
              ) : null}
            </View>
          ) : null}
        </Pressable>

        {hasCaption ? (
          <Text
            style={[
              styles.caption,
              isMe && styles.captionMe,
              isMe && outgoingTextColor ? { color: outgoingTextColor } : null,
              !isMe && incomingCaptionTextColor ? { color: incomingCaptionTextColor } : null,
            ]}
          >
            {caption}
          </Text>
        ) : null}

        {inlineReactions?.length ? (
          <MessageReactionInline
            reactions={inlineReactions}
            isMe={isMe}
            allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
            onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
            accentColor={reactionAccentColor}
          />
        ) : null}
      </View>

      {!onOpenFullscreen ? (
        <Modal
          visible={fullscreenVisible}
          transparent
          animationType="fade"
          onRequestClose={handleClose}
        >
          <Pressable style={styles.fullscreenBackdrop} onPress={handleClose}>
            <View style={styles.fullscreenContent}>
              <Image
                source={{ uri: normalizedUri }}
                style={styles.fullscreenImage}
                contentFit="contain"
                cachePolicy="disk"
              />
              <Pressable
                style={[styles.closeButton, { top: insets.top + 12 }]}
                onPress={handleClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close fullscreen"
              >
                <Text style={styles.closeButtonText}>x</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    maxWidth: '100%',
    alignSelf: 'flex-start',
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243, 244, 246, 0.92)',
    zIndex: 1,
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
  captionMe: {
    color: '#FFFFFF',
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
});
