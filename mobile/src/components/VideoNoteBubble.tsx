import React from 'react';
import { useEvent, useEventListener } from 'expo';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { typography } from '../theme/colors';
import {
  formatMediaDuration,
  formatPlaybackElapsedDuration,
} from '../utils/mediaDuration';
import { MessageTimeStatus } from './MessageTimeStatus';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLLAPSED_SIZE = Math.min(SCREEN_WIDTH * 0.58, 228);
const EXPANDED_SIZE = Math.min(SCREEN_WIDTH * 0.82, 312);
const META_ROW_HEIGHT = 26;
const META_ROW_GAP = 6;
const ANIMATION_DURATION_MS = 320;
const COLLAPSE_DELAY_MS = 180;
const REPLY_SWIPE_TRIGGER = 34;
const REPLY_SWIPE_MAX = 72;
const GENERATED_THUMBNAIL_TIME_MS = 0;
const generatedThumbnailCache = new Map<string, string>();

function clampReplySwipe(value: number) {
  'worklet';
  return Math.max(-REPLY_SWIPE_MAX, Math.min(0, value));
}

type ActiveVideoNoteListener = (activeId: string | null) => void;

let activeVideoNoteId: string | null = null;
const activeVideoNoteListeners = new Set<ActiveVideoNoteListener>();

function getActiveVideoNoteId() {
  return activeVideoNoteId;
}

function setActiveVideoNoteId(nextId: string | null) {
  if (activeVideoNoteId === nextId) return;
  activeVideoNoteId = nextId;
  activeVideoNoteListeners.forEach((listener) => listener(nextId));
}

function subscribeToActiveVideoNote(listener: ActiveVideoNoteListener) {
  activeVideoNoteListeners.add(listener);
  return () => {
    activeVideoNoteListeners.delete(listener);
  };
}

export interface VideoNoteBubbleProps {
  uri: string;
  thumbnailUri?: string;
  durationMs: number;
  isMe: boolean;
  time?: string;
  status?: string;
  embedded?: boolean;
  header?: React.ReactNode;
  bubbleMeColor?: string;
  outgoingMetaColor?: string;
  outgoingAccentColor?: string;
  enableReplySwipe?: boolean;
  onReplySwipe?: () => void;
}

function arePropsEqual(prev: VideoNoteBubbleProps, next: VideoNoteBubbleProps) {
  return (
    prev.uri === next.uri &&
    prev.thumbnailUri === next.thumbnailUri &&
    prev.durationMs === next.durationMs &&
    prev.isMe === next.isMe &&
    prev.time === next.time &&
    prev.status === next.status &&
    prev.embedded === next.embedded &&
    prev.header === next.header &&
    prev.bubbleMeColor === next.bubbleMeColor &&
    prev.outgoingMetaColor === next.outgoingMetaColor &&
    prev.outgoingAccentColor === next.outgoingAccentColor &&
    prev.enableReplySwipe === next.enableReplySwipe &&
    prev.onReplySwipe === next.onReplySwipe
  );
}

