import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, withAlpha } from '../theme/colors';

type ForwardHeaderProps = {
  isMe: boolean;
  name?: string | null;
  avatarUri?: string | null;
  /** «Переслано от» */
  labelColor?: string;
  /** Имя отправителя */
  titleColor?: string;
  /** Компактная строка (напр. у видео-кружка слева). */
  compact?: boolean;
  onPress?: (() => void) | undefined;
};

export const ForwardHeader = React.memo(function ForwardHeader({
  isMe,
  name,
  labelColor,
  titleColor,
  compact = false,
  onPress,
}: ForwardHeaderProps) {
  const displayName = name?.trim() || '';
  const resolvedLabel =
    labelColor ??
    (isMe ? 'rgba(255,255,255,0.52)' : withAlpha(colors.accent, 0.72));
  const resolvedTitle =
    titleColor ?? (isMe ? 'rgba(255,255,255,0.94)' : colors.accent);

  const body = (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Feather name="corner-up-right" size={11} color={resolvedLabel} style={styles.labelIcon} />
      <Text style={[styles.labelText, { color: resolvedLabel }]} numberOfLines={1}>
        Переслано от{' '}
        <Text style={[styles.titleText, { color: resolvedTitle }]}>
          {displayName || 'Сообщение'}
        </Text>
      </Text>
    </View>
  );

  if (!onPress) {
    return <View style={[styles.outer, compact && styles.outerCompact]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        displayName ? `Переслано от ${displayName}, открыть профиль` : 'Пересланое сообщение'
      }
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outer,
        compact && styles.outerCompact,
        pressed && styles.outerPressed,
      ]}
    >
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  outer: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: 4,
    paddingRight: 2,
  },
  outerCompact: {
    marginBottom: 0,
  },
  outerPressed: {
    opacity: 0.78,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  rowCompact: {
    gap: 3,
  },
  labelIcon: {
    marginTop: 1,
  },
  labelText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
  },
  titleText: {
    fontWeight: '700',
  },
});
