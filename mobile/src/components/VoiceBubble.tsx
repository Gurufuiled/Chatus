import React, { useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Dimensions, type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import {
  useVoicePlaybackForUri,
  useVoicePlayerControls,
} from '../contexts/VoicePlayerContext';
import { bubbleRadius, colors, typography } from '../theme/colors';
import {
  formatMediaDuration,
  formatRemainingPlaybackDuration,
} from '../utils/mediaDuration';
import { stopActiveVideoNotePlayback } from './VideoNoteBubble';
import { MessageReactionInline, type InlineReactionItem } from './MessageReactionInline';
import { MessageTimeStatus } from './MessageTimeStatus';
import { AnimatedPlayPauseIcon } from './AnimatedPlayPauseIcon';

/** Throttle waveform bar re-renders to ~8fps while playing (125ms) — imperceptible visually. */
const WAVEFORM_RENDER_THROTTLE_MS = 125;


export interface VoiceBubbleProps {
  uri: string;
  waveform: number[]; 
  durationMs: number;
  isMe: boolean;
  time?: string;
  viewCount?: number;
  status?: string;
  embedded?: boolean;
  header?: React.ReactNode;
  bubbleMeColor?: string;
  outgoingTextColor?: string;
  outgoingMetaColor?: string;
  outgoingAccentColor?: string;
  inlineReactions?: InlineReactionItem[];
  allowMessageReactions?: boolean;
  onToggleInlineReaction?: (emoji: string) => void;
  reactionAccentColor?: string;
  /** Тёмная тема приложения: фон/бордер чужого бабла (иначе из StyleSheet — светлые). */
  incomingBubbleBackground?: string;
  incomingBubbleBorderColor?: string;
  incomingDurationColor?: string;
}

const VOICE_BUBBLE_WIDTH = Math.min(Dimensions.get('window').width * 0.72, 290);
const VOICE_BAR_COUNT = 74;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createDeterministicSeed(uri: string, durationMs: number): number {
  let hash = durationMs || 1;
  for (let i = 0; i < uri.length; i += 1) {
    hash = (hash * 31 + uri.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function seededUnitNoise(seed: number, index: number): number {
  const x = Math.sin(seed * 0.00013 + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildDecorativeFallback(
  uri: string,
  durationMs: number,
  targetCount: number,
): number[] {
  const seed = createDeterministicSeed(uri, durationMs);
  return Array.from({ length: targetCount }, (_, index) => {
    const t = targetCount <= 1 ? 0 : index / (targetCount - 1);
    const phraseEnvelope = 0.28 + Math.sin(t * Math.PI) * 0.34;
    const phrasePulse =
      Math.sin(t * Math.PI * 4.1 + seededUnitNoise(seed, index) * 1.2) * 0.18;
    const localNoise = (seededUnitNoise(seed, index + 17) - 0.5) * 0.2;
    const gapDip = index % 6 === 0 ? -0.2 : index % 4 === 0 ? -0.08 : 0;
    return clamp01(phraseEnvelope + phrasePulse + localNoise + gapDip);
  });
}

function buildTelegramLikeBars(
  uri: string,
  waveform: number[],
  durationMs: number,
  targetCount: number,
): number[] {
  if (waveform.length === 0) {
    return buildDecorativeFallback(uri, durationMs, targetCount);
  }

  const clamped = waveform.map(clamp01);

  const bucketSize = clamped.length / targetCount;
  const bars = Array.from({ length: targetCount }, (_, i) => {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(clamped.length, Math.ceil((i + 1) * bucketSize));
    const bucket = clamped.slice(start, Math.max(end, start + 1));
    if (bucket.length === 0) return 0;
    const peak = Math.max(...bucket);
    const avg = bucket.reduce((s, v) => s + v, 0) / bucket.length;
    return peak * 0.6 + avg * 0.4;
  });

  const min = Math.min(...bars);
  const max = Math.max(...bars);
  const spread = max - min;

  if (spread < 0.005) {
    return buildDecorativeFallback(uri, durationMs, targetCount);
  }

  return bars.map((value, index) => {
    const normalized = (value - min) / spread;
    const t = targetCount <= 1 ? 0.5 : index / (targetCount - 1);
    const edgeTaper = 0.88 + Math.sin(t * Math.PI) * 0.12;
    return clamp01(normalized * edgeTaper);
  });
}

function arePropsEqual(prev: VoiceBubbleProps, next: VoiceBubbleProps) {
  return (
    prev.uri === next.uri &&
    prev.durationMs === next.durationMs &&
    prev.isMe === next.isMe &&
    prev.time === next.time &&
    prev.viewCount === next.viewCount &&
    prev.status === next.status &&
    prev.embedded === next.embedded &&
    prev.header === next.header &&
    prev.bubbleMeColor === next.bubbleMeColor &&
    prev.incomingBubbleBackground === next.incomingBubbleBackground &&
    prev.incomingBubbleBorderColor === next.incomingBubbleBorderColor &&
    prev.incomingDurationColor === next.incomingDurationColor &&
    prev.outgoingTextColor === next.outgoingTextColor &&
    prev.outgoingMetaColor === next.outgoingMetaColor &&
    prev.outgoingAccentColor === next.outgoingAccentColor &&
    prev.waveform === next.waveform &&
    prev.inlineReactions === next.inlineReactions &&
    prev.allowMessageReactions === next.allowMessageReactions &&
    prev.onToggleInlineReaction === next.onToggleInlineReaction
  );
}

export const VoiceBubble = React.memo(function VoiceBubble({
  uri,
  waveform,
  durationMs,
  isMe,
  time,
  viewCount,
  status: messageStatus,
  embedded = false,
  header,
  bubbleMeColor,
  outgoingTextColor,
  outgoingMetaColor,
  outgoingAccentColor,
  inlineReactions,
  allowMessageReactions,
  onToggleInlineReaction,
  reactionAccentColor,
  incomingBubbleBackground,
  incomingBubbleBorderColor,
  incomingDurationColor,
}: VoiceBubbleProps) {
  const { play, pause, seekTo } = useVoicePlayerControls();
  const { isCurrent, isPlaying, progress, remainingMs } = useVoicePlaybackForUri(uri, durationMs);
  const [waveformWidth, setWaveformWidth] = useState(0);

  // Throttle the progress value used for waveform rendering to avoid
  // excessive re-renders from 100ms service ticks. UI looks identical at 8fps.
  const throttledProgressRef = useRef(0);
  const lastThrottleTimestampRef = useRef(0);
  const [renderProgress, setRenderProgress] = useState(0);
  React.useEffect(() => {
    const now = Date.now();
    if (!isPlaying || now - lastThrottleTimestampRef.current >= WAVEFORM_RENDER_THROTTLE_MS) {
      lastThrottleTimestampRef.current = now;
      if (throttledProgressRef.current !== progress) {
        throttledProgressRef.current = progress;
        setRenderProgress(progress);
      }
    }
  }, [isPlaying, progress]);

  const shouldShowRemainingDuration = isCurrent && (isPlaying || progress > 0);
  const durationLabel = shouldShowRemainingDuration
    ? formatRemainingPlaybackDuration(remainingMs)
    : formatMediaDuration(durationMs);

  const bars = useMemo(
    () => buildTelegramLikeBars(uri, waveform, durationMs, VOICE_BAR_COUNT),
    [durationMs, uri, waveform]
  );
  const barHeights = useMemo(
    () =>
      bars.map((value) => {
        const v = Math.max(0, Math.min(1, value ?? 0));
        return 2 + Math.pow(v, 1.4) * 22;
      }),
    [bars]
  );

  const barCount = bars.length;
  const filledBarCount =
    renderProgress > 0 ? Math.max(0, Math.min(barCount, Math.round(renderProgress * barCount))) : 0;
  const hasPlaybackProgress = isCurrent && renderProgress > 0;

  const handlePress = () => {
    if (isPlaying) {
      void pause();
      return;
    }

    try {
      stopActiveVideoNotePlayback();
      void play(uri).catch((err) => {
        if (__DEV__) console.warn('[VoiceBubble] playback error:', err, uri);
      });
    } catch (err) {
      if (__DEV__) console.warn('[VoiceBubble] playback error:', err, uri);
    }
  };

  const handleWaveformLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== waveformWidth) {
      setWaveformWidth(nextWidth);
    }
  };

  const handleWaveformPress = (pressX: number) => {
    if (waveformWidth <= 0 || durationMs <= 0) return;
    const ratio = clamp01(pressX / waveformWidth);
    const targetPositionMs = Math.round(durationMs * ratio);

    try {
      if (!isCurrent) {
        stopActiveVideoNotePlayback();
        void play(uri, targetPositionMs).catch((err) => {
          if (__DEV__) console.warn('[VoiceBubble] seek error:', err, uri);
        });
      } else {
        void seekTo(targetPositionMs).catch((err) => {
          if (__DEV__) console.warn('[VoiceBubble] seek error:', err, uri);
        });
      }
    } catch (err) {
      if (__DEV__) console.warn('[VoiceBubble] seek error:', err, uri);
    }
  };

  return (
    <View
      style={[
        styles.container,
        embedded ? styles.containerEmbedded : isMe ? styles.bubbleMe : styles.bubbleOther,
        !isMe && incomingBubbleBackground
          ? {
              backgroundColor: incomingBubbleBackground,
              borderColor: incomingBubbleBorderColor ?? colors.bubbleOtherBorder,
            }
          : null,
        isMe && bubbleMeColor ? { backgroundColor: bubbleMeColor } : null,
      ]}
    >
      {header}
      <View style={styles.mainRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause voice message' : 'Play voice message'}
          accessibilityState={{ selected: isPlaying }}
          style={({ pressed }) => [
            styles.playButton,
            isMe ? styles.playButtonMe : styles.playButtonOther,
            pressed && styles.playButtonPressed,
          ]}
          onPress={handlePress}
          hitSlop={8}
        >
          <AnimatedPlayPauseIcon
            isPlaying={isPlaying}
            size={18}
            color={isMe ? (outgoingAccentColor ?? colors.accent) : '#FFFFFF'}
          />
        </Pressable>

        <View style={styles.contentColumn}>
          <Pressable
            onLayout={handleWaveformLayout}
            onPress={(event) => {
              handleWaveformPress(event.nativeEvent.locationX);
            }}
            style={({ pressed }) => [styles.waveformContainer, pressed && styles.waveformPressed]}
          >
            {barHeights.map((barHeight, index) => {
              const isFilled = renderProgress > 0 && index / barCount <= renderProgress;
              return (
                <View
                  key={index}
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: isFilled
                        ? isMe
                          ? outgoingTextColor ?? '#FFFFFF'
                          : '#4A8FF5'
                        : isMe
                          ? outgoingTextColor ? `${outgoingTextColor}66` : 'rgba(255, 255, 255, 0.4)'
                          : '#D2D5DA',
                    },
                  ]}
                />
              );
            })}
          </Pressable>

          <View style={styles.metaRow}>
            <Text
              style={[
                styles.duration,
                isMe && styles.durationMe,
                !isMe && incomingDurationColor ? { color: incomingDurationColor } : null,
              ]}
            >
              {durationLabel}
            </Text>
            <View style={styles.metaRight}>
              {viewCount != null ? (
                <View style={styles.metricWrap}>
                  <Feather name="eye" size={12} color="rgba(120, 126, 138, 0.9)" />
                  <Text style={styles.metricText}>{viewCount}</Text>
                </View>
              ) : null}
              {time ? (
                <MessageTimeStatus
                  time={time}
                  status={messageStatus ?? 'sent'}
                  isMe={isMe}
                  compact
                  timeColor={isMe ? outgoingMetaColor : undefined}
                  iconColor={isMe ? outgoingMetaColor : undefined}
                />
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {inlineReactions?.length ? (
        <MessageReactionInline
          reactions={inlineReactions}
          isMe={isMe}
          allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
          onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
          variant="floatingTail"
          accentColor={reactionAccentColor}
        />
      ) : null}
    </View>
  );
}, arePropsEqual);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    width: VOICE_BUBBLE_WIDTH,
    maxWidth: '100%',
    minWidth: 0,
  },
  containerEmbedded: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginVertical: 0,
    width: VOICE_BUBBLE_WIDTH,
    maxWidth: '100%',
    backgroundColor: 'transparent',
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
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  playButtonMe: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 23, 42, 0.1)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  playButtonOther: {
    backgroundColor: '#3B7AED',
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  playButtonPressed: {
    opacity: 0.75,
  },
  contentColumn: {
    flex: 1,
    minWidth: 0,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 28,
    position: 'relative',
    overflow: 'hidden',
  },
  waveformPressed: {
    opacity: 0.9,
  },
  bar: {
    width: 2.2,
    borderRadius: 999,
    minHeight: 2.5,
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  duration: {
    fontSize: typography.timeStatus,
    color: 'rgba(120, 126, 138, 0.9)',
    minWidth: 34,
    letterSpacing: 0.1,
  },
  durationMe: {
    color: colors.textSecondaryMuted,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: typography.timeStatus,
    lineHeight: 14,
    color: 'rgba(120, 126, 138, 0.9)',
    fontWeight: '600',
  },
});
