import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEvent } from 'expo';
import Feather from '@expo/vector-icons/Feather';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { useHeroDismiss } from '../../hooks/useHeroDismiss';
import { HeroOverlay } from '../HeroOverlay';
import { measureMediaThumb } from '../../utils/mediaThumbRegistry';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../../utils/videoThumbnail';
import {
  isIosPhAssetUri,
  useIosResolvableMediaLibraryUri,
} from '../../utils/resolveIosPhotoLibraryUri';
import type { GroupMediaItem } from './groupProfile.types';

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
  onOpenActionMenu,
}: {
  item: GroupMediaItem;
  viewportWidth: number;
  viewportHeight: number;
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const resolved = useIosResolvableMediaLibraryUri(item.uri);
  const ph = isIosPhAssetUri(item.uri);

  return (
    <Pressable
      onLongPress={(event) => onOpenActionMenu(item.id, event)}
      delayLongPress={220}
      android_disableSound
      style={[styles.slide, { width: viewportWidth, height: viewportHeight }]}
    >
      {ph && resolved === null ? (
        <ActivityIndicator color="#FFFFFF" size="large" />
      ) : ph && resolved === '' ? (
        <View style={styles.phErrorWrap}>
          <Feather name="image" size={48} color="rgba(255,255,255,0.45)" />
        </View>
      ) : (
        <Image
          source={{ uri: resolved ?? item.uri }}
          style={[styles.media, { width: viewportWidth, height: viewportHeight }]}
          contentFit="contain"
          cachePolicy="disk"
        />
      )}
    </Pressable>
  );
});

const VideoViewerSlideLoaded = React.memo(function VideoViewerSlideLoaded({
  item,
  isActive,
  viewportWidth,
  viewportHeight,
  onOpenActionMenu,
}: {
  item: GroupMediaItem;
  isActive: boolean;
  viewportWidth: number;
  viewportHeight: number;
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
    >
      {previewUri && (!isPlayerMounted || !hasRenderedFrame) ? (
        <Image
          source={{ uri: previewUri }}
          style={[styles.media, { width: viewportWidth, height: viewportHeight }]}
          contentFit="contain"
          cachePolicy="disk"
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

const VideoViewerSlide = React.memo(function VideoViewerSlide({
  item,
  isActive,
  viewportWidth,
  viewportHeight,
  onOpenActionMenu,
}: {
  item: GroupMediaItem;
  isActive: boolean;
  viewportWidth: number;
  viewportHeight: number;
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const resolved = useIosResolvableMediaLibraryUri(item.uri);
  const ph = isIosPhAssetUri(item.uri);

  if (ph && resolved === null) {
    return (
      <Pressable style={[styles.slide, { width: viewportWidth, height: viewportHeight }]}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </Pressable>
    );
  }

  if (ph && resolved === '') {
    return (
      <Pressable style={[styles.slide, { width: viewportWidth, height: viewportHeight }]}>
        <View style={styles.phErrorWrap}>
          <Feather name="video-off" size={48} color="rgba(255,255,255,0.45)" />
        </View>
      </Pressable>
    );
  }

  const playable = resolved ?? item.uri;
  return (
    <VideoViewerSlideLoaded
      item={{ ...item, uri: playable }}
      isActive={isActive}
      viewportWidth={viewportWidth}
      viewportHeight={viewportHeight}
      onOpenActionMenu={onOpenActionMenu}
    />
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

  const safeIndex = Math.max(0, Math.min(selectedIndex ?? 0, Math.max(mediaItems.length - 1, 0)));

  /* закрытие свайпом: фото возвращается на место миниатюры (как в Telegram) */
  const mediaItemsRef = useRef(mediaItems);
  mediaItemsRef.current = mediaItems;
  const safeIndexRef = useRef(safeIndex);
  safeIndexRef.current = safeIndex;
  const getSourceRect = useCallback(
    () => measureMediaThumb(mediaItemsRef.current[safeIndexRef.current]?.id),
    []
  );
  const getHeroImageUri = useCallback(() => {
    const current = mediaItemsRef.current[safeIndexRef.current];
    if (!current) return null;
    if (current.kind !== 'video') return current.previewUri ?? current.uri;
    return current.previewUri?.trim() || getCachedVideoThumbnailUri(current.uri) || null;
  }, []);
  const getImageSize = useCallback(() => {
    const current = mediaItemsRef.current[safeIndexRef.current];
    return current?.width && current?.height
      ? { width: current.width, height: current.height }
      : null;
  }, []);
  const hero = useHeroDismiss({
    visible,
    getSourceRect,
    getHeroImageUri,
    getImageSize,
    onDismiss: onClose,
  });

  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    });
  }, [safeIndex, visible]);

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
          onOpenActionMenu={onOpenActionMenu}
        />
      ) : (
        <ImageViewerSlide
          item={item}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          onOpenActionMenu={onOpenActionMenu}
        />
      ),
    [onOpenActionMenu, safeIndex, viewportHeight, viewportWidth]
  );

  if (mediaItems.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={hero.requestClose}
    >
      <GestureHandlerRootView style={styles.backdrop}>
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdropFill, hero.backdropStyle]}
        />
        <GestureDetector gesture={hero.gesture}>
         <Reanimated.View
          style={[
            styles.viewerRoot,
            { width: viewportWidth, height: viewportHeight },
            hero.contentStyle,
          ]}
         >
          <FlatList
            ref={listRef}
            style={{ width: viewportWidth, height: viewportHeight }}
            data={mediaItems}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            bounces={false}
            removeClippedSubviews={false}
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
         </Reanimated.View>
        </GestureDetector>

        <HeroOverlay hero={hero} />

        {/* панели тают вместе с фоном при перетаскивании */}
        <Reanimated.View
          style={[StyleSheet.absoluteFill, hero.chromeStyle]}
          pointerEvents="box-none"
        >
        <View style={[styles.topBar, { top: topInset + 10 }]} pointerEvents="box-none">
          <Text style={styles.counter}>{safeIndex + 1} / {mediaItems.length}</Text>
          <Pressable
            onPress={hero.requestClose}
            style={styles.closeButton}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropFill: {
    backgroundColor: '#000000',
  },
  viewerRoot: {
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phErrorWrap: {
    flex: 1,
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