export const VideoNoteBubble = React.memo(function VideoNoteBubble({
  uri,
  thumbnailUri,
  durationMs,
  isMe,
  time,
  status = 'sent',
  embedded = false,
  header,
  enableReplySwipe = false,
  onReplySwipe,
}: VideoNoteBubbleProps) {
  const noteId = React.useId();
  const normalizedUri = uri.trim();
  const normalizedThumbnailUri = thumbnailUri?.trim() ?? '';
  const [generatedThumbnailUri, setGeneratedThumbnailUri] = React.useState(() => {
    if (!normalizedUri) return '';
    return generatedThumbnailCache.get(normalizedUri) ?? '';
  });
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isPlayerMounted, setIsPlayerMounted] = React.useState(false);
  const [hasRenderedFrame, setHasRenderedFrame] = React.useState(false);
  const [showPausedPlayOverlay, setShowPausedPlayOverlay] = React.useState(false);
  const progress = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);
  const replyTranslateX = useSharedValue(0);
  const replyHasTriggered = useSharedValue(false);
  const replyTriggerPop = useSharedValue(0);
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(true);

  const player = useVideoPlayer(normalizedUri, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });
  const timeUpdate = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  const clearCollapseTimer = React.useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const finishCollapse = React.useCallback(() => {
    if (!isMountedRef.current) return;
    setIsExpanded(false);
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
    setShowPausedPlayOverlay(false);
  }, []);

  const animateProgress = React.useCallback(
    (target: number, onFinished?: () => void) => {
      progress.value = withTiming(
        target,
        {
          duration: ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished && onFinished) {
            runOnJS(onFinished)();
          }
        }
      );
    },
    [progress]
  );

  const collapseInline = React.useCallback(() => {
    clearCollapseTimer();
    if (getActiveVideoNoteId() === noteId) {
      setActiveVideoNoteId(null);
    }
    try {
      player.pause();
      player.currentTime = 0;
    } catch {
      // Ignore player teardown race conditions during unmount.
    }
    animateProgress(0, finishCollapse);
  }, [animateProgress, clearCollapseTimer, finishCollapse, noteId, player]);

  const expandInline = React.useCallback(() => {
    if (!normalizedUri) return;
    clearCollapseTimer();
    if (getActiveVideoNoteId() !== noteId) {
      setActiveVideoNoteId(noteId);
    }
    setShowPausedPlayOverlay(false);
    setHasRenderedFrame(false);
    setIsPlayerMounted(true);
    setIsExpanded(true);
    animateProgress(1);

    requestAnimationFrame(() => {
      try {
        player.replay();
      } catch {
        try {
          player.play();
        } catch {
          // Ignore if the source is still preparing.
        }
      }
    });
  }, [animateProgress, clearCollapseTimer, normalizedUri, noteId, player]);

  const handlePress = React.useCallback(() => {
    if (!normalizedUri) return;

    if (!isExpanded) {
      expandInline();
      return;
    }

    try {
      if (isPlaying) {
        setShowPausedPlayOverlay(true);
        player.pause();
      } else {
        setShowPausedPlayOverlay(false);
        badgeOpacity.value = 0;
        player.play();
      }
    } catch {
      // Best effort toggle only.
    }
  }, [badgeOpacity, expandInline, isExpanded, isPlaying, normalizedUri, player]);

  useEventListener(player, 'playToEnd', () => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      collapseInline();
      collapseTimerRef.current = null;
    }, COLLAPSE_DELAY_MS);
  });

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearCollapseTimer();
      if (getActiveVideoNoteId() === noteId) {
        setActiveVideoNoteId(null);
      }
      try {
        player.pause();
      } catch {
        // Ignore.
      }
    };
  }, [clearCollapseTimer, noteId, player]);

  React.useEffect(() => {
    return subscribeToActiveVideoNote((activeId) => {
      if (activeId != null && activeId !== noteId && (isExpanded || isPlayerMounted)) {
        collapseInline();
      }
    });
  }, [collapseInline, isExpanded, isPlayerMounted, noteId]);

  React.useEffect(() => {
    clearCollapseTimer();
    setIsExpanded(false);
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
    setShowPausedPlayOverlay(false);
    progress.value = 0;
    badgeOpacity.value = 0;
    if (getActiveVideoNoteId() === noteId) {
      setActiveVideoNoteId(null);
    }
  }, [badgeOpacity, clearCollapseTimer, noteId, normalizedThumbnailUri, normalizedUri, progress]);

  React.useEffect(() => {
    if (!normalizedUri) {
      setGeneratedThumbnailUri('');
      return;
    }

    if (normalizedThumbnailUri) {
      setGeneratedThumbnailUri('');
      return;
    }

    const cached = generatedThumbnailCache.get(normalizedUri);
    if (cached) {
      setGeneratedThumbnailUri(cached);
      return;
    }

    let cancelled = false;
    void getThumbnailAsync(normalizedUri, { time: GENERATED_THUMBNAIL_TIME_MS })
      .then((result) => {
        const nextUri = result?.uri?.trim();
        if (!nextUri || cancelled) return;
        generatedThumbnailCache.set(normalizedUri, nextUri);
        setGeneratedThumbnailUri(nextUri);
      })
      .catch(() => {
        if (!cancelled) {
          setGeneratedThumbnailUri('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedThumbnailUri, normalizedUri]);

  React.useEffect(() => {
    badgeOpacity.value = withTiming(isExpanded && showPausedPlayOverlay ? 1 : 0, {
      duration: showPausedPlayOverlay ? 140 : 80,
    });
  }, [badgeOpacity, isExpanded, showPausedPlayOverlay]);

  const slotStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [COLLAPSED_SIZE, EXPANDED_SIZE]);
    const marginVertical = interpolate(progress.value, [0, 1], [0, 12]);
    return {
      width: size,
      height: size + META_ROW_HEIGHT + META_ROW_GAP,
      marginVertical,
    };
  });

  const circleStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [COLLAPSED_SIZE, EXPANDED_SIZE]);
    const borderWidth = interpolate(progress.value, [0, 1], [2.25, 3]);
    const shadowOpacity = interpolate(progress.value, [0, 1], [0.18, 0.28]);
    const shadowRadius = interpolate(progress.value, [0, 1], [8, 18]);
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth,
      shadowOpacity,
      shadowRadius,
      elevation: interpolate(progress.value, [0, 1], [4, 8]),
    };
  });

  const centerBadgeStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [0.88, 1]),
      },
    ],
  }));

  const footerMetaStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [COLLAPSED_SIZE, EXPANDED_SIZE]);
    const horizontalInset = interpolate(progress.value, [0, 1], [6, 10]);
    const marginTop = interpolate(progress.value, [0, 1], [4, 8]);
    return {
      width: size,
      marginTop,
      paddingHorizontal: horizontalInset,
    };
  });

  const replyGesture = React.useMemo(() => Gesture.Pan()
    .enabled(enableReplySwipe && typeof onReplySwipe === 'function')
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      replyHasTriggered.value = false;
    })
    .onUpdate((event) => {
      if (event.translationX > 0) {
        replyTranslateX.value = 0;
        return;
      }

      const nextX = clampReplySwipe(event.translationX);
      replyTranslateX.value = nextX;

      if (!replyHasTriggered.value && nextX <= -REPLY_SWIPE_TRIGGER && onReplySwipe) {
        replyHasTriggered.value = true;
        replyTriggerPop.value = withSequence(
          withTiming(1, { duration: 70 }),
          withTiming(0, { duration: 120 })
        );
        runOnJS(onReplySwipe)();
      }
    })
    .onFinalize(() => {
      replyTranslateX.value = withTiming(0, { duration: 140 });
      replyHasTriggered.value = false;
    }), [enableReplySwipe, onReplySwipe, replyHasTriggered, replyTranslateX, replyTriggerPop]);

  const replyContentStyle = useAnimatedStyle(() => {
    const scale = interpolate(replyTriggerPop.value, [0, 1], [1, 0.985]);
    return {
      transform: [{ translateX: replyTranslateX.value }, { scale }] as const,
    };
  });

  const replyIconStyle = useAnimatedStyle(() => {
    const progressValue = Math.abs(replyTranslateX.value) / REPLY_SWIPE_TRIGGER;
    const opacity = interpolate(progressValue, [0, 0.3, 1], [0, 0.45, 1]);
    const baseScale = interpolate(progressValue, [0, 1], [0.84, 1]);
    const scaleBoost = interpolate(replyTriggerPop.value, [0, 1], [0, 0.18]);

    return {
      opacity,
      transform: [{ scale: baseScale + scaleBoost }],
    };
  });

  const posterUri = normalizedThumbnailUri || generatedThumbnailUri;
  const showPoster = posterUri.length > 0 && (!isPlayerMounted || !hasRenderedFrame);
  const elapsedMs = Math.min(
    Math.max(Math.round((timeUpdate.currentTime ?? 0) * 1000), 0),
    durationMs
  );
  const durationLabel = isExpanded
    ? formatPlaybackElapsedDuration(elapsedMs, durationMs)
    : formatMediaDuration(durationMs);

  const pressableContent = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isExpanded ? 'Toggle video note playback' : 'Open video note'}
      onPress={handlePress}
      style={styles.pressable}
    >
      <Reanimated.View style={[styles.circle, circleStyle]}>
        {showPoster ? (
          <Image source={{ uri: posterUri }} style={styles.poster} resizeMode="cover" />
        ) : null}

        {isPlayerMounted ? (
          <VideoView
            player={player}
            style={styles.video}
            nativeControls={false}
            contentFit="cover"
            surfaceType="textureView"
            useExoShutter={false}
            onFirstFrameRender={() => setHasRenderedFrame(true)}
          />
        ) : null}

        <Reanimated.View pointerEvents="none" style={[styles.centerBadge, centerBadgeStyle]}>
          <View style={styles.centerPlayGlyph} />
        </Reanimated.View>
      </Reanimated.View>

      <Reanimated.View pointerEvents="none" style={[styles.footerMeta, footerMetaStyle]}>
        <View style={styles.metaPill}>
          <Text style={styles.durationText}>{durationLabel}</Text>
        </View>

        {time ? (
          <View style={styles.timeStatusWrap}>
            <View style={styles.metaPill}>
              <MessageTimeStatus
                time={time}
                status={status}
                isMe={isMe}
                compact
                timeColor="#FFFFFF"
                iconColor="#FFFFFF"
              />
            </View>
          </View>
        ) : null}
      </Reanimated.View>
    </Pressable>
  );

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {header}

      <Reanimated.View
        style={[
          styles.slot,
          slotStyle,
          isMe ? styles.slotMe : styles.slotOther,
        ]}
      >
        {enableReplySwipe && onReplySwipe ? (
          <GestureDetector gesture={replyGesture}>
            <View style={styles.replyGestureContainer}>
              <Reanimated.View style={[styles.replySwipeAction, replyIconStyle]}>
                <View style={styles.replySwipeIconWrap}>
                  <Feather name="corner-left-up" size={18} color="#4D8DFF" />
                </View>
              </Reanimated.View>
              <Reanimated.View style={[styles.replyGestureContent, replyContentStyle]}>
                {pressableContent}
              </Reanimated.View>
            </View>
          </GestureDetector>
        ) : (
          pressableContent
        )}
      </Reanimated.View>
    </View>
  );
}, arePropsEqual);

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 2,
  },
  containerEmbedded: {
    paddingVertical: 0,
  },
  slot: {
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '100%',
  },
  slotMe: {
    alignSelf: 'flex-end',
  },
  slotOther: {
    alignSelf: 'flex-start',
  },
  replyGestureContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  replyGestureContent: {
    width: '100%',
    height: '100%',
  },
  replySwipeAction: {
    position: 'absolute',
    right: 8,
    alignSelf: 'center',
    zIndex: 1,
  },
  replySwipeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  circle: {
    overflow: 'hidden',
    backgroundColor: '#0B1020',
    borderColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  posterFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B1020',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  centerBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayGlyph: {
    width: 0,
    height: 0,
    marginLeft: 8,
    borderTopWidth: 16,
    borderBottomWidth: 16,
    borderLeftWidth: 24,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(255,255,255,0.96)',
  },
  footerMeta: {
    height: META_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  timeStatusWrap: {
    alignItems: 'flex-end',
  },
  durationText: {
    fontSize: typography.timeStatus,
    lineHeight: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
});
