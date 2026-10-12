import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEvent } from 'expo';
import Feather from '@expo/vector-icons/Feather';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BlurView } from 'expo-blur';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { MediaTile } from './ChatProfileMediaSection';
import { useHeroDismiss } from '../hooks/useHeroDismiss';
import { HeroOverlay } from './HeroOverlay';
import { measureMediaThumb } from '../utils/mediaThumbRegistry';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../utils/videoThumbnail';
import {
  isIosPhAssetUri,
  useIosResolvableMediaLibraryUri,
} from '../utils/resolveIosPhotoLibraryUri';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Сдвиг панели подписи при открытии (без затемнения фото сверху) */
const CAPTION_PANEL_SLIDE = Math.min(SCREEN_HEIGHT * 0.55, 520);

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
  onTap,
}: {
  item: MediaTile;
  onTap?: () => void;
}) {
  const resolved = useIosResolvableMediaLibraryUri(item.uri);
  const ph = isIosPhAssetUri(item.uri);
  const targetUri = resolved ?? item.uri;
  const isBase64Thumbnail = typeof targetUri === 'string' && targetUri.startsWith('data:image');

  return (
    <Pressable
      onPress={onTap}
      style={styles.slide}
      android_disableSound
    >
      {ph && resolved === null ? (
        <ActivityIndicator color="#FFFFFF" size="large" />
      ) : ph && resolved === '' ? (
        <View style={styles.phErrorWrap}>
          <Feather name="image" size={48} color="rgba(255,255,255,0.45)" />
        </View>
      ) : (
        <View style={styles.mediaContainer}>
          <Image
            key={targetUri}
            source={{ uri: targetUri }}
            style={styles.media}
            contentFit="contain"
            transition={250}
            cachePolicy="memory-disk"
          />
          {isBase64Thumbnail ? (
            <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator color="#FFFFFF" size="large" />
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
});

const VideoViewerSlideLoaded = React.memo(function VideoViewerSlideLoaded({
  item,
  isActive,
}: {
  item: MediaTile;
  isActive: boolean;
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

  const isDownloaded = typeof item.uri === 'string' && item.uri.startsWith('file://');

  useEffect(() => {
    if (isActive) return;

    try {
      player.pause();
    } catch {
      // Ignore if player is already tearing down.
    }
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
  }, [isActive, player]);

  useEffect(() => {
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
  }, [item.uri]);

  const handlePress = useCallback(() => {
    if (!isDownloaded) return; // Can't play yet if not downloaded
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
  }, [isPlayerMounted, isPlaying, player, isDownloaded]);

  return (
    <Pressable onPress={handlePress} style={styles.slide}>
      {previewUri && (!isPlayerMounted || !hasRenderedFrame) ? (
        <Image
          key={previewUri}
          source={{ uri: previewUri }}
          style={styles.media}
          contentFit="contain"
          transition={250}
          cachePolicy="memory-disk"
        />
      ) : null}
      {isPlayerMounted ? (
        <VideoView
          player={player}
          style={styles.media}
          nativeControls={false}
          contentFit="contain"
          surfaceType="textureView"
          useExoShutter={false}
          onFirstFrameRender={() => setHasRenderedFrame(true)}
        />
      ) : null}
      {!isDownloaded ? (
        <View style={styles.videoBadge}>
          <ActivityIndicator color="#FFFFFF" size="small" />
        </View>
      ) : !isPlaying ? (
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
}: {
  item: MediaTile;
  isActive: boolean;
}) {
  const resolved = useIosResolvableMediaLibraryUri(item.uri);
  const ph = isIosPhAssetUri(item.uri);

  if (ph && resolved === null) {
    return (
      <Pressable style={styles.slide}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </Pressable>
    );
  }

  if (ph && resolved === '') {
    return (
      <Pressable style={styles.slide}>
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
    />
  );
});

type ChatProfileMediaViewerModalProps = {
  visible: boolean;
  items: MediaTile[];
  selectedIndex: number;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
};

export const ChatProfileMediaViewerModal = React.memo(function ChatProfileMediaViewerModal({
  visible,
  items,
  selectedIndex,
  onChangeIndex,
  onClose,
}: ChatProfileMediaViewerModalProps) {
  const listRef = useRef<FlatList<MediaTile> | null>(null);
  const [captionOpen, setCaptionOpen] = useState(false);
  const captionAnim = useRef(new Animated.Value(0)).current;

  const safeIndex = Math.max(0, Math.min(selectedIndex, Math.max(items.length - 1, 0)));
  const currentCaption = items[safeIndex]?.caption?.trim() ?? '';
  const hasCaption = currentCaption.length > 0;

  useEffect(() => {
    Animated.timing(captionAnim, {
      toValue: captionOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [captionAnim, captionOpen]);

  useEffect(() => {
    setCaptionOpen(false);
  }, [safeIndex]);

  useEffect(() => {
    if (!visible) setCaptionOpen(false);
  }, [visible]);

  const toggleCaption = useCallback(() => {
    if (!hasCaption) return;
    setCaptionOpen((prev) => !prev);
  }, [hasCaption]);

  /* закрытие свайпом: фото возвращается на место миниатюры (как в Telegram) */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const safeIndexRef = useRef(safeIndex);
  safeIndexRef.current = safeIndex;
  const getSourceRect = useCallback(
    () => measureMediaThumb(itemsRef.current[safeIndexRef.current]?.id),
    []
  );
  const getHeroImageUri = useCallback(() => {
    const current = itemsRef.current[safeIndexRef.current];
    if (!current) return null;
    // для видео в рамке — кадр-превью, для фото — само фото
    if (current.kind !== 'video') return current.uri;
    return current.previewUri?.trim() || getCachedVideoThumbnailUri(current.uri) || null;
  }, []);
  const hero = useHeroDismiss({
    visible,
    enabled: !captionOpen,
    getSourceRect,
    getHeroImageUri,
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
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (nextIndex !== selectedIndex && nextIndex >= 0 && nextIndex < items.length) {
        onChangeIndex(nextIndex);
      }
    },
    [items.length, onChangeIndex, selectedIndex]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MediaTile; index: number }) =>
      item.kind === 'video' ? (
        <VideoViewerSlide
          item={item}
          isActive={index === safeIndex}
        />
      ) : (
        <ImageViewerSlide
          item={item}
          onTap={toggleCaption}
        />
      ),
    [safeIndex, toggleCaption]
  );

  if (items.length === 0) return null;

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
         <Reanimated.View style={[styles.viewerRoot, hero.contentStyle]}>
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            bounces={false}
            removeClippedSubviews={false}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={safeIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                listRef.current?.scrollToOffset({
                  offset: SCREEN_WIDTH * index,
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

        <View style={styles.topBar} pointerEvents="box-none">
          <Text style={styles.counter}>{safeIndex + 1} / {items.length}</Text>
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

        {hasCaption && !captionOpen ? (
          <Pressable
            onPress={toggleCaption}
            style={[styles.captionHint, styles.overlayChrome]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="align-left" size={15} color="#FFFFFF" />
            <Text style={styles.captionHintText}>Показать текст</Text>
          </Pressable>
        ) : null}

        {hasCaption ? (
          <View
            style={[styles.captionLayer, captionOpen ? styles.overlayChrome : null]}
            pointerEvents={captionOpen ? 'box-none' : 'none'}
          >
            <Pressable
              style={styles.captionDismissHit}
              onPress={() => setCaptionOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Скрыть текст поста"
            />
            <Animated.View
              style={[
                styles.captionPanelWrap,
                {
                  opacity: captionAnim,
                  transform: [
                    {
                      translateY: captionAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [CAPTION_PANEL_SLIDE, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <BlurView
                intensity={Platform.OS === 'ios' ? 55 : 70}
                tint="dark"
                blurMethod="dimezisBlurView"
                style={styles.captionBlur}
              >
                <View style={styles.captionBlurTint} />
                <View style={styles.captionPanelInner}>
                  <View style={styles.captionHandle} />
                  <ScrollView
                    style={styles.captionScroll}
                    contentContainerStyle={styles.captionScrollContent}
                    showsVerticalScrollIndicator
                    bounces
                  >
                    <Text style={styles.captionText}>{currentCaption}</Text>
                  </ScrollView>
                  <Pressable style={styles.captionClose} onPress={() => setCaptionOpen(false)}>
                    <Feather name="chevron-down" size={20} color="rgba(255,255,255,0.92)" />
                    <Text style={styles.captionCloseText}>Скрыть</Text>
                  </Pressable>
                </View>
              </BlurView>
            </Animated.View>
          </View>
        ) : null}
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropFill: {
    backgroundColor: '#000000',
  },
  viewerRoot: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  mediaContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
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
  topBar: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayChrome: {
    zIndex: 50,
    elevation: 50,
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
  captionHint: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  captionHintText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  captionLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  captionDismissHit: {
    ...StyleSheet.absoluteFillObject,
  },
  captionPanelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** Размытие фото под текстом (как в Telegram), без плотной чёрной плашки */
  captionBlur: {
    maxHeight: SCREEN_HEIGHT * 0.62,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  captionBlurTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  captionPanelInner: {
    paddingTop: 10,
    paddingBottom: 26,
    paddingHorizontal: 18,
  },
  captionHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.38)',
    marginBottom: 10,
  },
  captionScroll: {
    maxHeight: SCREEN_HEIGHT * 0.45,
  },
  captionScrollContent: {
    paddingBottom: 12,
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  captionClose: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  captionCloseText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
  },
});
