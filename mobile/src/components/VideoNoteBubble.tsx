import React from 'react';
import { useEvent, useEventListener } from 'expo';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { typography } from '../theme/colors';
import { MessageTimeStatus } from './MessageTimeStatus';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLLAPSED_SIZE = Math.min(SCREEN_WIDTH * 0.58, 228);
const EXPANDED_SIZE = Math.min(SCREEN_WIDTH * 0.82, 312);
const ANIMATION_DURATION_MS = 320;
const COLLAPSE_DELAY_MS = 180;

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
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
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
    prev.outgoingAccentColor === next.outgoingAccentColor
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
}: VideoNoteBubbleProps) {
  const normalizedUri = uri.trim();
  const normalizedThumbnailUri = thumbnailUri?.trim() ?? '';
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isPlayerMounted, setIsPlayerMounted] = React.useState(false);
  const [hasRenderedFrame, setHasRenderedFrame] = React.useState(false);
  const progress = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(true);

  const player = useVideoPlayer(normalizedUri, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
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
    try {
      player.pause();
      player.currentTime = 0;
    } catch {
      // Ignore player teardown race conditions during unmount.
    }
    animateProgress(0, finishCollapse);
  }, [animateProgress, clearCollapseTimer, finishCollapse, player]);

  const expandInline = React.useCallback(() => {
    if (!normalizedUri) return;
    clearCollapseTimer();
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
  }, [animateProgress, clearCollapseTimer, normalizedUri, player]);

  const handlePress = React.useCallback(() => {
    if (!normalizedUri) return;

    if (!isExpanded) {
      expandInline();
      return;
    }

    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      // Best effort toggle only.
    }
  }, [expandInline, isExpanded, isPlaying, normalizedUri, player]);

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
      try {
        player.pause();
      } catch {
        // Ignore.
      }
    };
  }, [clearCollapseTimer, player]);

  React.useEffect(() => {
    clearCollapseTimer();
    setIsExpanded(false);
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
    progress.value = 0;
    badgeOpacity.value = 0;
  }, [clearCollapseTimer, normalizedThumbnailUri, normalizedUri, progress]);

  React.useEffect(() => {
    badgeOpacity.value = withTiming(isExpanded && !isPlaying ? 1 : 0, { duration: 160 });
  }, [badgeOpacity, isExpanded, isPlaying]);

  const slotStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [COLLAPSED_SIZE, EXPANDED_SIZE]);
    const marginVertical = interpolate(progress.value, [0, 1], [0, 12]);
    return {
      width: size,
      height: size,
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

  const overlayStyle = useAnimatedStyle(() => ({
    paddingHorizontal: interpolate(progress.value, [0, 1], [8, 12]),
    paddingBottom: interpolate(progress.value, [0, 1], [8, 12]),
  }));

  const centerBadgeStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [0.88, 1]),
      },
    ],
  }));

  const showPoster = normalizedThumbnailUri.length > 0 && (!isPlayerMounted || !hasRenderedFrame);
  const durationLabel = formatDuration(durationMs);

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Toggle video note playback' : 'Open video note'}
          onPress={handlePress}
          style={styles.pressable}
        >
          <Reanimated.View style={[styles.circle, circleStyle]}>
            {showPoster ? (
              <Image source={{ uri: normalizedThumbnailUri }} style={styles.poster} resizeMode="cover" />
            ) : null}

            {!normalizedThumbnailUri && !isPlayerMounted ? (
              <View style={styles.posterFallback}>
                <Feather name="video" size={28} color="#EAF1FF" />
              </View>
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
              <View style={styles.centerBadgeInner}>
                <Feather name={isPlaying ? 'pause' : 'play'} size={18} color="#0F172A" />
              </View>
            </Reanimated.View>

            <Reanimated.View pointerEvents="none" style={[styles.overlay, overlayStyle]}>
              <View style={styles.metaStrip}>
                <View style={styles.durationPill}>
                  <Text style={styles.durationText}>{durationLabel}</Text>
                </View>

                {time ? (
                  <View style={styles.timePill}>
                    <MessageTimeStatus
                      time={time}
                      status={status}
                      isMe={isMe}
                      compact
                      timeColor="#FFFFFF"
                      iconColor="#FFFFFF"
                    />
                  </View>
                ) : null}
              </View>
            </Reanimated.View>
          </Reanimated.View>
        </Pressable>
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
  pressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
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
  centerBadgeInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  durationPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.36)',
  },
  timePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.36)',
  },
  durationText: {
    fontSize: typography.timeStatus,
    lineHeight: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
});
