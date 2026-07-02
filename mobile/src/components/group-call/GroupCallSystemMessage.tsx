import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { withAlpha } from '../../theme/colors';
import type { GroupCallSystemPayload } from '../../utils/groupCallSystemMessage';

type GroupCallSystemMessageProps = {
  payload: GroupCallSystemPayload;
  canJoin: boolean;
  onJoin?: () => void;
};

export function GroupCallSystemMessage({
  payload,
  canJoin,
  onJoin,
}: GroupCallSystemMessageProps) {
  const { colors } = useTheme();

  const durationLine =
    payload.action === 'ended' && payload.duration_minutes
      ? `Длительность: ${payload.duration_minutes} мин`
      : null;

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: withAlpha(colors.accent, 0.08) }]}>
        <Text style={[styles.text, { color: colors.textSecondary }]}>{payload.display}</Text>
        {durationLine ? (
          <Text style={[styles.duration, { color: colors.textSecondary }]}>{durationLine}</Text>
        ) : null}
        {payload.action === 'started' && canJoin && onJoin ? (
          <Pressable
            onPress={onJoin}
            style={({ pressed }) => [
              styles.joinButton,
              { backgroundColor: colors.accent },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.joinText}>Присоединиться</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    maxWidth: '92%',
  },
  text: {
    fontSize: 13,
    textAlign: 'center',
  },
  duration: {
    marginTop: 4,
    fontSize: 12,
    textAlign: 'center',
  },
  joinButton: {
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  joinText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
  },
});
