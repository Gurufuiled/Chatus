import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TelegramGlyph, TELEGRAM_CALL_GLYPHS } from '../../icons/telegram';
import { useTheme } from '../../contexts/ThemeContext';
import { withAlpha } from '../../theme/stylePrimitives';
import type { GroupCallSystemPayload } from '../../utils/groupCallSystemMessage';
import { MessageTimeStatus } from '../MessageTimeStatus';

type GroupCallSystemMessageProps = {
  payload: GroupCallSystemPayload;
  canJoin: boolean;
  onJoin?: () => void;
  time: string;
  status: string;
  isMe: boolean;
};

export function GroupCallSystemMessage({
  payload,
  canJoin,
  onJoin,
  time,
  status,
  isMe,
}: GroupCallSystemMessageProps) {
  const { colors, resolvedScheme } = useTheme();

  const durationLine =
    payload.action === 'ended' && payload.duration_minutes
      ? `Длительность: ${payload.duration_minutes} мин`
      : null;

  const cardStyle = useMemo(
    () => ({
      backgroundColor:
        resolvedScheme === 'dark'
          ? withAlpha('#000000', 0.42)
          : withAlpha(colors.inputBackgroundSolid, 0.96),
      borderColor: withAlpha(colors.bubbleOtherBorder, resolvedScheme === 'dark' ? 0.35 : 0.9),
      shadowColor: resolvedScheme === 'dark' ? '#000000' : '#8A96A8',
    }),
    [colors.bubbleOtherBorder, colors.inputBackgroundSolid, resolvedScheme],
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, cardStyle]}>
        <View style={styles.contentRow}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: withAlpha(colors.accent, resolvedScheme === 'dark' ? 0.28 : 0.14) },
            ]}
          >
            <TelegramGlyph
              d={TELEGRAM_CALL_GLYPHS.phone.d}
              fillRule={TELEGRAM_CALL_GLYPHS.phone.fillRule}
              viewBox={TELEGRAM_CALL_GLYPHS.phone.viewBox}
              size={16}
              color={colors.accent}
            />
          </View>
          <View style={styles.textColumn}>
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
        <View style={styles.timeRow}>
          <MessageTimeStatus
            time={time}
            status={status}
            isMe={isMe}
            compact
            timeColor={colors.textSecondary}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '88%',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flexShrink: 1,
    minWidth: 0,
  },
  text: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  duration: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
  },
  joinButton: {
    marginTop: 10,
    alignSelf: 'center',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  joinText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  timeRow: {
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.9,
  },
});
