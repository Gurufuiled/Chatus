import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function formatCommentsLabel(count: number): string {
  if (count <= 0) return 'Комментировать';
  const n = Math.abs(Math.floor(count));
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} комментариев`;
  if (mod10 === 1) return `${n} комментарий`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} комментария`;
  return `${n} комментариев`;
}

export function TelegramChannelCommentsBar({
  replyCount,
  accentColor,
  mutedColor,
  borderColor,
  onPress,
}: {
  replyCount?: number;
  accentColor: string;
  mutedColor: string;
  borderColor: string;
  onPress: () => void;
}) {
  const rc = typeof replyCount === 'number' && Number.isFinite(replyCount) ? replyCount : 0;
  const label = formatCommentsLabel(rc);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.wrap,
        { borderTopColor: borderColor },
        pressed && styles.wrapPressed,
      ]}
    >
      <View style={styles.left}>
        <Feather name="message-circle" size={18} color={accentColor} />
        <Text style={[styles.title, { color: accentColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={mutedColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  wrapPressed: {
    opacity: 0.82,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
});
