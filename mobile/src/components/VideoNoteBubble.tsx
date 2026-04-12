import React from 'react';
import { useEvent, useEventListener } from 'expo';
import Feather from '@expo/vector-icons/Feather';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Dimensions,
  Image,
  type ImageStyle,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { VoicePlayerService } from '../services/VoicePlayerService';
import { colors, typography } from '../theme/colors';
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
const ACTIVE_NOTE_RELEASE_DELAY_MS = 220;
const REPLY_SWIPE_TRIGGER = 34;
const REPLY_SWIPE_MAX = 72;
const GENERATED_THUMBNAIL_TIME_MS = 0;
const SCRUB_RING_TRACK_STROKE_WIDTH = 2.5;
const SCRUB_RING_PROGRESS_STROKE_WIDTH = 5;
const SCRUB_RING_PROGRESS_SHADOW_WIDTH = 7;
const SCRUB_RING_INSET = 8;
const SCRUB_THUMB_SIZE = 18;
const SCRUB_THUMB_CAPTURE_PADDING = 10;
const CENTER_PLAY_TAP_EXCLUSION_RADIUS = 44;
const SCRUB_THUMB_HOLD_DURATION_MS = 180;
const generatedThumbnailCache = new Map<string, string>();
const posterImageStyle: ImageStyle = {
  ...StyleSheet.absoluteFillObject,
  width: undefined,
  height: undefined,
};

function clampReplySwipe(value: number) {
  'worklet';
  return Math.max(-REPLY_SWIPE_MAX, Math.min(0, value));
}

