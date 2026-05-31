import React from 'react';
import { useEvent, useEventListener } from 'expo';
import Feather from '@expo/vector-icons/Feather';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Dimensions,
  Image as RNImage,
  type ImageStyle,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Reanimated, {
  cancelAnimation,
  Easing,
  type FrameInfo,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);
const ReanimatedPressable = Reanimated.createAnimatedComponent(RNPressable);
import { VoicePlayerService } from '../services/VoicePlayerService';
import { colors, typography } from '../theme/colors';
import {
  formatMediaDuration,
  formatPlaybackElapsedDuration,
} from '../utils/mediaDuration';
import { MessageReactionInline, type InlineReactionItem } from './MessageReactionInline';
import { MessageTimeStatus } from './MessageTimeStatus';
import type { MessageSource } from '../stores/types';
import { OutgoingBubbleGradientShell } from './OutgoingBubbleViewportGradient';

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
const SCRUB_RING_PROGRESS_STROKE_WIDTH = 4;
const SCRUB_RING_PROGRESS_SHADOW_WIDTH = 5.5;
const PLAYBACK_PROGRESS_SNAP_MS = 120;
const SCRUB_RING_INSET = 8;
const PLAYBACK_UI_TICK_MS = 180;
const SCRUB_THUMB_SIZE = 18;
const CENTER_PLAY_TAP_EXCLUSION_RADIUS = 44;
/** Тонкое кольцо экранного градиента вокруг кружка (тёмная тема), без квадратной обёртки MeBubbleChrome. */
const OUTGOING_SCREEN_GRADIENT_RING_PX = 3;
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

