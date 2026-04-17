import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEvent } from 'expo';
import Feather from '@expo/vector-icons/Feather';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../../utils/videoThumbnail';
import type { GroupMediaItem } from './groupProfile.types';

const CLOSE_SWIPE_DISTANCE = 84;

function useViewerVideoPreviewUri(videoUri: string, preferredUri?: string) {
  const normalizedVideoUri = videoUri.trim();
  const normalizedPreferredUri = preferredUri?.trim() ?? '';
  const [generatedUri, setGeneratedUri] = useState(() =>
    normalizedPreferredUri ? '' : getCachedVideoThumbnailUri(normalizedVideoUri) ?? ''
  );

  useEffect(() => {
    let isMounted = true;

    if (normalizedPreferredUri || !normalizedVideoUri) {
      setGeneratedUri('');
      return () => {
        isMounted = false;
      };
    }

    const cached = getCachedVideoThumbnailUri(normalizedVideoUri);
    if (cached) {
      setGeneratedUri(cached);
      return () => {
        isMounted = false;
      };
    }

    void ensureVideoThumbnailUri(normalizedVideoUri)
      .then((nextUri) => {
        if (isMounted) setGeneratedUri(nextUri);
      })
      .catch(() => {
        if (isMounted) setGeneratedUri('');
      });

    return () => {
      isMounted = false;
    };
  }, [normalizedPreferredUri, normalizedVideoUri]);

  return normalizedPreferredUri || generatedUri;
}

const ImageViewerSlide = React.memo(function ImageViewerSlide({
  item,
  viewportWidth,
  viewportHeight,
  panHandlers,
  onOpenActionMenu,
}: {
  item: GroupMediaItem;
  viewportWidth: number;
  viewportHeight: number;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      onLongPress={(event) => onOpenActionMenu(item.id, event)}
      delayLongPress={220}
      android_disableSound
      style={[styles.slide, { width: viewportWidth, height: viewportHeight }]}
      {...panHandlers}
    >
      <Image
        source={{ uri: item.uri }}
        style={[styles.media, { width: viewportWidth, height: viewportHeight }]}
        resizeMode="contain"
      />
    </Pressable>
  );
});

