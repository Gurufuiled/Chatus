import React, { useMemo, useState } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { Dimensions, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  useVoicePlaybackForUri,
  useVoicePlayerControls,
} from '../contexts/VoicePlayerContext';
import { buildUiWaveform } from '../services/waveformUtils';
import { bubbleRadius, colors, typography } from '../theme/colors';
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

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

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

function buildTelegramLikeBars(
  uri: string,
  waveform: number[],
  durationMs: number,
  targetCount: number
): number[] {
  const seed = createDeterministicSeed(uri, durationMs);
  const fallback = Array.from({ length: targetCount }, (_, index) => {
    const t = targetCount <= 1 ? 0 : index / (targetCount - 1);
    const speechEnvelope = 0.34 + Math.sin(t * Math.PI) * 0.18;
    const phrasePulse =
      Math.sin(t * Math.PI * 3.2 + seededUnitNoise(seed, index) * 0.9) * 0.11;
    const localNoise = (seededUnitNoise(seed, index + 17) - 0.5) * 0.16;
    return clamp01(speechEnvelope + phrasePulse + localNoise);
  });

  const base = buildUiWaveform(waveform.length > 0 ? waveform : fallback, targetCount);
  const min = Math.min(...base);
  const max = Math.max(...base);
  const spread = max - min;
  const average = base.reduce((sum, value) => sum + value, 0) / base.length;
  const useFallbackShape = spread < 0.085;

  return base.map((value, index) => {
    const t = targetCount <= 1 ? 0 : index / (targetCount - 1);
    const edgeSoftener = 0.9 + Math.sin(t * Math.PI) * 0.1;
    const normalized = useFallbackShape
      ? fallback[index]
      : clamp01((value - min) / Math.max(spread, 0.001));
    const centeredBoost = useFallbackShape
      ? normalized
      : clamp01(0.12 + normalized * 0.88 + (value - average) * 0.28);
    const microVariance = (seededUnitNoise(seed, index + 101) - 0.5) * 0.12;
    const rhythmicDip = index % 5 === 0 ? -0.08 : index % 3 === 0 ? 0.03 : 0;
    return clamp01(0.06 + centeredBoost * edgeSoftener + microVariance + rhythmicDip);
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

  const effectiveDurationMs = remainingMs;

  const bars = useMemo(
    () => buildTelegramLikeBars(uri, waveform, durationMs, 44),
    [durationMs, uri, waveform]
  );
  const barHeights = useMemo(
    () =>
      bars.map((value) => {
        const normalized = Math.max(0, Math.min(1, value ?? 0.5));
        return 3 + Math.pow(normalized, 1.35) * 13;
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
            color={isMe ? outgoingAccentColor ?? '#4D8DFF' : '#605719'}
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
              {formatDuration(effectiveDurationMs)}
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
    backgroundColor: '#FFFFFF',
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
    paddingTop: 3,
    height: 20,
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
    top: 10,
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
    width: 1.5,
    borderRadius: 999,
    minHeight: 3,
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