/** Telegram-style: touch must land on the ring band (not center, not outside). */
function isPointOnScrubRingBand(
  locationX: number,
  locationY: number,
  center: number,
  ringRadius: number,
  centerExclusionRadius: number
) {
  'worklet';
  const dx = locationX - center;
  const dy = locationY - center;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const inner = Math.max(centerExclusionRadius + 4, ringRadius - 32);
  const outer = ringRadius + 26;
  return dist >= inner && dist <= outer;
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

function clearActiveVideoNoteController(controller: ActiveVideoNoteController) {
  if (activeVideoNoteController !== controller) {
    return;
  }
  activeVideoNoteController = null;
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
  inlineReactions?: InlineReactionItem[];
  allowMessageReactions?: boolean;
  onToggleInlineReaction?: (emoji: string) => void;
  reactionAccentColor?: string;
  /** Свои сообщения + тёмная тема default: круглое кольцо градиента вместо квадратного MeBubbleChrome. */
  viewportOutgoingGradient?: boolean;
  scrollTick?: number;
  source?: MessageSource;
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
    prev.registerPlaybackState === next.registerPlaybackState &&
    prev.inlineReactions === next.inlineReactions &&
    prev.allowMessageReactions === next.allowMessageReactions &&
    prev.onToggleInlineReaction === next.onToggleInlineReaction &&
    prev.viewportOutgoingGradient === next.viewportOutgoingGradient &&
    prev.scrollTick === next.scrollTick
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
  inlineReactions,
  allowMessageReactions,
  onToggleInlineReaction,
  reactionAccentColor,
  bubbleMeColor: _bubbleMeColor,
  outgoingMetaColor: _outgoingMetaColor,
  outgoingAccentColor: _outgoingAccentColor,
  viewportOutgoingGradient = false,
  scrollTick = 0,
  source,
}: VideoNoteBubbleProps) {
  const generatedNoteId = React.useId();
  const noteId = messageId ?? generatedNoteId;
  const useOutgoingGradientRing = Boolean(isMe && viewportOutgoingGradient);
  const gradientRingActiveSV = useSharedValue(useOutgoingGradientRing ? 1 : 0);
  React.useEffect(() => {
    gradientRingActiveSV.value = useOutgoingGradientRing ? 1 : 0;
  }, [gradientRingActiveSV, useOutgoingGradientRing]);
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
  const playbackProgress = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);
  const replyTranslateX = useSharedValue(0);
  const replyHasTriggered = useSharedValue(false);
  const replyTriggerPop = useSharedValue(0);
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(true);
  const suppressPressUntilRef = React.useRef(0);
  const scrubProgressRef = React.useRef<number | null>(null);
  const scrubSeekThrottleRef = React.useRef(0);
  const playbackControllerRef = React.useRef<ActiveVideoNoteController>(null);
  const didActivateThumbScrub = useSharedValue(false);
  const isPlayingUI = useSharedValue(false);
  const isExpandedUI = useSharedValue(false);
  const isScrubbingUI = useSharedValue(false);
  /** Last sample from ExoPlayer (ms) + wall clock at that moment — ring advances smoothly between samples. */
  const syncReportedMs = useSharedValue(0);
  const syncWallClockMs = useSharedValue(0);
  const totalDurationMsUI = useSharedValue(0);

  const player = useVideoPlayer(normalizedUri, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 1 / 30;
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  const isExpandedRef = React.useRef(false);
  const isPlayingRef = React.useRef(false);
  const effectiveDurationRef = React.useRef(0);
  const reportedPositionMsRef = React.useRef(0);
  /** Low-frequency tick so duration label / snapshot read smooth wall-clock position without 60Hz React re-renders. */
  const [playbackUiTick, setPlaybackUiTick] = React.useState(0);

  React.useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);
  React.useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const setScrubProgressValue = React.useCallback((nextProgress: number | null) => {
    scrubProgressRef.current = nextProgress;
    setScrubProgress(nextProgress);
  }, []);

  useEventListener(player, 'timeUpdate', (payload) => {
    const dur = effectiveDurationRef.current;
    if (dur <= 0) {
      return;
    }
    const raw = Math.round((payload.currentTime ?? 0) * 1000);
    const clamped = Math.min(Math.max(raw, 0), dur);
    reportedPositionMsRef.current = clamped;
    if (isExpandedRef.current && isPlayingRef.current && scrubProgressRef.current == null) {
      syncReportedMs.value = clamped;
      syncWallClockMs.value = Date.now();
    }
  });

  useEventListener(player, 'playingChange', (payload) => {
    if (!payload.isPlaying) {
      return;
    }
    const dur = effectiveDurationRef.current;
    if (dur <= 0) {
      return;
    }
    try {
      const raw = Math.round((player.currentTime ?? 0) * 1000);
      const clamped = Math.min(Math.max(raw, 0), dur);
      reportedPositionMsRef.current = clamped;
      if (isExpandedRef.current && scrubProgressRef.current == null) {
        syncReportedMs.value = clamped;
        syncWallClockMs.value = Date.now();
      }
    } catch {
      // ignore
    }
  });

  React.useEffect(() => {
    effectiveDurationRef.current = Math.max(
      durationMs,
      Math.round((player.duration || 0) * 1000)
    );
  }, [durationMs, player.duration]);

  React.useEffect(() => {
    if (!isExpanded || !isPlaying || scrubProgress != null || showPausedPlayOverlay) {
      return;
    }
    const id = setInterval(
      () => setPlaybackUiTick((n) => n + 1),
      PLAYBACK_UI_TICK_MS
    );
    return () => clearInterval(id);
  }, [isExpanded, isPlaying, scrubProgress, showPausedPlayOverlay]);

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
      }
      clearActiveVideoNoteController(playbackControllerRef.current);
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
        // Pause first so OEM players (e.g. some Realme builds) get the stop signal before UI state flips.
        try {
          player.pause();
        } catch {
          // ignore
        }
        setShowPausedPlayOverlay(true);
        requestAnimationFrame(() => {
          try {
            if (player.playing) {
              player.pause();
            }
          } catch {
            // ignore
          }
        });
      } else {
        setIsThumbScrubbing(false);
        setIsThumbScrubPending(false);
        setShowPausedPlayOverlay(false);
        setScrubProgressValue(null);
        badgeOpacity.value = 0;
        try {
          player.play();
        } catch {
          // Best effort.
        }
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
      clearActiveVideoNoteController(playbackControllerRef.current);
      playbackControllerRef.current = null;
      return;
    }

    const playerDurationMs = Math.round((player.duration || 0) * 1000);
    const durationForState = playerDurationMs > 0 ? playerDurationMs : durationMs;
    let rawPositionMs: number;
    if (scrubProgress != null) {
      rawPositionMs = Math.round(clampUnit(scrubProgress) * durationForState);
    } else if (
      isPlaying &&
      !showPausedPlayOverlay &&
      durationForState > 0
    ) {
      rawPositionMs = Math.round(
        Math.min(
          Math.max(0, syncReportedMs.value + (Date.now() - syncWallClockMs.value)),
          durationForState
        )
      );
    } else {
      rawPositionMs = reportedPositionMsRef.current;
    }
    const positionMs = Math.min(Math.max(rawPositionMs, 0), durationForState);
    const progressValue =
      durationForState > 0 ? clampUnit(positionMs / durationForState) : 0;

    const controller: ActiveVideoNoteController = {
      togglePlayback: handlePress,
      stopPlayback: collapseInline,
    };
    playbackControllerRef.current = controller;

    setVideoNotePlaybackSnapshot({
      messageId: noteId,
      uri: normalizedUri,
      isPlaying: isPlaying && !showPausedPlayOverlay,
      positionMs,
      durationMs: durationForState,
      progress: progressValue,
    });
    setActiveVideoNoteController(controller);

    return () => {
      if (getVideoNotePlaybackSnapshot().messageId === noteId) {
        clearVideoNotePlaybackSnapshot(noteId);
      }
      clearActiveVideoNoteController(controller);
      if (playbackControllerRef.current === controller) {
        playbackControllerRef.current = null;
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
    playbackUiTick,
  ]);

  const slotStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [COLLAPSED_SIZE, EXPANDED_SIZE]);
    const marginVertical = interpolate(progress.value, [0, 1], [0, 12]);
    const footprint = useOutgoingGradientRing ? size + OUTGOING_SCREEN_GRADIENT_RING_PX * 2 : size;
    return {
      width: footprint,
      height: size + META_ROW_HEIGHT + META_ROW_GAP,
      marginVertical,
    };
  }, [useOutgoingGradientRing]);

  const ringOuterStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [COLLAPSED_SIZE, EXPANDED_SIZE]);
    const outer = size + OUTGOING_SCREEN_GRADIENT_RING_PX * 2;
    const shadowOpacity = interpolate(progress.value, [0, 1], [0.18, 0.28]);
    const shadowRadius = interpolate(progress.value, [0, 1], [8, 18]);
    return {
      width: outer,
      height: outer,
      borderRadius: outer / 2,
      overflow: 'hidden' as const,
      shadowColor: '#0F172A',
      shadowOpacity,
      shadowRadius,
      shadowOffset: { width: 0, height: 8 },
      /**
       * Elevation + LinearGradient underflow often draws a square on Android (esp. press/hold).
       * Screen-gradient ring relies on overflow clip; skip elevation for this shell.
       */
      elevation: gradientRingActiveSV.value ? 0 : interpolate(progress.value, [0, 1], [4, 8]),
    };
  });

  const ringHoleStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [COLLAPSED_SIZE, EXPANDED_SIZE]);
    const inset = OUTGOING_SCREEN_GRADIENT_RING_PX;
    return {
      position: 'absolute' as const,
      top: inset,
      left: inset,
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden' as const,
      backgroundColor: '#0B1020',
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

  const playerDurationMs = Math.round((player.duration || 0) * 1000);
  const effectiveDurationMs = playerDurationMs > 0 ? playerDurationMs : durationMs;

  const liveElapsedMs = React.useMemo(() => {
    if (effectiveDurationMs <= 0) {
      return 0;
    }
    if (scrubProgress != null) {
      return Math.round(clampUnit(scrubProgress) * effectiveDurationMs);
    }
    if (!isExpanded || !isPlaying || showPausedPlayOverlay) {
      return Math.min(Math.max(reportedPositionMsRef.current, 0), effectiveDurationMs);
    }
    return Math.min(
      Math.max(0, syncReportedMs.value + (Date.now() - syncWallClockMs.value)),
      effectiveDurationMs
    );
  }, [
    effectiveDurationMs,
    isExpanded,
    isPlaying,
    playbackUiTick,
    scrubProgress,
    showPausedPlayOverlay,
  ]);

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
  const scrubRingCenter = scrubRingSize / 2;

  /**
   * Smooth ring: interpolate position linearly in real time between ExoPlayer samples (same clock idea as
   * Telegram {@link https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/Cells/ChatMessageCell.java ChatMessageCell}
   * audioProgress + invalidate). No per-sample React re-renders — timeUpdate only updates shared refs.
   */
  const onPlaybackProgressFrame = React.useCallback((_frameInfo: FrameInfo) => {
    'worklet';
    if (!isExpandedUI.value || !isPlayingUI.value || isScrubbingUI.value) {
      return;
    }

    const dur = totalDurationMsUI.value;
    if (dur <= 0) {
      return;
    }

    const elapsedMs =
      syncReportedMs.value + (Date.now() - syncWallClockMs.value);
    let p = elapsedMs / dur;
    if (p < 0) {
      p = 0;
    }
    if (p > 1) {
      p = 1;
    }
    playbackProgress.value = p;
  }, []);

  const progressRingFrame = useFrameCallback(onPlaybackProgressFrame, false);

  React.useEffect(() => {
    progressRingFrame.setActive(isExpanded);
  }, [isExpanded, progressRingFrame]);

  React.useEffect(() => {
    isExpandedUI.value = isExpanded;
  }, [isExpanded, isExpandedUI]);

  React.useEffect(() => {
    isPlayingUI.value = isPlaying && scrubProgress == null;
  }, [isPlaying, scrubProgress, isPlayingUI]);

  React.useEffect(() => {
    totalDurationMsUI.value = effectiveDurationMs;
  }, [effectiveDurationMs, totalDurationMsUI]);

  // Collapsed / scrub / paused: snap ring without the frame runner advancing it.
  React.useEffect(() => {
    if (!isExpanded) {
      isScrubbingUI.value = false;
      cancelAnimation(playbackProgress);
      playbackProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      return;
    }
    if (scrubProgress != null) {
      isScrubbingUI.value = true;
      cancelAnimation(playbackProgress);
      const u = clampUnit(scrubProgress);
      playbackProgress.value = u;
      return;
    }
    isScrubbingUI.value = false;
    if (!isPlaying) {
      cancelAnimation(playbackProgress);
      playbackProgress.value = withTiming(effectiveProgress, {
        duration: PLAYBACK_PROGRESS_SNAP_MS,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [effectiveProgress, isExpanded, isPlaying, playbackProgress, scrubProgress, isScrubbingUI]);

  const progressArcAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: scrubRingCircumference * (1 - clampUnit(playbackProgress.value)),
  }));

  const scrubThumbAnimatedStyle = useAnimatedStyle(() => {
    const angle = clampUnit(playbackProgress.value) * Math.PI * 2 - Math.PI / 2;
    return {
      transform: [
        { translateX: Math.cos(angle) * scrubRingRadius },
        { translateY: Math.sin(angle) * scrubRingRadius },
      ] as const,
    };
  });

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
    reportedPositionMsRef.current = nextPositionMs;
    syncReportedMs.value = nextPositionMs;
    syncWallClockMs.value = Date.now();
  }, [effectiveDurationMs, player, syncReportedMs, syncWallClockMs]);

  const updateScrubProgress = React.useCallback(
    (nextProgress: number) => {
      suppressPressUntilRef.current = Date.now() + 220;
      setScrubProgressValue(nextProgress);
      if (effectiveDurationMs <= 0) {
        return;
      }
      const now = Date.now();
      if (now - scrubSeekThrottleRef.current < 90) {
        return;
      }
      scrubSeekThrottleRef.current = now;
      const p = Math.max(0, Math.min(1, nextProgress));
      const nextMs = Math.round(p * effectiveDurationMs);
      try {
        player.currentTime = nextMs / 1000;
      } catch {
        // Ignore seek races while dragging (matches Telegram ~100ms seeks during round scrub).
      }
      reportedPositionMsRef.current = nextMs;
      syncReportedMs.value = nextMs;
      syncWallClockMs.value = Date.now();
    },
    [effectiveDurationMs, player, setScrubProgressValue, syncReportedMs, syncWallClockMs]
  );

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
            isPointOnScrubRingBand(
              touch.x,
              touch.y,
              scrubRingCenter,
              scrubRingRadius,
              CENTER_PLAY_TAP_EXCLUSION_RADIUS
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
    [didActivateThumbScrub, finalizeThumbScrub, scrubRingCenter, scrubRingRadius, showPausedPlayOverlay, updateScrubProgress]
  );

  const composedGesture = React.useMemo(
    () => Gesture.Exclusive(scrubGesture, replyGesture),
    [replyGesture, scrubGesture]
  );

  const posterUri = normalizedThumbnailUri || generatedThumbnailUri;
  const showPoster = posterUri.length > 0 && (!isPlayerMounted || !hasRenderedFrame);

  const circleInner = (
    <>
      {showPoster ? (
        <Image source={{ uri: posterUri }} style={posterImageStyle} contentFit="cover" cachePolicy="disk" />
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
          pointerEvents={Platform.OS === 'android' ? 'none' : 'auto'}
        />
      ) : null}

      {/* 
        On some Android devices (e.g. Samsung), expo-video's VideoView swallows 
        touches even if pointerEvents='none' or nativeControls={false}.
        An invisible view over it guarantees the touch bubbles up to the Pressable. 
      */}
      {Platform.OS === 'android' ? (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' }} />
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
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={SCRUB_RING_TRACK_STROKE_WIDTH}
              fill="none"
            />
            <AnimatedCircle
              cx={scrubRingSize / 2}
              cy={scrubRingSize / 2}
              r={scrubRingRadius}
              stroke="rgba(0,0,0,0.18)"
              strokeWidth={SCRUB_RING_PROGRESS_SHADOW_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${scrubRingCircumference} ${scrubRingCircumference}`}
              animatedProps={progressArcAnimatedProps}
              fill="none"
              rotation={-90}
              originX={scrubRingSize / 2}
              originY={scrubRingSize / 2}
            />
            <AnimatedCircle
              cx={scrubRingSize / 2}
              cy={scrubRingSize / 2}
              r={scrubRingRadius}
              stroke="rgba(255,255,255,0.82)"
              strokeWidth={SCRUB_RING_PROGRESS_STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${scrubRingCircumference} ${scrubRingCircumference}`}
              animatedProps={progressArcAnimatedProps}
              fill="none"
              rotation={-90}
              originX={scrubRingSize / 2}
              originY={scrubRingSize / 2}
            />
          </Svg>
          {showPausedPlayOverlay ? (
            <Reanimated.View style={[styles.scrubThumb, scrubThumbAnimatedStyle]}>
              <View style={styles.scrubThumbDot} />
            </Reanimated.View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const circleAndroidRipple =
    Platform.OS === 'android'
      ? useOutgoingGradientRing
        ? { color: 'rgba(255,255,255,0.16)', borderless: true }
        : { color: 'rgba(255,255,255,0.12)' }
      : undefined;

  const pressableContent = (
    <View style={styles.tapColumn}>
      <ReanimatedPressable
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? 'Toggle video note playback' : 'Open video note'}
        onPress={handlePress}
        android_ripple={circleAndroidRipple}
        style={styles.pressableCircleHost}
      >
        {useOutgoingGradientRing ? (
          <Reanimated.View style={ringOuterStyle}>
            <OutgoingBubbleGradientShell scrollTick={scrollTick} style={StyleSheet.absoluteFillObject}>
              {null}
            </OutgoingBubbleGradientShell>
            <Reanimated.View style={ringHoleStyle}>{circleInner}</Reanimated.View>
          </Reanimated.View>
        ) : (
          <Reanimated.View style={[styles.circle, circleStyle]}>{circleInner}</Reanimated.View>
        )}
      </ReanimatedPressable>

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
                source={source}
              />
            </View>
          </View>
        ) : null}
      </Reanimated.View>
    </View>
  );

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {header}

      <View style={[styles.noteSlotShell, isMe ? styles.slotMe : styles.slotOther]}>
        <Reanimated.View style={[styles.slot, slotStyle]}>
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

        {inlineReactions?.length ? (
          <View style={styles.noteReactionOverlay} pointerEvents="box-none">
            <MessageReactionInline
              reactions={inlineReactions}
              isMe={isMe}
              allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
              onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
              variant="floatingTail"
              accentColor={reactionAccentColor}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}, arePropsEqual);

const styles = StyleSheet.create({
  container: {
    maxWidth: '100%',
    paddingVertical: 2,
  },
  containerEmbedded: {
    paddingVertical: 0,
  },
  noteSlotShell: {
    position: 'relative',
  },
  noteReactionOverlay: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: META_ROW_HEIGHT + META_ROW_GAP + 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    zIndex: 4,
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
  tapColumn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  /** Only wraps the round video — avoids Android ripple filling a tall rect that included meta row. */
  pressableCircleHost: {
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
    top: '50%',
    left: '50%',
    marginTop: -SCRUB_THUMB_SIZE / 2,
    marginLeft: -SCRUB_THUMB_SIZE / 2,
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
