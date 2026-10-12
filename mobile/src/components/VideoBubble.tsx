import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from 'react-native';
import { Image } from 'expo-image';
import { useEvent } from 'expo';
import Feather from '@expo/vector-icons/Feather';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { useHeroDismiss } from '../hooks/useHeroDismiss';
import { HeroOverlay } from './HeroOverlay';
import {
  measureThumbRef,
  registerMediaThumb,
  unregisterMediaThumb,
  type MeasurableThumb,
} from '../utils/mediaThumbRegistry';
import type { Size } from '../utils/heroDismissCore';
import { colors, bubbleRadius, typography } from '../theme/colors';
import {
  formatMediaDuration,
  formatPlaybackElapsedDuration,
} from '../utils/mediaDuration';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../utils/videoThumbnail';
import { MessageReactionInline, type InlineReactionItem } from './MessageReactionInline';
import { MessageTimeStatus } from './MessageTimeStatus';
import type { MessageSource } from '../stores/types';
import { MessageTextBubbleBody } from './MessageTextBubbleBody';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.68, 300);
const MAX_BUBBLE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.48, 360);
const MIN_PORTRAIT_WIDTH = 154;
const DEFAULT_VIDEO_SIZE = {
  width: Math.min(MAX_BUBBLE_WIDTH, 240),
  height: Math.min(MAX_BUBBLE_HEIGHT, 300),
};
const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;

export interface VideoBubbleProps {
  uri: string;
  thumbnailUri?: string;
  isMe: boolean;
  width?: number;
  height?: number;
  durationMs?: number;
  caption?: string;
  time?: string;
  status?: string;
  embedded?: boolean;
  header?: React.ReactNode;
  bubbleMeColor?: string;
  outgoingTextColor?: string;
  centered?: boolean;
  viewCount?: number;
  /** If true, use provided width/height as-is without internal clamping. */
  fixedSize?: boolean;
  /** Parent handles fullscreen (e.g. swipe-to-dismiss profile viewer). */
  onOpenFullscreen?: () => void;
  /** id медиа во вьювере родителя: регистрирует превью, чтобы кадр «садился» на него при закрытии. */
  thumbId?: string;
  inlineReactions?: InlineReactionItem[];
  allowMessageReactions?: boolean;
  onToggleInlineReaction?: (emoji: string) => void;
  reactionAccentColor?: string;
  incomingBubbleBackground?: string;
  incomingBubbleBorderColor?: string;
  incomingCaptionTextColor?: string;
  mediaClamp?: { maxWidth: number; maxHeight: number };
  incomingChannelPost?: boolean;
  footer?: React.ReactNode;
  viewCountShortLabel?: string;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  source?: MessageSource;
}

function computeDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = MAX_BUBBLE_WIDTH,
  maxHeight: number = MAX_BUBBLE_HEIGHT,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return {
      width: Math.min(maxWidth, DEFAULT_VIDEO_SIZE.width),
      height: Math.min(maxHeight, DEFAULT_VIDEO_SIZE.height),
    };
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
  maxWidth: number = MAX_BUBBLE_WIDTH,
  maxHeight: number = MAX_BUBBLE_HEIGHT,
) {
  if (width == null || height == null) return null;
  return computeDisplaySize(width, height, maxWidth, maxHeight);
}

function formatPlaybackRateLabel(rate: number) {
  return `${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(1)}x`;
}

