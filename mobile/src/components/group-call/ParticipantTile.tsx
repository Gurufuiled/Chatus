import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { TelegramGlyph, TELEGRAM_CALL_GLYPHS } from '../../icons/telegram';
import { useTheme } from '../../contexts/ThemeContext';
import type { GroupCallParticipant } from '../../contexts/GroupCallContext';
import { withAlpha } from '../../theme/colors';

export const TILE_BORDER_RADIUS = 16;
export const TILE_ASPECT_RATIO = 4 / 5;

const SPEAKING_SCALE = 1.1;
const DOMINANT_SCALE = 1.13;
const SPEAKING_PULSE_DELTA = 0.02;
const DOMINANT_PULSE_DELTA = 0.02;

type ParticipantTileProps = {
  participant: GroupCallParticipant;
  width: number;
  /** True when this participant is the sole active speaker in the call. */
  isDominantSpeaker?: boolean;
  /** Reserved for future LiveKit VideoView integration. */
  videoSlot?: React.ReactNode;
};

function buildInitial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

export function ParticipantTile({
  participant,
  width,
  isDominantSpeaker = false,
  videoSlot,
}: ParticipantTileProps) {
  const { colors } = useTheme();
  const pulse = useSharedValue(1);
  const height = width / TILE_ASPECT_RATIO;
  const isSpeaking = participant.isSpeaking;
  const isHighlighted = isSpeaking || isDominantSpeaker;

  useEffect(() => {
    if (isDominantSpeaker) {
      const peak = DOMINANT_SCALE + DOMINANT_PULSE_DELTA;
      pulse.value = withRepeat(
        withSequence(
          withTiming(peak, { duration: 320 }),
          withTiming(DOMINANT_SCALE, { duration: 320 }),
        ),
        -1,
        true,
      );
    } else if (isSpeaking) {
      const peak = SPEAKING_SCALE + SPEAKING_PULSE_DELTA;
      pulse.value = withRepeat(
        withSequence(
          withTiming(peak, { duration: 350 }),
          withTiming(SPEAKING_SCALE, { duration: 350 }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [isDominantSpeaker, isSpeaking]);

  const borderColor = useMemo(() => {
    if (isDominantSpeaker) return colors.accent;
    if (isSpeaking) return colors.accent;
    return withAlpha('#ffffff', 0.12);
  }, [colors.accent, isDominantSpeaker, isSpeaking]);

  const accentTintBg = useMemo(() => withAlpha(colors.accent, 0.35), [colors.accent]);
  const muteBadgeBg = useMemo(() => withAlpha('#000000', 0.55), []);
  const speakingGlowColor = useMemo(
    () => withAlpha(colors.accent, isDominantSpeaker ? 0.55 : 0.4),
    [colors.accent, isDominantSpeaker],
  );

  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const borderWidth = isDominantSpeaker ? 4 : isSpeaking ? 3 : 1;
  const glowRadius = isDominantSpeaker ? 14 : 10;
  const glowElevation = isDominantSpeaker ? 10 : 7;

  const displayName = participant.isLocal ? 'Вы' : participant.displayName;

  return (
    <Reanimated.View
      accessibilityLabel={
        participant.isMuted
          ? `${displayName}, микрофон выключен`
          : isDominantSpeaker
            ? `${displayName}, говорит`
            : isSpeaking
              ? `${displayName}, говорит`
              : displayName
      }
      accessibilityState={{ selected: isHighlighted }}
      style={[
        styles.frame,
        { width, height },
        isHighlighted
          ? {
              shadowColor: speakingGlowColor,
              shadowOpacity: 0.9,
              shadowRadius: glowRadius,
              shadowOffset: { width: 0, height: 0 },
              elevation: glowElevation,
            }
          : null,
        frameStyle,
      ]}
    >
      <View
        style={[
          styles.tile,
          { borderColor, borderWidth },
        ]}
      >
        {videoSlot ?? (
          <View style={styles.mediaSlot}>
            {participant.avatarUrl ? (
              <Image
                source={{ uri: participant.avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.initialFallback, { backgroundColor: accentTintBg }]}>
                <Text style={styles.initialText}>{buildInitial(participant.displayName)}</Text>
              </View>
            )}
          </View>
        )}

        <LinearGradient
          colors={['transparent', withAlpha('#000000', 0.72)]}
          style={styles.nameGradient}
          pointerEvents="none"
        />

        <View style={styles.nameRow} pointerEvents="none">
          <Text style={styles.nameText} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        {participant.isMuted ? (
          <View style={[styles.muteBadge, { backgroundColor: muteBadgeBg }]}>
            <TelegramGlyph
              d={TELEGRAM_CALL_GLYPHS.unmute.d}
              fillRule={TELEGRAM_CALL_GLYPHS.unmute.fillRule}
              viewBox={TELEGRAM_CALL_GLYPHS.unmute.viewBox}
              size={18}
              color="#fff"
            />
          </View>
        ) : null}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    width: '100%',
    height: '100%',
    borderRadius: TILE_BORDER_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#1A1F26',
  },
  mediaSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  initialFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
  },
  nameGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
  },
  nameRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 20,
  },
  nameText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  muteBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
