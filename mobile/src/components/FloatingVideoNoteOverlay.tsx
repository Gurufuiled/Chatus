import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEvent } from 'expo';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VoiceItem } from './ChatProfileMediaSection';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../utils/videoThumbnail';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const BUBBLE_SIZE = Math.min(SCREEN_WIDTH * 0.34, 136);
const SCREEN_PADDING = 14;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function useFloatingVideoPreviewUri(videoUri: string, preferredUri?: string) {
  const normalizedPreferredUri = preferredUri?.trim() ?? '';
  const [generatedUri, setGeneratedUri] = useState(() =>
    normalizedPreferredUri ? '' : getCachedVideoThumbnailUri(videoUri) ?? ''
  );

  useEffect(() => {
    let isMounted = true;

    if (normalizedPreferredUri || !videoUri) {
      setGeneratedUri('');
      return () => {
        isMounted = false;
      };
    }

    const cached = getCachedVideoThumbnailUri(videoUri);
    if (cached) {
      setGeneratedUri(cached);
      return () => {
        isMounted = false;
      };
    }

    void ensureVideoThumbnailUri(videoUri)
      .then((nextUri) => {
        if (isMounted) setGeneratedUri(nextUri);
      })
      .catch(() => {
        if (isMounted) setGeneratedUri('');
      });

    return () => {
      isMounted = false;
    };
  }, [normalizedPreferredUri, videoUri]);

  return normalizedPreferredUri || generatedUri;
}

type FloatingVideoNoteOverlayProps = {
  item: VoiceItem | null;
  onClose: () => void;
};

export const FloatingVideoNoteOverlay = React.memo(function FloatingVideoNoteOverlay({
  item,
  onClose,
}: FloatingVideoNoteOverlayProps) {
  const insets = useSafeAreaInsets();
  const uri = item?.uri?.trim() ?? '';
  const posterUri = useFloatingVideoPreviewUri(uri, item?.thumbnailUri);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const initialPosition = useMemo(
    () => ({
      x: SCREEN_WIDTH - BUBBLE_SIZE - SCREEN_PADDING,
      y: Math.max(insets.top + 86, SCREEN_PADDING),
    }),
    [insets.top]
  );
  const position = useRef(new Animated.ValueXY(initialPosition)).current;
  const lastPositionRef = useRef(initialPosition);
  const suppressTapUntilRef = useRef(0);

  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  const visible = Boolean(item && uri);

  const closeAndStop = useCallback(() => {
    try {
      player.pause();
      player.currentTime = 0;
    } catch {
      // Ignore player teardown races.
    }
    onClose();
  }, [onClose, player]);

  const springTo = useCallback(
    (nextPosition: { x: number; y: number }) => {
      lastPositionRef.current = nextPosition;
      Animated.spring(position, {
        toValue: nextPosition,
        damping: 18,
        stiffness: 230,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    },
    [position]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          position.stopAnimation((value) => {
            lastPositionRef.current = value;
            position.setOffset(value);
            position.setValue({ x: 0, y: 0 });
          });
        },
        onPanResponderMove: (_, gesture) => {
          if (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6) {
            suppressTapUntilRef.current = Date.now() + 180;
          }
          position.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_, gesture) => {
          const finalX = lastPositionRef.current.x + gesture.dx;
          const finalY = lastPositionRef.current.y + gesture.dy;
          position.flattenOffset();

          if (finalX + BUBBLE_SIZE < 0 || finalX > SCREEN_WIDTH) {
            closeAndStop();
            return;
          }

          springTo({
            x: clamp(finalX, SCREEN_PADDING, SCREEN_WIDTH - BUBBLE_SIZE - SCREEN_PADDING),
            y: clamp(
              finalY,
              Math.max(insets.top + SCREEN_PADDING, SCREEN_PADDING),
              SCREEN_HEIGHT - BUBBLE_SIZE - Math.max(insets.bottom + SCREEN_PADDING, SCREEN_PADDING)
            ),
          });
        },
        onPanResponderTerminate: () => {
          position.flattenOffset();
          springTo(lastPositionRef.current);
        },
      }),
    [closeAndStop, insets.bottom, insets.top, position, springTo]
  );

  useEffect(() => {
    if (!visible) {
      try {
        player.pause();
      } catch {
        // Best effort cleanup.
      }
      return;
    }

    setHasRenderedFrame(false);
    position.setValue(initialPosition);
    lastPositionRef.current = initialPosition;
    requestAnimationFrame(() => {
      try {
        player.replay();
      } catch {
        try {
          player.play();
        } catch {
          // Ignore if the player is still preparing.
        }
      }
    });
  }, [initialPosition, player, position, uri, visible]);

  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {
        // Ignore cleanup races.
      }
    },
    [player]
  );

  const handlePress = useCallback(() => {
    if (Date.now() < suppressTapUntilRef.current) return;

    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      // Best effort toggle only.
    }
  }, [isPlaying, player]);

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.bubble,
          {
            transform: position.getTranslateTransform(),
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable onPress={handlePress} style={styles.pressable}>
          {posterUri && !hasRenderedFrame ? (
            <Image source={{ uri: posterUri }} style={styles.poster} resizeMode="cover" />
          ) : null}
          <VideoView
            player={player}
            style={styles.video}
            nativeControls={false}
            contentFit="cover"
            surfaceType="textureView"
            useExoShutter={false}
            onFirstFrameRender={() => setHasRenderedFrame(true)}
          />
          {!isPlaying ? <View style={styles.pausedScrim} /> : null}
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  pressable: {
    flex: 1,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  pausedScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
});
