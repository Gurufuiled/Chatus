import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import type { GroupCallParticipant } from '../../contexts/GroupCallContext';
import { withAlpha } from '../../theme/colors';

type ParticipantRowProps = {
  participant: GroupCallParticipant;
};

function buildInitial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

export function ParticipantRow({ participant }: ParticipantRowProps) {
  const { colors } = useTheme();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (participant.isSpeaking) {
      pulse.value = withRepeat(
        withSequence(withTiming(1.04, { duration: 350 }), withTiming(1, { duration: 350 })),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [participant.isSpeaking, pulse]);

  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    borderColor: participant.isSpeaking ? colors.accent : withAlpha(colors.bubbleOtherBorder, 0.6),
  }));

  return (
    <View style={styles.row}>
      <Reanimated.View
        style={[
          styles.avatarFrame,
          frameStyle,
          !participant.avatarUrl ? { backgroundColor: withAlpha(colors.accent, 0.35) } : null,
        ]}
      >
        {participant.avatarUrl ? (
          <Image source={{ uri: participant.avatarUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <Text style={styles.avatarInitial}>{buildInitial(participant.displayName)}</Text>
        )}
      </Reanimated.View>
      <View style={styles.meta}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {participant.isLocal ? 'Вы' : participant.displayName}
        </Text>
        {participant.isMuted ? (
          <Text style={[styles.badge, { color: colors.textSecondary }]}>микрофон выключен</Text>
        ) : participant.isSpeaking ? (
          <Text style={[styles.badge, { color: colors.accent }]}>говорит</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  avatarFrame: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    marginTop: 2,
    fontSize: 13,
  },
});