function FullscreenVideoModal({
  uri,
  topInset,
  bottomInset,
  initialDurationMs,
  sourceRef,
  posterUri,
  videoSize,
  onClose,
}: {
  uri: string;
  topInset: number;
  bottomInset: number;
  initialDurationMs: number;
  /** Миниатюра видео в сообщении: на неё «садится» кадр при закрытии свайпом. */
  sourceRef: React.RefObject<MeasurableThumb | null>;
  posterUri: string | null;
  videoSize: Size | null;
  onClose: () => void;
}) {
  const getSourceRect = useCallback(() => measureThumbRef(sourceRef.current), [sourceRef]);
  const getHeroImageUri = useCallback(() => posterUri || null, [posterUri]);
  const getImageSize = useCallback(() => videoSize, [videoSize]);
  const hero = useHeroDismiss({
    visible: true,
    getSourceRect,
    getHeroImageUri,
    getImageSize,
    onDismiss: onClose,
  });
  const [trackWidth, setTrackWidth] = useState(1);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speedMenuVisible, setSpeedMenuVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbingSec, setScrubbingSec] = useState<number | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<'back' | 'forward' | null>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ at: number; x: number } | null>(null);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.playbackRate = 1;
    instance.muted = false;
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

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsHideTimer();
    controlsHideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setSpeedMenuVisible(false);
      controlsHideTimerRef.current = null;
    }, 3200);
  }, [clearControlsHideTimer]);

  useEffect(() => {
    try {
      player.play();
    } catch {
      // Best effort: native controls still allow playback after the modal opens.
    }

    return () => {
      clearControlsHideTimer();
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (skipFeedbackTimerRef.current) clearTimeout(skipFeedbackTimerRef.current);
      try {
        player.pause();
        player.currentTime = 0;
      } catch {
        // Ignore player teardown races.
      }
    };
  }, [clearControlsHideTimer, player]);

  useEffect(() => {
    if (controlsVisible && isPlaying && !speedMenuVisible && scrubbingSec == null) {
      scheduleControlsHide();
      return;
    }

    clearControlsHideTimer();
  }, [
    clearControlsHideTimer,
    controlsVisible,
    isPlaying,
    scheduleControlsHide,
    scrubbingSec,
    speedMenuVisible,
  ]);

  const durationSec = Math.max(
    initialDurationMs > 0 ? initialDurationMs / 1000 : 0,
    Number.isFinite(player.duration) ? player.duration : 0,
    0
  );
  const playerCurrentSec = Math.min(
    Math.max(timeUpdate.currentTime ?? player.currentTime ?? 0, 0),
    durationSec > 0 ? durationSec : Number.MAX_SAFE_INTEGER
  );
  const currentSec = scrubbingSec ?? playerCurrentSec;
  const progress = durationSec > 0 ? Math.min(currentSec / durationSec, 1) : 0;
  const hasEnded = durationSec > 0 && playerCurrentSec >= durationSec - 0.1;

  useEffect(() => {
    if (hasEnded) setControlsVisible(true);
  }, [hasEnded]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (durationSec <= 0) return;
      const nextTime = Math.max(0, Math.min(ratio, 1)) * durationSec;
      setScrubbingSec(nextTime);
      player.currentTime = nextTime;
    },
    [durationSec, player]
  );

  const seekToLocationX = useCallback(
    (locationX: number) => {
      if (durationSec <= 0) return;
      seekToRatio(locationX / trackWidth);
    },
    [durationSec, seekToRatio, trackWidth]
  );

  const seekBySeconds = useCallback(
    (offsetSec: number) => {
      if (durationSec <= 0) return;
      const nextTime = Math.max(0, Math.min(durationSec, playerCurrentSec + offsetSec));
      player.currentTime = nextTime;
      setScrubbingSec(nextTime);
      requestAnimationFrame(() => setScrubbingSec(null));
    },
    [durationSec, player, playerCurrentSec],
  );

  const handleTogglePlayback = useCallback(() => {
    setSpeedMenuVisible(false);
    setControlsVisible(true);
    try {
      if (isPlaying) {
        player.pause();
      } else if (durationSec > 0 && playerCurrentSec >= durationSec - 0.1) {
        player.replay();
      } else {
        player.play();
      }
    } catch {
      // Best effort control.
    }
  }, [durationSec, isPlaying, player, playerCurrentSec]);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(Math.max(event.nativeEvent.layout.width, 1));
  }, []);

  const progressPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          setControlsVisible(true);
          setSpeedMenuVisible(false);
          clearControlsHideTimer();
          seekToLocationX(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          seekToLocationX(event.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          setScrubbingSec(null);
          if (isPlaying) scheduleControlsHide();
        },
        onPanResponderTerminate: () => {
          setScrubbingSec(null);
          if (isPlaying) scheduleControlsHide();
        },
      }),
    [clearControlsHideTimer, isPlaying, scheduleControlsHide, seekToLocationX]
  );

  const handleFullscreenTap = useCallback((event: Parameters<NonNullable<React.ComponentProps<typeof Pressable>['onPress']>>[0]) => {
    if (speedMenuVisible) {
      setSpeedMenuVisible(false);
      return;
    }

    const now = Date.now();
    const x = event.nativeEvent.locationX;
    const previousTap = lastTapRef.current;
    if (previousTap && now - previousTap.at < 260) {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      lastTapRef.current = null;
      const direction = x < SCREEN_WIDTH / 2 ? 'back' : 'forward';
      setControlsVisible(true);
      seekBySeconds(direction === 'back' ? -10 : 10);
      setSkipFeedback(direction);
      if (skipFeedbackTimerRef.current) clearTimeout(skipFeedbackTimerRef.current);
      skipFeedbackTimerRef.current = setTimeout(() => {
        setSkipFeedback(null);
        skipFeedbackTimerRef.current = null;
      }, 650);
      return;
    }

    lastTapRef.current = { at: now, x };
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      setControlsVisible((visible) => !visible);
      lastTapRef.current = null;
      tapTimerRef.current = null;
    }, 260);
  }, [seekBySeconds, speedMenuVisible]);

  const handleSpeedButtonPress = useCallback(
    (event: Parameters<NonNullable<React.ComponentProps<typeof Pressable>['onPress']>>[0]) => {
      event.stopPropagation?.();
      setControlsVisible(true);
      setSpeedMenuVisible((visible) => !visible);
    },
    []
  );

  const handleSelectPlaybackRate = useCallback(
    (rate: (typeof PLAYBACK_RATES)[number]) => {
      setPlaybackRate(rate);
      setSpeedMenuVisible(false);
      setControlsVisible(true);
      player.playbackRate = rate;
    },
    [player]
  );

  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    player.muted = nextMuted;
    setControlsVisible(true);
  }, [isMuted, player]);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={hero.requestClose}
    >
      <GestureHandlerRootView style={styles.fullscreenRoot}>
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.fullscreenBackdropFill, hero.backdropStyle]}
        />
        <GestureDetector gesture={hero.gesture}>
          <Reanimated.View style={[styles.fullscreenContent, hero.contentStyle]}>
            <VideoView
              player={player}
              style={styles.fullscreenVideo}
              nativeControls={false}
              contentFit="contain"
              surfaceType="textureView"
              useExoShutter={false}
            />
            <Pressable
              style={styles.fullscreenTapLayer}
              onPress={handleFullscreenTap}
            />
          </Reanimated.View>
        </GestureDetector>

        <HeroOverlay hero={hero} />

        {/* панели тают вместе с фоном при перетаскивании */}
        <Reanimated.View
          style={[StyleSheet.absoluteFill, hero.chromeStyle]}
          pointerEvents="box-none"
        >
        {skipFeedback ? (
          <View pointerEvents="none" style={skipFeedback === 'back' ? styles.skipFeedbackLeft : styles.skipFeedbackRight}>
            <Feather name={skipFeedback === 'back' ? 'rotate-ccw' : 'rotate-cw'} size={22} color="#FFFFFF" />
            <Text style={styles.skipFeedbackText}>10 сек</Text>
          </View>
        ) : null}

        {controlsVisible ? (
          <Pressable
            style={[styles.closeButton, { top: topInset + 12 }]}
            onPress={hero.requestClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close video"
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {controlsVisible ? (
          <View style={[styles.customControls, { paddingBottom: Math.max(bottomInset, 12) + 6 }]}>
          {speedMenuVisible ? (
            <View style={styles.speedMenu}>
              {PLAYBACK_RATES.map((rate) => {
                const selected = playbackRate === rate;
                return (
                  <Pressable
                    key={rate}
                    onPress={() => handleSelectPlaybackRate(rate)}
                    style={({ pressed }: PressableStateCallbackType) => [
                      styles.speedOption,
                      selected && styles.speedOptionSelected,
                      pressed && styles.speedOptionPressed,
                    ]}
                  >
                    <Text style={[styles.speedOptionText, selected && styles.speedOptionTextSelected]}>
                      {formatPlaybackRateLabel(rate)}
                    </Text>
                    {selected ? <Feather name="check" size={16} color="#FFFFFF" /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.playbackControlsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasEnded ? 'Replay video' : isPlaying ? 'Pause video' : 'Play video'}
              onPress={handleTogglePlayback}
              style={({ pressed }) => [styles.primaryPlayControl, pressed && styles.controlPressed]}
            >
              <Feather
                name={hasEnded ? 'rotate-cw' : isPlaying ? 'pause' : 'play'}
                size={30}
                color="#111827"
                style={!isPlaying ? styles.primaryPlayIcon : undefined}
              />
            </Pressable>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.timeText}>
              {formatPlaybackElapsedDuration(currentSec * 1000, Math.max(durationSec * 1000, 0))}
            </Text>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel="Video progress"
              onLayout={handleTrackLayout}
              style={[styles.progressTrack, scrubbingSec != null && styles.progressTrackScrubbing]}
              {...progressPanResponder.panHandlers}
            >
              <View style={[styles.progressTrackRail, scrubbingSec != null && styles.progressTrackRailScrubbing]} />
              <View style={[styles.progressFill, scrubbingSec != null && styles.progressFillScrubbing, { width: `${progress * 100}%` }]} />
              <View style={[styles.progressThumb, scrubbingSec != null && styles.progressThumbScrubbing, { left: `${progress * 100}%` }]} />
              {scrubbingSec != null ? (
                <View style={[styles.scrubTimeBadge, { left: `${progress * 100}%` }]}>
                  <Text style={styles.scrubTimeText}>
                    {formatPlaybackElapsedDuration(scrubbingSec * 1000, Math.max(durationSec * 1000, 0))}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.timeText}>
              {durationSec > 0 ? formatMediaDuration(durationSec * 1000) : '0:00'}
            </Text>
          </View>

          <View style={styles.bottomActionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
              onPress={handleToggleMute}
              style={({ pressed }) => [styles.speedButton, pressed && styles.controlPressed]}
            >
              <Feather name={isMuted ? 'volume-x' : 'volume-2'} size={19} color="#FFFFFF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Playback speed"
              onPress={handleSpeedButtonPress}
              style={({ pressed }) => [styles.speedButton, pressed && styles.controlPressed]}
            >
              <Text style={styles.speedButtonText}>{formatPlaybackRateLabel(playbackRate)}</Text>
            </Pressable>
          </View>
          </View>
        ) : null}
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function VideoBubble({
  uri,
  thumbnailUri,
  isMe,
  width: propWidth,
  height: propHeight,
  durationMs = 0,
  caption,
  time,
  status,
  embedded = false,
  header,
  bubbleMeColor,
  outgoingTextColor,
  centered = false,
  viewCount,
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
  style,
  source,
}: VideoBubbleProps) {
  const normalizedUri = uri.trim();
  const normalizedThumbnailUri = thumbnailUri?.trim() ?? '';
  const maxW = mediaClamp?.maxWidth ?? MAX_BUBBLE_WIDTH;
  const maxH = mediaClamp?.maxHeight ?? MAX_BUBBLE_HEIGHT;
  const [generatedThumbnailUri, setGeneratedThumbnailUri] = useState(() =>
    normalizedUri ? getCachedVideoThumbnailUri(normalizedUri) ?? '' : ''
  );
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(() =>
    fixedSize && propWidth && propHeight
      ? { width: propWidth, height: propHeight }
      : resolveKnownDisplaySize(propWidth, propHeight, maxW, maxH)
  );
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const insets = useSafeAreaInsets();
  /** Само превью видео в сообщении: сюда «садится» кадр при закрытии свайпом. */
  const videoWrapperRef = useRef<View>(null);
  useEffect(() => {
    const node = videoWrapperRef.current;
    if (!node || !thumbId) return;
    registerMediaThumb(thumbId, node);
    return () => unregisterMediaThumb(thumbId, node);
  }, [thumbId]);

  useEffect(() => {
    if (fixedSize && propWidth && propHeight) {
      setDisplaySize({ width: propWidth, height: propHeight });
      return;
    }
    const knownDisplaySize = resolveKnownDisplaySize(propWidth, propHeight, maxW, maxH);
    if (knownDisplaySize) {
      setDisplaySize(knownDisplaySize);
      return;
    }

    const posterUri = normalizedThumbnailUri || generatedThumbnailUri;
    if (!posterUri) {
      setDisplaySize({
        width: Math.min(maxW, DEFAULT_VIDEO_SIZE.width),
        height: Math.min(maxH, DEFAULT_VIDEO_SIZE.height),
      });
      return;
    }

    setDisplaySize({
      width: Math.min(maxW, DEFAULT_VIDEO_SIZE.width),
      height: Math.min(maxH, DEFAULT_VIDEO_SIZE.height),
    });
  }, [generatedThumbnailUri, normalizedThumbnailUri, propHeight, propWidth, fixedSize, maxW, maxH]);

  useEffect(() => {
    if (!normalizedUri || normalizedThumbnailUri) {
      setGeneratedThumbnailUri('');
      return;
    }

    const cached = getCachedVideoThumbnailUri(normalizedUri);
    if (cached) {
      setGeneratedThumbnailUri(cached);
      return;
    }

    let cancelled = false;
    void ensureVideoThumbnailUri(normalizedUri)
      .then((nextUri) => {
        if (!cancelled) {
          setGeneratedThumbnailUri(nextUri);
        }
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

  const handlePress = useCallback(() => {
    if (!normalizedUri) return;
    if (onOpenFullscreen) {
      onOpenFullscreen();
      return;
    }
    setFullscreenVisible(true);
  }, [normalizedUri, onOpenFullscreen]);

  const handleClose = useCallback(() => {
    setFullscreenVisible(false);
  }, []);

  const posterUri = normalizedThumbnailUri || generatedThumbnailUri;
  const w = displaySize?.width ?? Math.min(maxW, DEFAULT_VIDEO_SIZE.width);
  const h = displaySize?.height ?? Math.min(maxH, DEFAULT_VIDEO_SIZE.height);
  const hasCaption = (caption ?? '').trim().length > 0;
  const hasFooter = Boolean(footer);
  const mediaBottomRounded = !hasCaption && !hasFooter;

  return (
    <>
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
          { maxWidth: incomingChannelPost ? w : (w + 8) },
          style,
        ]}
      >
        {header}

        <>
          <Pressable
            ref={videoWrapperRef}
            accessibilityRole="button"
            accessibilityLabel="Open video"
            onPress={handlePress}
            style={[
              styles.videoWrapper,
              { width: w, height: h },
              isMe ? styles.videoWrapperMe : styles.videoWrapperOther,
              embedded && styles.videoWrapperEmbedded,
              incomingChannelPost &&
                (mediaBottomRounded ? styles.videoWrapperChannelSolo : styles.videoWrapperChannelStacked),
            ]}
          >
            {posterUri ? (
              <Image 
                source={{ uri: posterUri }} 
                style={styles.poster} 
                contentFit="cover" 
                cachePolicy="memory-disk"
                onLoad={(e) => {
                  if (!propWidth || !propHeight) {
                    setDisplaySize(computeDisplaySize(e.source.width, e.source.height, maxW, maxH));
                  }
                }}
              />
            ) : (
              <View style={styles.posterFallback} />
            )}

            <View pointerEvents="none" style={styles.playBadge}>
              <Feather name="play" size={25} color="#FFFFFF" style={styles.playIcon} />
            </View>

            <View pointerEvents="none" style={styles.overlayMetaRow}>
              <View style={styles.durationPill}>
                <Text style={styles.durationText}>{formatMediaDuration(durationMs)}</Text>
              </View>

              {!hasCaption && time ? (
                <View style={styles.timePill}>
                  {viewCount != null ? (
                    <View style={styles.timePillMetric}>
                      <Feather name="eye" size={12} color="#FFFFFF" />
                      <Text style={styles.timePillMetricText}>
                        {viewCountShortLabel ?? String(viewCount)}
                      </Text>
                    </View>
                  ) : null}
                  <MessageTimeStatus
                    time={time}
                    status={status ?? 'sent'}
                    isMe={isMe}
                    compact
                    timeColor="#FFFFFF"
                    iconColor="#FFFFFF"
                    source={source}
                  />
                </View>
              ) : null}
            </View>
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
                time || viewCount != null ? (
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
                ) : undefined
              }
            />
          ) : null}
        </>

        {footer}

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

      {!onOpenFullscreen && fullscreenVisible && normalizedUri ? (
        <FullscreenVideoModal
          uri={normalizedUri}
          topInset={insets.top}
          bottomInset={insets.bottom}
          initialDurationMs={durationMs}
          sourceRef={videoWrapperRef}
          posterUri={posterUri || null}
          videoSize={propWidth && propHeight ? { width: propWidth, height: propHeight } : null}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 3,
    paddingVertical: 2,
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
    paddingBottom: 1,
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
  videoWrapper: {
    overflow: 'hidden',
    borderRadius: 10,
    position: 'relative',
    backgroundColor: '#0B1020',
  },
  videoWrapperMe: {
    backgroundColor: '#0B1020',
  },
  videoWrapperOther: {
    backgroundColor: '#0B1020',
  },
  videoWrapperEmbedded: {
    borderRadius: 0,
  },
  videoWrapperChannelSolo: {
    borderRadius: 14,
  },
  videoWrapperChannelStacked: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
  playBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 50,
    height: 50,
    borderRadius: 25,
    marginLeft: -25,
    marginTop: -25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
  },
  playIcon: {
    marginLeft: 4,
  },
  overlayMetaRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  durationPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  timePillMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timePillMetricText: {
    color: '#FFFFFF',
    fontSize: typography.timeStatus,
    lineHeight: 14,
    fontWeight: '600',
  },
  durationText: {
    fontSize: typography.timeStatus,
    lineHeight: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.1,
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
  fullscreenRoot: {
    flex: 1,
  },
  fullscreenBackdropFill: {
    backgroundColor: '#000000',
  },
  fullscreenContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenTapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  skipFeedbackLeft: {
    position: 'absolute',
    left: '16%',
    top: '46%',
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(8,12,18,0.64)',
    alignItems: 'center',
    gap: 3,
  },
  skipFeedbackRight: {
    position: 'absolute',
    right: '16%',
    top: '46%',
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(8,12,18,0.64)',
    alignItems: 'center',
    gap: 3,
  },
  skipFeedbackText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  fullscreenVideo: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  playbackControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  primaryPlayControl: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryPlayIcon: {
    marginLeft: 4,
  },
  controlPressed: {
    opacity: 0.78,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeText: {
    width: 44,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  progressTrackScrubbing: {
    height: 38,
  },
  progressTrackRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  progressTrackRailScrubbing: {
    height: 5,
  },
  scrubTimeBadge: {
    position: 'absolute',
    bottom: 27,
    minWidth: 48,
    marginLeft: -24,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(8,12,18,0.82)',
    alignItems: 'center',
  },
  scrubTimeText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  progressFillScrubbing: {
    height: 5,
  },
  progressThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    backgroundColor: '#FFFFFF',
  },
  progressThumbScrubbing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  bottomActionsRow: {
    minHeight: 48,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  speedButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  speedButtonText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  speedMenu: {
    position: 'absolute',
    right: 18,
    bottom: 96,
    width: 154,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 3,
  },
  speedOption: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speedOptionSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  speedOptionPressed: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  speedOptionText: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.76)',
  },
  speedOptionTextSelected: {
    color: '#FFFFFF',
  },
});
