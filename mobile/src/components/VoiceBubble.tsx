import React, { useMemo, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Dimensions, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { MessageTimeStatus } from './MessageTimeStatus';

export interface VoiceBubbleProps {
  uri: string;
  waveform: number[]; 
  durationMs: number;
  isMe: boolean;
  time?: string;
  status?: string;
  embedded?: boolean;
  header?: React.ReactNode;
  bubbleMeColor?: string;
  outgoingTextColor?: string;
  outgoingMetaColor?: string;
  outgoingAccentColor?: string;
}

const VOICE_BUBBLE_WIDTH = Math.min(Dimensions.get('window').width * 0.72, 290);
const VOICE_BAR_COUNT = 34;

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
    prev.status === next.status &&
    prev.embedded === next.embedded &&
    prev.header === next.header &&
    prev.bubbleMeColor === next.bubbleMeColor &&
    prev.outgoingTextColor === next.outgoingTextColor &&
    prev.outgoingMetaColor === next.outgoingMetaColor &&
    prev.outgoingAccentColor === next.outgoingAccentColor &&
    prev.waveform === next.waveform
  );
}

export const VoiceBubble = React.memo(function VoiceBubble({
  uri,
  waveform,
  durationMs,
  isMe,
  time,
  status: messageStatus,
  embedded = false,
  header,
  bubbleMeColor,
  outgoingTextColor,
  outgoingMetaColor,
  outgoingAccentColor,
}: VoiceBubbleProps) {
  const { play, pause, seekTo } = useVoicePlayerControls();
  const { isCurrent, isPlaying, progress, remainingMs } = useVoicePlaybackForUri(uri, durationMs);
  const [waveformWidth, setWaveformWidth] = useState(0);
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
    progress > 0 ? Math.max(0, Math.min(barCount, Math.round(progress * barCount))) : 0;
  const hasPlaybackProgress = isCurrent && progress > 0;

  const handlePress = async () => {
    if (isPlaying) {
      await pause();
      return;
    }

    try {
      stopActiveVideoNotePlayback();
      await play(uri);
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

  const handleWaveformPress = async (pressX: number) => {
    if (waveformWidth <= 0 || durationMs <= 0) return;
    const ratio = clamp01(pressX / waveformWidth);
    const targetPositionMs = Math.round(durationMs * ratio);

    try {
      if (!isCurrent) {
        stopActiveVideoNotePlayback();
        await play(uri, targetPositionMs);
      } else {
        await seekTo(targetPositionMs);
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
            isPlaying && styles.playButtonActive,
            pressed && styles.playButtonPressed,
          ]}
          onPress={handlePress}
          hitSlop={8}
        >
          <Feather
            name={isPlaying ? 'pause' : 'play'}
            size={14}
            color={isMe ? outgoingAccentColor ?? colors.accent : '#605719'}
            style={isPlaying ? undefined : styles.playIconPlay}
          />
        </Pressable>

        <View style={styles.contentColumn}>
          <Pressable
            onLayout={handleWaveformLayout}
            onPress={(event) => {
              void handleWaveformPress(event.nativeEvent.locationX);
            }}
            style={({ pressed }) => [styles.waveformContainer, pressed && styles.waveformPressed]}
          >
            {filledBarCount > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.waveformTrack,
                  styles.waveformTrackFilled,
                  isMe ? styles.waveformTrackFilledMe : styles.waveformTrackFilledOther,
                  { width: `${(filledBarCount / barCount) * 100}%` },
                ]}
              />
            ) : null}

            {barHeights.map((barHeight, index) => {
              const isFilled = progress > 0 && index / barCount <= progress;
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
                          : '#B8B8BE'
                      : isMe
                        ? hasPlaybackProgress
                          ? '#C8D0DC'
                          : outgoingTextColor ?? '#FFFFFF'
                        : 'rgba(188, 188, 194, 0.72)',
                  },
                ]}
                />
              );
            })}
          </Pressable>

          <View style={styles.metaRow}>
            <Text style={[styles.duration, isMe && styles.durationMe]}>
              {durationLabel}
            </Text>

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
    width: '100%',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  playButtonMe: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.95)',
  },
  playButtonOther: {
    backgroundColor: 'rgba(138, 89, 214, 0.12)',
    borderColor: 'rgba(138, 89, 214, 0.16)',
  },
  playButtonActive: {
    transform: [{ scale: 0.98 }],
  },
  playButtonPressed: {
    opacity: 0.72,
  },
  playIconPlay: {
    marginLeft: 1,
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
  },
  waveformPressed: {
    opacity: 0.9,
  },
  waveformTrack: {
    position: 'absolute',
    left: 0,
    height: 2,
    borderRadius: 999,
    top: 13,
  },
  waveformTrackFilled: {
    right: 'auto',
  },
  waveformTrackFilledMe: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  waveformTrackFilledOther: {
    backgroundColor: 'rgba(184, 184, 190, 0.16)',
  },
  bar: {
    width: 2,
    borderRadius: 999,
    minHeight: 2,
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
});
