import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, bubbleRadius, typography } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageTimeStatus } from './MessageTimeStatus';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 320);
const MAX_BUBBLE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.5, 380);
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
}: ImageBubbleProps) {
  const normalizedUri = uri.trim();
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(() =>
    resolveKnownDisplaySize(propWidth, propHeight)
  );
  const [imageLoaded, setImageLoaded] = useState(() =>
    normalizedUri.length > 0 && loadedImageUris.has(normalizedUri)
  );
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setImageLoaded(normalizedUri.length > 0 && loadedImageUris.has(normalizedUri));

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
    Image.getSize(
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
  }, [normalizedUri, propWidth, propHeight]);

  const handlePress = useCallback(() => {
    setFullscreenVisible(true);
  }, []);

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
          embedded ? styles.containerEmbedded : isMe ? styles.bubbleMe : styles.bubbleOther,
          isMe && bubbleMeColor ? { backgroundColor: bubbleMeColor } : null,
        ]}
      >
        {header}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View image fullscreen"
          onPress={handlePress}
          style={[
            styles.imageWrapper,
            { width: w, height: h },
            isMe ? styles.imageWrapperMe : styles.imageWrapperOther,
          ]}
        >
          {!imageLoaded ? (
            <View
              pointerEvents="none"
              style={[
                styles.imagePlaceholder,
                { width: w, height: h },
              ]}
            />
          ) : null}
          <Image
            source={{ uri: normalizedUri }}
            fadeDuration={0}
            onError={() => setImageLoaded(true)}
            onLoad={() => {
              if (normalizedUri) {
                loadedImageUris.add(normalizedUri);
              }
              setImageLoaded(true);
            }}
            style={[
              styles.image,
              { width: w, height: h },
              !imageLoaded && styles.imageHidden,
            ]}
            resizeMode="cover"
          />

          {time ? (
            <View style={styles.overlayMeta}>
              <MessageTimeStatus
                time={time}
                status={status ?? 'sent'}
                isMe={isMe}
                compact
                timeColor="#FFFFFF"
                iconColor="#FFFFFF"
              />
            </View>
          ) : null}
        </Pressable>

        {hasCaption ? (
          <Text
            style={[
              styles.caption,
              isMe && styles.captionMe,
              isMe && outgoingTextColor ? { color: outgoingTextColor } : null,
            ]}
          >
            {caption}
          </Text>
        ) : null}
      </View>

      <Modal
        visible={fullscreenVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.fullscreenBackdrop} onPress={handleClose}>
          <View style={styles.fullscreenContent}>
            <Image
              source={{ uri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    maxWidth: '100%',
    alignSelf: 'flex-start',
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
    borderRadius: 14,
    position: 'relative',
  },
  imageWrapperMe: {
    backgroundColor: 'transparent',
  },
  imageWrapperOther: {
    backgroundColor: 'transparent',
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.placeholderBg,
  },
  image: {
    maxWidth: MAX_BUBBLE_WIDTH,
    maxHeight: MAX_BUBBLE_HEIGHT,
  },
  imageHidden: {
    opacity: 0,
  },
  overlayMeta: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
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
