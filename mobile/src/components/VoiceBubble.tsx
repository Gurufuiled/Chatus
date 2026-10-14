import React, { useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import {
  useVoicePlaybackForUri,
  useVoicePlayerControls,
} from '../contexts/VoicePlayerContext';
import { bubbleRadius, colors, typography } from '../theme/colors';
import { withAlpha } from '../theme/stylePrimitives';
import { positionMsForRatio } from '../utils/voiceWaveform';
import { voiceBubbleWidth } from '../utils/mediaBubbleLayout';
import { VoiceWaveform } from './VoiceWaveform';
import {
  formatMediaDuration,
  formatRemainingPlaybackDuration,
} from '../utils/mediaDuration';
import { stopActiveVideoNotePlayback } from './VideoNoteBubble';
import { MessageReactionInline, type InlineReactionItem } from './MessageReactionInline';
import { MessageTimeStatus } from './MessageTimeStatus';
import { AnimatedPlayPauseIcon } from './AnimatedPlayPauseIcon';
import type { MessageSource } from '../stores/types';

/** Throttle waveform bar re-renders to ~8fps while playing (125ms) — imperceptible visually. */
const WAVEFORM_RENDER_THROTTLE_MS = 125;


export interface VoiceBubbleProps {
  uri: string | null;
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
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  source?: MessageSource;
  loading?: boolean;
  /** Идентификатор сообщения: по нему верхняя плашка находит играющее голосовое, даже если адрес файла подменён кэшем. */
  messageKey?: string;
}


function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
    prev.onToggleInlineReaction === next.onToggleInlineReaction &&
    prev.loading === next.loading &&
    prev.messageKey === next.messageKey
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
  style,
  source,
  loading = false,
  messageKey,
}: VoiceBubbleProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { play, pause, seekTo } = useVoicePlayerControls();
  const { isCurrent, isPlaying, progress, remainingMs } = useVoicePlaybackForUri(uri, durationMs);
  /** Пока палец ведёт по дорожке — доля 0..1 под пальцем (для времени рядом). */
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

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
  const durationLabel =
    scrubRatio != null
      ? formatRemainingPlaybackDuration(Math.max(durationMs - positionMsForRatio(scrubRatio, durationMs), 0))
      : shouldShowRemainingDuration
        ? formatRemainingPlaybackDuration(remainingMs)
        : formatMediaDuration(durationMs);

  const handlePress = () => {
    if (!uri || loading) return;
    if (isPlaying) {
      void pause();
      return;
    }

    try {
      stopActiveVideoNotePlayback();
      void play(uri, undefined, messageKey).catch((err) => {
        if (__DEV__) console.warn('[VoiceBubble] playback error:', err, uri);
      });
    } catch (err) {
      if (__DEV__) console.warn('[VoiceBubble] playback error:', err, uri);
    }
  };

  /** Тап по дорожке или конец перетаскивания: перейти в точку (или начать с неё, если это другое голосовое). */
  const handleSeek = (ratio: number) => {
    if (!uri || loading || durationMs <= 0) return;
    const targetPositionMs = positionMsForRatio(clamp01(ratio), durationMs);

    try {
      if (!isCurrent) {
        stopActiveVideoNotePlayback();
        void play(uri, targetPositionMs, messageKey).catch((err) => {
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

  const playedColor = isMe ? outgoingTextColor ?? '#FFFFFF' : '#4A8FF5';
  const unplayedColor = isMe
    ? outgoingTextColor
      ? withAlpha(outgoingTextColor, 0.4)
      : 'rgba(255, 255, 255, 0.4)'
    : '#D2D5DA';

  const hasReactions = !!inlineReactions?.length;
  const metaRight = (
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
          source={source}
        />
      ) : null}
    </View>
  );

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
        // Ширина по длительности (как в Telegram): короткое голосовое — узкий пузырь, а не всегда максимум
        embedded ? null : { width: voiceBubbleWidth(durationMs, screenWidth) },
        style,
      ]}
    >
      {header}
      <View style={styles.mainRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Voice message is loading' : isPlaying ? 'Pause voice message' : 'Play voice message'}
          accessibilityState={{ selected: isPlaying }}
          style={({ pressed }) => [
            styles.playButton,
            isMe ? styles.playButtonMe : styles.playButtonOther,
            pressed && styles.playButtonPressed,
          ]}
          onPress={handlePress}
          hitSlop={8}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color={isMe ? (outgoingAccentColor ?? colors.accent) : '#FFFFFF'}
            />
          ) : (
            <AnimatedPlayPauseIcon
              isPlaying={isPlaying}
              size={18}
              color={isMe ? (outgoingAccentColor ?? colors.accent) : '#FFFFFF'}
            />
          )}
        </Pressable>

        <View style={styles.contentColumn}>
          <VoiceWaveform
            testID="voice-bubble-waveform"
            waveform={waveform}
            seed={uri ?? 'voice-loading'}
            durationMs={durationMs}
            progress={isCurrent ? renderProgress : 0}
            playedColor={playedColor}
            unplayedColor={unplayedColor}
            disabled={!uri || loading}
            onSeek={handleSeek}
            onScrub={setScrubRatio}
          />

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
            {hasReactions ? null : metaRight}
          </View>
        </View>
      </View>

      {hasReactions ? (
        // С реакциями (как в Telegram): внизу в одной строке на всю ширину пузыря — реакции слева, время справа
        <View testID="voice-bubble-reactions-row" style={styles.reactionsRow}>
          <View style={styles.reactionsLeft}>
            <MessageReactionInline
              reactions={inlineReactions ?? []}
              isMe={isMe}
              allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
              onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
              variant="floatingTail"
              tailAlign="start"
              accentColor={reactionAccentColor}
            />
          </View>
          {metaRight}
        </View>
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
    maxWidth: '100%',
    minWidth: 0,
  },
  containerEmbedded: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginVertical: 0,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
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
  reactionsRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reactionsLeft: {
    flexShrink: 1,
    minWidth: 0,
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
