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

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 320);
const MAX_BUBBLE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.5, 380);
const MIN_PORTRAIT_WIDTH = 154;

const STATUS_ICONS: Record<string, string> = {
  sending: '\u23F1',
  sent: '\u2713',
  delivered: '\u2713\u2713',
  read: '\u2713\u2713',
  failed: '\u26A0',
};

export interface ImageBubbleProps {
  uri: string;
  isMe: boolean;
  width?: number;
  height?: number;
  caption?: string;
  time?: string;
  status?: string;
  embedded?: boolean;
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

export function ImageBubble({
  uri,
  isMe,
  width: propWidth,
  height: propHeight,
  caption,
  time,
  status,
  embedded = false,
}: ImageBubbleProps) {
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!uri?.trim()) {
      setDisplaySize({ width: MAX_BUBBLE_WIDTH, height: MAX_BUBBLE_HEIGHT });
      return;
    }
    if (propWidth != null && propHeight != null) {
      setDisplaySize(computeDisplaySize(propWidth, propHeight));
      return;
    }
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled) {
          setDisplaySize(computeDisplaySize(w, h));
        }
      },
      () => {
        if (!cancelled) {
          setDisplaySize({ width: MAX_BUBBLE_WIDTH, height: MAX_BUBBLE_HEIGHT });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uri, propWidth, propHeight]);

  const handlePress = useCallback(() => {
    setFullscreenVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setFullscreenVisible(false);
  }, []);

  const w = displaySize?.width ?? MAX_BUBBLE_WIDTH;
  const h = displaySize?.height ?? MAX_BUBBLE_HEIGHT;
  const hasCaption = (caption ?? '').trim().length > 0;
  const statusIcon = isMe ? STATUS_ICONS[status ?? ''] ?? STATUS_ICONS.sending : null;

  return (
    <>
      <View
        style={[
          styles.container,
          embedded ? styles.containerEmbedded : isMe ? styles.bubbleMe : styles.bubbleOther,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View image fullscreen"
          onPress={handlePress}
          style={styles.imageWrapper}
        >
          <Image
            source={{ uri }}
            style={[styles.image, { width: w, height: h }]}
            resizeMode="cover"
          />

          {(time || statusIcon) ? (
            <View style={styles.overlayMeta}>
              {time ? <Text style={styles.overlayTime}>{time}</Text> : null}
              {statusIcon ? <Text style={styles.overlayStatus}>{statusIcon}</Text> : null}
            </View>
          ) : null}
        </Pressable>

        {hasCaption ? (
          <Text style={[styles.caption, isMe && styles.captionMe]}>{caption}</Text>
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
    ...bubbleRadius.other,
  },
  imageWrapper: {
    overflow: 'hidden',
    borderRadius: 14,
    position: 'relative',
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
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  overlayTime: {
    fontSize: typography.timeStatus,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  overlayStatus: {
    fontSize: typography.timeStatus,
    color: '#FFFFFF',
    fontWeight: '700',
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
