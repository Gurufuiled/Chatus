import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { withAlpha } from '../../theme/colors';
import { MessageTimeStatus } from '../MessageTimeStatus';
import type { GroupCallSystemPayload } from '../../utils/groupCallSystemMessage';
import { getGroupCallSystemBubbleBackground } from '../../utils/groupCallSystemMessage';

type GroupCallSystemMessageProps = {
  payload: GroupCallSystemPayload;
  canJoin: boolean;
  onJoin?: () => void;
  time?: string;
  status?: string;
};

export function GroupCallSystemMessage({
  payload,
  canJoin,
  onJoin,
  time,
  status = 'read',
}: GroupCallSystemMessageProps) {
  const { colors } = useTheme();
  const bubbleBackground = getGroupCallSystemBubbleBackground(colors.bubbleOther);

  const durationLine =
    payload.action === 'ended' && payload.duration_minutes
      ? `Длительность: ${payload.duration_minutes} мин`
      : null;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: bubbleBackground,
            borderColor: colors.bubbleOtherBorder,
          },
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: withAlpha(colors.accent, 0.14) }]}>
            <Feather name="phone" size={16} color={colors.accent} />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.text, { color: colors.textPrimary }]}>{payload.display}</Text>
            {durationLine ? (
              <Text style={[styles.duration, { color: colors.textSecondary }]}>{durationLine}</Text>
            ) : null}
          </View>
        </View>

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

        {time ? (
          <View style={styles.metaRow}>
            <MessageTimeStatus
              time={time}
              status={status}
              isMe={false}
              compact
              timeColor={colors.textSecondary}
              iconColor={colors.textSecondary}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    maxWidth: '88%',
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    minWidth: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontSize: 14,
    lineHeight: 18,
  },
  duration: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 16,
  },
  joinButton: {
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  joinText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  metaRow: {
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.9,
  },
});
