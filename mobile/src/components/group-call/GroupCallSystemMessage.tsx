import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { withAlpha } from '../../theme/colors';
import { MessageTimeStatus } from '../MessageTimeStatus';
import type { MessageSource } from '../../stores/types';
import type { GroupCallSystemPayload } from '../../utils/groupCallSystemMessage';

type GroupCallSystemMessageProps = {
  payload: GroupCallSystemPayload;
  canJoin: boolean;
  onJoin?: () => void;
  time?: string;
  status?: string;
  isMe?: boolean;
  source?: MessageSource;
};

export function GroupCallSystemMessage({
  payload,
  canJoin,
  onJoin,
  time,
  status,
  isMe = true,
  source,
}: GroupCallSystemMessageProps) {
  const { colors } = useTheme();

  const durationLine =
    payload.action === 'ended' && payload.duration_minutes
      ? `Длительность: ${payload.duration_minutes} мин`
      : null;

  return (
    <View style={[styles.wrap, isMe ? styles.wrapMe : styles.wrapOther]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.bubbleOther,
            borderColor: withAlpha(colors.bubbleOtherBorder, 0.7),
          },
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: withAlpha(colors.accent, 0.18) }]}>
            <Feather name="phone" size={16} color={colors.accent} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.text, { color: colors.textPrimary }]}>{payload.display}</Text>
            {durationLine ? (
              <Text style={[styles.duration, { color: colors.accent }]}>{durationLine}</Text>
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
        {time ? (
          <View style={styles.meta}>
            <MessageTimeStatus
              time={time}
              status={status ?? 'sent'}
              isMe={isMe}
              compact
              source={source}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    width: '100%',
  },
  wrapMe: {
    alignItems: 'flex-end',
  },
  wrapOther: {
    alignItems: 'flex-start',
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    maxWidth: '86%',
    minWidth: 210,
    borderWidth: StyleSheet.hairlineWidth,
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
  body: {
    flexShrink: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  duration: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
  },
  joinButton: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  joinText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.9,
  },
});