const VideoViewerSlide = React.memo(function VideoViewerSlide({
  item,
  isActive,
  viewportWidth,
  viewportHeight,
  panHandlers,
  onOpenActionMenu,
}: {
  item: GroupMediaItem;
  isActive: boolean;
  viewportWidth: number;
  viewportHeight: number;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const [isPlayerMounted, setIsPlayerMounted] = useState(false);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const previewUri = useViewerVideoPreviewUri(item.uri, item.previewUri);
  const player = useVideoPlayer(item.uri, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  useEffect(() => {
    if (isActive) return;

    try {
      player.pause();
    } catch {
      // Ignore if player is tearing down.
    }
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
  }, [isActive, player]);

  useEffect(() => {
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
  }, [item.uri]);

  const handlePress = useCallback(() => {
    try {
      if (!isPlayerMounted) {
        setIsPlayerMounted(true);
        requestAnimationFrame(() => {
          try {
            player.play();
          } catch {
            // Ignore if the player is still preparing.
          }
        });
        return;
      }

      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      // Best effort only.
    }
  }, [isPlayerMounted, isPlaying, player]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={(event) => onOpenActionMenu(item.id, event)}
      delayLongPress={220}
      android_disableSound
      style={[styles.slide, { width: viewportWidth, height: viewportHeight }]}
      {...panHandlers}
    >
      {previewUri && (!isPlayerMounted || !hasRenderedFrame) ? (
        <Image
          source={{ uri: previewUri }}
          style={[styles.media, { width: viewportWidth, height: viewportHeight }]}
          resizeMode="contain"
        />
      ) : null}
      {isPlayerMounted ? (
        <VideoView
          player={player}
          style={[styles.media, { width: viewportWidth, height: viewportHeight }]}
          nativeControls={false}
          contentFit="contain"
          surfaceType="textureView"
          useExoShutter={false}
          onFirstFrameRender={() => setHasRenderedFrame(true)}
        />
      ) : null}
      {!isPlaying ? (
        <View style={styles.videoBadge}>
          <Feather name="play" size={20} color="#FFFFFF" style={styles.playIcon} />
        </View>
      ) : null}
    </Pressable>
  );
});

type GroupProfileMediaViewerModalProps = {
  visible: boolean;
  mediaItems: GroupMediaItem[];
  selectedIndex: number | null;
  topInset: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
};

export function GroupProfileMediaViewerModal({
  visible,
  mediaItems,
  selectedIndex,
  topInset,
  onClose,
  onChangeIndex,
  onOpenActionMenu,
}: GroupProfileMediaViewerModalProps) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<GroupMediaItem> | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useMemo(
    () =>
      translateY.interpolate({
        inputRange: [-180, 0, 180],
        outputRange: [0.36, 1, 0.36],
        extrapolate: 'clamp',
      }),
    [translateY]
  );

  const safeIndex = Math.max(0, Math.min(selectedIndex ?? 0, Math.max(mediaItems.length - 1, 0)));

  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const closeFromSwipe = useCallback((direction: number) => {
    Animated.timing(translateY, {
      toValue: direction >= 0 ? viewportHeight : -viewportHeight,
      duration: 140,
      useNativeDriver: true,
    }).start(onClose);
  }, [onClose, translateY, viewportHeight]);

  const panResponder = useMemo(
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
          if (Math.abs(gesture.dy) > CLOSE_SWIPE_DISTANCE || Math.abs(gesture.vy) > 0.92) {
            closeFromSwipe(gesture.dy || gesture.vy);
            return;
          }

          resetPosition();
        },
        onPanResponderTerminate: resetPosition,
        onPanResponderTerminationRequest: () => false,
      }),
    [closeFromSwipe, resetPosition, translateY]
  );

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(0);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    });
  }, [safeIndex, translateY, visible]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(viewportWidth, 1));
      if (nextIndex !== selectedIndex && nextIndex >= 0 && nextIndex < mediaItems.length) {
        onChangeIndex(nextIndex);
      }
    },
    [mediaItems.length, onChangeIndex, selectedIndex, viewportWidth]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: GroupMediaItem; index: number }) =>
      item.kind === 'video' ? (
        <VideoViewerSlide
          item={item}
          isActive={index === safeIndex}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          panHandlers={panResponder.panHandlers}
          onOpenActionMenu={onOpenActionMenu}
        />
      ) : (
        <ImageViewerSlide
          item={item}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          panHandlers={panResponder.panHandlers}
          onOpenActionMenu={onOpenActionMenu}
        />
      ),
    [onOpenActionMenu, panResponder.panHandlers, safeIndex, viewportHeight, viewportWidth]
  );

  if (mediaItems.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Animated.View
          style={[
            styles.viewerRoot,
            {
              width: viewportWidth,
              height: viewportHeight,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <FlatList
            ref={listRef}
            style={{ width: viewportWidth, height: viewportHeight }}
            data={mediaItems}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={safeIndex}
            getItemLayout={(_, index) => ({
              length: viewportWidth,
              offset: viewportWidth * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                listRef.current?.scrollToOffset({
                  offset: viewportWidth * index,
                  animated: false,
                });
              });
            }}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            renderItem={renderItem}
          />
        </Animated.View>

        <View style={[styles.topBar, { top: topInset + 10 }]} pointerEvents="box-none">
          <Text style={styles.counter}>{safeIndex + 1} / {mediaItems.length}</Text>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={12}>
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerRoot: {
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.28)',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  closeButton: {
    position: 'absolute',
    right: 18,
    top: -6,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    alignSelf: 'center',
  },
  videoBadge: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  playIcon: {
    marginLeft: 3,
  },
});