function clampUnit(value: number) {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function progressForScrubPoint(locationX: number, locationY: number, ringCenter: number) {
  'worklet';
  const dx = locationX - ringCenter;
  const dy = locationY - ringCenter;
  const angle = Math.atan2(dy, dx);
  const normalizedAngle = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return clampUnit(normalizedAngle / (Math.PI * 2));
}

function isScrubThumbTouchTarget(
  locationX: number,
  locationY: number,
  thumbCenterX: number,
  thumbCenterY: number,
  captureRadius: number
) {
  'worklet';
  const dx = locationX - thumbCenterX;
  const dy = locationY - thumbCenterY;
  return dx * dx + dy * dy <= captureRadius * captureRadius;
}

function isPointWithinRadius(
  locationX: number,
  locationY: number,
  centerX: number,
  centerY: number,
  radius: number
) {
  'worklet';
  const dx = locationX - centerX;
  const dy = locationY - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

type ActiveVideoNoteListener = (activeId: string | null) => void;
type VideoNotePlaybackListener = () => void;

export type VideoNotePlaybackSnapshot = {
  messageId: string | null;
  uri: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  progress: number;
};

type ActiveVideoNoteController = {
  togglePlayback: () => void;
  stopPlayback: () => void;
} | null;

let activeVideoNoteId: string | null = null;
const activeVideoNoteListeners = new Set<ActiveVideoNoteListener>();
const videoNotePlaybackListeners = new Set<VideoNotePlaybackListener>();
let activeVideoNoteController: ActiveVideoNoteController = null;
let pendingVideoNoteOwnershipRelease: ReturnType<typeof setTimeout> | null = null;
let pendingVideoNoteOwnershipReleaseId: string | null = null;
let pendingVideoNoteOwnershipReleaseUri: string | null = null;
let videoNotePlaybackSnapshot: VideoNotePlaybackSnapshot = {
  messageId: null,
  uri: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  progress: 0,
};

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

function setActiveVideoNoteController(nextController: ActiveVideoNoteController) {
  activeVideoNoteController = nextController;
}

function cancelPendingVideoNoteOwnershipRelease(noteId?: string | null, uri?: string | null) {
  if (!pendingVideoNoteOwnershipRelease) {
    return;
  }

  if (
    noteId != null &&
    uri != null &&
    pendingVideoNoteOwnershipReleaseId !== noteId &&
    pendingVideoNoteOwnershipReleaseUri !== uri
  ) {
    return;
  }

  clearTimeout(pendingVideoNoteOwnershipRelease);
  pendingVideoNoteOwnershipRelease = null;
  pendingVideoNoteOwnershipReleaseId = null;
  pendingVideoNoteOwnershipReleaseUri = null;
}

function schedulePendingVideoNoteOwnershipRelease(
  noteId: string,
  uri: string,
  onRelease: () => void
) {
  cancelPendingVideoNoteOwnershipRelease();
  pendingVideoNoteOwnershipReleaseId = noteId;
  pendingVideoNoteOwnershipReleaseUri = uri;
  pendingVideoNoteOwnershipRelease = setTimeout(() => {
    pendingVideoNoteOwnershipRelease = null;
    pendingVideoNoteOwnershipReleaseId = null;
    pendingVideoNoteOwnershipReleaseUri = null;
    onRelease();
  }, ACTIVE_NOTE_RELEASE_DELAY_MS);
}

function emitVideoNotePlaybackSnapshot() {
  videoNotePlaybackListeners.forEach((listener) => listener());
}

function setVideoNotePlaybackSnapshot(nextSnapshot: VideoNotePlaybackSnapshot) {
  const prevSnapshot = videoNotePlaybackSnapshot;
  if (
    prevSnapshot.messageId === nextSnapshot.messageId &&
    prevSnapshot.uri === nextSnapshot.uri &&
    prevSnapshot.isPlaying === nextSnapshot.isPlaying &&
    prevSnapshot.positionMs === nextSnapshot.positionMs &&
    prevSnapshot.durationMs === nextSnapshot.durationMs &&
    prevSnapshot.progress === nextSnapshot.progress
  ) {
    return;
  }

  videoNotePlaybackSnapshot = nextSnapshot;
  emitVideoNotePlaybackSnapshot();
}

function clearVideoNotePlaybackSnapshot(messageId: string) {
  if (videoNotePlaybackSnapshot.messageId !== messageId) {
    return;
  }

  setVideoNotePlaybackSnapshot({
    messageId: null,
    uri: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    progress: 0,
  });
}

function subscribeToVideoNotePlayback(listener: VideoNotePlaybackListener) {
  videoNotePlaybackListeners.add(listener);
  return () => {
    videoNotePlaybackListeners.delete(listener);
  };
}

function getVideoNotePlaybackSnapshot() {
  return videoNotePlaybackSnapshot;
}

export function stopActiveVideoNotePlayback() {
  activeVideoNoteController?.stopPlayback();
}

export function toggleActiveVideoNotePlayback() {
  activeVideoNoteController?.togglePlayback();
}

export function useVideoNotePlayer() {
  const snapshot = React.useSyncExternalStore(
    subscribeToVideoNotePlayback,
    getVideoNotePlaybackSnapshot,
    getVideoNotePlaybackSnapshot
  );

  return {
    ...snapshot,
    togglePlayback: toggleActiveVideoNotePlayback,
    stopPlayback: stopActiveVideoNotePlayback,
  };
}

export interface VideoNoteBubbleProps {
  messageId?: string;
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
  registerPlaybackState?: boolean;
}

function arePropsEqual(prev: VideoNoteBubbleProps, next: VideoNoteBubbleProps) {
  return (
    prev.messageId === next.messageId &&
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
    prev.onReplySwipe === next.onReplySwipe &&
    prev.registerPlaybackState === next.registerPlaybackState
  );
}

export const VideoNoteBubble = React.memo(function VideoNoteBubble({
  messageId,
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
  registerPlaybackState = true,
}: VideoNoteBubbleProps) {
  const generatedNoteId = React.useId();
  const noteId = messageId ?? generatedNoteId;
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
  const [scrubProgress, setScrubProgress] = React.useState<number | null>(null);
  const [isThumbScrubbing, setIsThumbScrubbing] = React.useState(false);
  const [isThumbScrubPending, setIsThumbScrubPending] = React.useState(false);
  const progress = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);
  const replyTranslateX = useSharedValue(0);
  const replyHasTriggered = useSharedValue(false);
  const replyTriggerPop = useSharedValue(0);
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(true);
  const suppressPressUntilRef = React.useRef(0);
  const scrubProgressRef = React.useRef<number | null>(null);
  const didActivateThumbScrub = useSharedValue(false);

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

  const setScrubProgressValue = React.useCallback((nextProgress: number | null) => {
    scrubProgressRef.current = nextProgress;
    setScrubProgress(nextProgress);
  }, []);

  const clearCollapseTimer = React.useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const stopVoicePlayback = React.useCallback(() => {
    void VoicePlayerService.stop().catch(() => {});
  }, []);

  const releasePlaybackOwnership = React.useCallback((pausePlayer: boolean) => {
    const release = () => {
      if (getActiveVideoNoteId() === noteId) {
        setActiveVideoNoteId(null);
      }
      if (getVideoNotePlaybackSnapshot().messageId === noteId) {
        clearVideoNotePlaybackSnapshot(noteId);
        setActiveVideoNoteController(null);
      }
      if (pausePlayer) {
        try {
          player.pause();
        } catch {
          // Ignore.
        }
      }
    };

    if (registerPlaybackState && getVideoNotePlaybackSnapshot().messageId === noteId) {
      schedulePendingVideoNoteOwnershipRelease(noteId, normalizedUri, release);
      return;
    }

    release();
  }, [normalizedUri, noteId, player, registerPlaybackState]);

  const finishCollapse = React.useCallback(() => {
    if (!isMountedRef.current) return;
    setIsExpanded(false);
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
    setShowPausedPlayOverlay(false);
    setIsThumbScrubbing(false);
    setIsThumbScrubPending(false);
    setScrubProgressValue(null);
  }, [setScrubProgressValue]);

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
    stopVoicePlayback();
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
  }, [animateProgress, clearCollapseTimer, normalizedUri, noteId, player, stopVoicePlayback]);

  const handlePress = React.useCallback(() => {
    if (!normalizedUri) return;
    if (Date.now() < suppressPressUntilRef.current) return;

    if (!isExpanded) {
      expandInline();
      return;
    }

    try {
      if (!showPausedPlayOverlay) {
        setScrubProgressValue(null);
        setShowPausedPlayOverlay(true);
        player.pause();
      } else {
        setIsThumbScrubbing(false);
        setIsThumbScrubPending(false);
        setShowPausedPlayOverlay(false);
        setScrubProgressValue(null);
        badgeOpacity.value = 0;
        player.play();
      }
    } catch {
      // Best effort toggle only.
    }
  }, [
    badgeOpacity,
    expandInline,
    isExpanded,
    normalizedUri,
    player,
    setScrubProgressValue,
    showPausedPlayOverlay,
  ]);

  useEventListener(player, 'playToEnd', () => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      collapseInline();
      collapseTimerRef.current = null;
    }, COLLAPSE_DELAY_MS);
  });

  React.useEffect(() => {
    isMountedRef.current = true;
    cancelPendingVideoNoteOwnershipRelease(noteId, normalizedUri);
    return () => {
      isMountedRef.current = false;
      clearCollapseTimer();
      releasePlaybackOwnership(true);
    };
  }, [clearCollapseTimer, normalizedUri, noteId, releasePlaybackOwnership]);

  React.useEffect(() => {
    return subscribeToActiveVideoNote((activeId) => {
      if (activeId != null && activeId !== noteId && (isExpanded || isPlayerMounted)) {
        collapseInline();
      }
    });
  }, [collapseInline, isExpanded, isPlayerMounted, noteId]);

  React.useEffect(() => {
    if (normalizedUri) {
      return;
    }

    clearCollapseTimer();
    setIsExpanded(false);
    setIsPlayerMounted(false);
    setHasRenderedFrame(false);
    setShowPausedPlayOverlay(false);
    setIsThumbScrubbing(false);
    setIsThumbScrubPending(false);
    setScrubProgressValue(null);
    progress.value = 0;
    badgeOpacity.value = 0;
    if (getActiveVideoNoteId() === noteId) {
      setActiveVideoNoteId(null);
    }
  }, [
    badgeOpacity,
    clearCollapseTimer,
    noteId,
    normalizedUri,
    progress,
    setScrubProgressValue,
  ]);

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

  React.useEffect(() => {
    if (!registerPlaybackState || !normalizedUri) {
      return;
    }

    cancelPendingVideoNoteOwnershipRelease(noteId, normalizedUri);
    const snapshot = getVideoNotePlaybackSnapshot();
    const shouldRestoreActivePlayback =
      snapshot.messageId != null &&
      (snapshot.messageId === noteId ||
        (snapshot.uri === normalizedUri && getActiveVideoNoteId() === snapshot.messageId));

    if (!shouldRestoreActivePlayback) {
      return;
    }

    if (getActiveVideoNoteId() !== noteId) {
      setActiveVideoNoteId(noteId);
    }

    if (snapshot.messageId !== noteId || snapshot.uri !== normalizedUri) {
      setVideoNotePlaybackSnapshot({
        ...snapshot,
        messageId: noteId,
        uri: normalizedUri,
      });
    }

    setIsExpanded(true);
    setIsPlayerMounted(true);
    setHasRenderedFrame(false);
    setShowPausedPlayOverlay(!snapshot.isPlaying);
    progress.value = 1;
    setScrubProgressValue(
      snapshot.durationMs > 0
        ? clampUnit(snapshot.positionMs / snapshot.durationMs)
        : snapshot.progress
    );

    requestAnimationFrame(() => {
      try {
        player.currentTime = Math.max(snapshot.positionMs, 0) / 1000;
      } catch {
        // Ignore player seek races during restore.
      }

      try {
        if (snapshot.isPlaying) {
          player.play();
        } else {
          player.pause();
        }
      } catch {
        // Ignore restore races while the player source is preparing.
      }
    });
  }, [noteId, normalizedUri, player, progress, registerPlaybackState, setScrubProgressValue]);

  React.useEffect(() => {
    if (!registerPlaybackState) {
      return;
    }

    if (!isExpanded || !normalizedUri) {
      clearVideoNotePlaybackSnapshot(noteId);
      if (activeVideoNoteController && videoNotePlaybackSnapshot.messageId === noteId) {
        setActiveVideoNoteController(null);
      }
      return;
    }

    const durationForState = Math.max(durationMs, Math.round((player.duration || 0) * 1000));
    const rawPositionMs =
      scrubProgress != null
        ? Math.round(clampUnit(scrubProgress) * durationForState)
        : Math.round((timeUpdate.currentTime ?? 0) * 1000);
    const positionMs = Math.min(Math.max(rawPositionMs, 0), durationForState);
    const progressValue =
      durationForState > 0 ? clampUnit(positionMs / durationForState) : 0;

    setVideoNotePlaybackSnapshot({
      messageId: noteId,
      uri: normalizedUri,
      isPlaying: isPlaying && !showPausedPlayOverlay,
      positionMs,
      durationMs: durationForState,
      progress: progressValue,
    });
    setActiveVideoNoteController({
      togglePlayback: handlePress,
      stopPlayback: collapseInline,
    });

    return () => {
      if (videoNotePlaybackSnapshot.messageId === noteId) {
        clearVideoNotePlaybackSnapshot(noteId);
      }
      if (activeVideoNoteController && videoNotePlaybackSnapshot.messageId === noteId) {
        setActiveVideoNoteController(null);
      }
    };
  }, [
    collapseInline,
    durationMs,
    handlePress,
    isExpanded,
    isPlaying,
    normalizedUri,
    noteId,
    player.duration,
    registerPlaybackState,
    scrubProgress,
    showPausedPlayOverlay,
    timeUpdate.currentTime,
  ]);

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

  const replySwipeEnabled =
    enableReplySwipe &&
    typeof onReplySwipe === 'function' &&
    !isThumbScrubbing &&
    !isThumbScrubPending;

  const replyGesture = React.useMemo(() => Gesture.Pan()
    .enabled(replySwipeEnabled)
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
    }), [onReplySwipe, replyHasTriggered, replySwipeEnabled, replyTranslateX, replyTriggerPop]);

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

  const effectiveDurationMs = Math.max(durationMs, Math.round((player.duration || 0) * 1000));
  const liveElapsedMs = Math.min(
    Math.max(Math.round((timeUpdate.currentTime ?? 0) * 1000), 0),
    effectiveDurationMs
  );
  const effectiveProgress = clampUnit(
    scrubProgress != null
      ? scrubProgress
      : effectiveDurationMs > 0
        ? liveElapsedMs / effectiveDurationMs
        : 0
  );
  const elapsedMs = Math.round(effectiveProgress * effectiveDurationMs);
  const durationLabel = isExpanded
    ? formatPlaybackElapsedDuration(elapsedMs, effectiveDurationMs)
    : formatMediaDuration(durationMs);
  const scrubRingSize = isExpanded ? EXPANDED_SIZE : COLLAPSED_SIZE;
  const scrubRingPadding = SCRUB_RING_INSET + SCRUB_RING_PROGRESS_SHADOW_WIDTH / 2;
  const scrubRingRadius = scrubRingSize / 2 - scrubRingPadding;
  const scrubRingCircumference = 2 * Math.PI * scrubRingRadius;
  const scrubRingOffset = scrubRingCircumference * (1 - effectiveProgress);
  const scrubRingCenter = scrubRingSize / 2;
  const scrubAngleRadians = effectiveProgress * Math.PI * 2 - Math.PI / 2;
  const scrubThumbOffset = SCRUB_THUMB_SIZE / 2;
  const scrubThumbCenterX = scrubRingCenter + Math.cos(scrubAngleRadians) * scrubRingRadius;
  const scrubThumbCenterY = scrubRingCenter + Math.sin(scrubAngleRadians) * scrubRingRadius;
  const scrubThumbCaptureRadius = scrubThumbOffset + SCRUB_THUMB_CAPTURE_PADDING;

  const commitScrubProgress = React.useCallback(async () => {
    if (scrubProgressRef.current == null || effectiveDurationMs <= 0) {
      return;
    }

    const nextPositionMs = Math.round(clampUnit(scrubProgressRef.current) * effectiveDurationMs);
    try {
      player.currentTime = nextPositionMs / 1000;
    } catch {
      // Ignore player seek races.
    }
  }, [effectiveDurationMs, player]);

  const updateScrubProgress = React.useCallback((nextProgress: number) => {
    suppressPressUntilRef.current = Date.now() + 220;
    setScrubProgressValue(nextProgress);
  }, [setScrubProgressValue]);

  const finalizeThumbScrub = React.useCallback((didActivate: boolean) => {
    setIsThumbScrubbing(false);
    setIsThumbScrubPending(false);
    if (!didActivate) {
      return;
    }
    void commitScrubProgress();
    suppressPressUntilRef.current = Date.now() + 220;
  }, [commitScrubProgress]);

  const scrubGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(showPausedPlayOverlay)
        .activateAfterLongPress(SCRUB_THUMB_HOLD_DURATION_MS)
        .onTouchesDown((event, stateManager) => {
          const touch = event.allTouches[0];
          if (!touch || !showPausedPlayOverlay) {
            didActivateThumbScrub.value = false;
            stateManager.fail();
            return;
          }

          if (
            isPointWithinRadius(
              touch.x,
              touch.y,
              scrubRingCenter,
              scrubRingCenter,
              CENTER_PLAY_TAP_EXCLUSION_RADIUS
            )
          ) {
            didActivateThumbScrub.value = false;
            stateManager.fail();
            return;
          }

          if (
            isScrubThumbTouchTarget(
              touch.x,
              touch.y,
              scrubThumbCenterX,
              scrubThumbCenterY,
              scrubThumbCaptureRadius
            )
          ) {
            runOnJS(setIsThumbScrubPending)(true);
            return;
          }

          didActivateThumbScrub.value = false;
          stateManager.fail();
        })
        .onStart((event) => {
          didActivateThumbScrub.value = true;
          runOnJS(setIsThumbScrubbing)(true);
          runOnJS(updateScrubProgress)(
            progressForScrubPoint(event.x, event.y, scrubRingCenter)
          );
        })
        .onUpdate((event) => {
          runOnJS(updateScrubProgress)(
            progressForScrubPoint(event.x, event.y, scrubRingCenter)
          );
        })
        .onFinalize(() => {
          const didActivate = didActivateThumbScrub.value;
          didActivateThumbScrub.value = false;
          runOnJS(finalizeThumbScrub)(didActivate);
        }),
    [
      didActivateThumbScrub,
      finalizeThumbScrub,
      scrubRingCenter,
      scrubThumbCaptureRadius,
      scrubThumbCenterX,
      scrubThumbCenterY,
      showPausedPlayOverlay,
      updateScrubProgress,
    ]
  );

  const composedGesture = React.useMemo(
    () => Gesture.Exclusive(scrubGesture, replyGesture),
    [replyGesture, scrubGesture]
  );

  const posterUri = normalizedThumbnailUri || generatedThumbnailUri;
  const showPoster = posterUri.length > 0 && (!isPlayerMounted || !hasRenderedFrame);

  const pressableContent = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isExpanded ? 'Toggle video note playback' : 'Open video note'}
      onPress={handlePress}
      style={styles.pressable}
    >
      <Reanimated.View
        style={[styles.circle, circleStyle]}
      >
        {showPoster ? (
          <Image source={{ uri: posterUri }} style={posterImageStyle} resizeMode="cover" />
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

        {isExpanded ? (
          <View pointerEvents="none" style={styles.scrubRingWrap}>
            <Svg width={scrubRingSize} height={scrubRingSize}>
              <Circle
                cx={scrubRingSize / 2}
                cy={scrubRingSize / 2}
                r={scrubRingRadius}
                stroke="rgba(255,255,255,0.34)"
                strokeWidth={SCRUB_RING_TRACK_STROKE_WIDTH}
                fill="none"
              />
              <Circle
                cx={scrubRingSize / 2}
                cy={scrubRingSize / 2}
                r={scrubRingRadius}
                stroke="rgba(0,0,0,0.34)"
                strokeWidth={SCRUB_RING_PROGRESS_SHADOW_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${scrubRingCircumference} ${scrubRingCircumference}`}
                strokeDashoffset={scrubRingOffset}
                fill="none"
                rotation={-90}
                originX={scrubRingSize / 2}
                originY={scrubRingSize / 2}
              />
              <Circle
                cx={scrubRingSize / 2}
                cy={scrubRingSize / 2}
                r={scrubRingRadius}
                stroke="#FFFFFF"
                strokeWidth={SCRUB_RING_PROGRESS_STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${scrubRingCircumference} ${scrubRingCircumference}`}
                strokeDashoffset={scrubRingOffset}
                fill="none"
                rotation={-90}
                originX={scrubRingSize / 2}
                originY={scrubRingSize / 2}
              />
            </Svg>
            {showPausedPlayOverlay ? (
              <View
                style={[
                  styles.scrubThumb,
                  {
                    left: scrubThumbCenterX,
                    top: scrubThumbCenterY,
                  },
                ]}
              >
                <View style={styles.scrubThumbDot} />
              </View>
            ) : null}
          </View>
        ) : null}
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
          <GestureDetector gesture={composedGesture}>
            <View style={styles.replyGestureContainer}>
              <Reanimated.View style={[styles.replySwipeAction, replyIconStyle]}>
                <View style={styles.replySwipeIconWrap}>
                  <Feather name="corner-left-up" size={18} color={colors.accent} />
                </View>
              </Reanimated.View>
              <Reanimated.View style={[styles.replyGestureContent, replyContentStyle]}>
                {pressableContent}
              </Reanimated.View>
            </View>
          </GestureDetector>
        ) : showPausedPlayOverlay ? (
          <GestureDetector gesture={composedGesture}>{pressableContent}</GestureDetector>
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
  scrubRingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubThumb: {
    position: 'absolute',
    width: SCRUB_THUMB_SIZE,
    height: SCRUB_THUMB_SIZE,
    borderRadius: SCRUB_THUMB_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [
      { translateX: -SCRUB_THUMB_SIZE / 2 },
      { translateY: -SCRUB_THUMB_SIZE / 2 },
    ],
  },
  scrubThumbDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    shadowColor: '#000000',
    shadowOpacity: 0.34,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
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
