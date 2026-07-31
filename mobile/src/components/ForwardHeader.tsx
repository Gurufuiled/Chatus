import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
  avatarUri,
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
  const avatarSize = compact ? 14 : 16;
  const initial = (displayName[0] || '?').toUpperCase();
  const avatar = avatarUri?.trim() ? (
    <Image
      source={{ uri: avatarUri.trim() }}
      style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  ) : (
    <View
      style={[
        styles.avatarFallback,
        {
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          backgroundColor: isMe ? 'rgba(255,255,255,0.22)' : resolvedTitle,
        },
      ]}
    >
      <Text style={[styles.avatarInitial, compact && styles.avatarInitialCompact]}>
        {initial}
      </Text>
    </View>
  );

  const body = (
    <View style={styles.content}>
      <Text
        style={[
          styles.labelText,
          compact && styles.labelTextCompact,
          { color: resolvedLabel },
        ]}
        numberOfLines={1}
      >
        Переслано от
      </Text>
      <View style={[styles.row, compact && styles.rowCompact]}>
        {avatar}
        <Text
          style={[
            styles.titleText,
            compact && styles.titleTextCompact,
            { color: resolvedTitle },
          ]}
          numberOfLines={1}
        >
          {displayName || 'Сообщение'}
        </Text>
      </View>
    </View>
  );

  if (!onPress) {
    return <View style={[styles.outer, compact && styles.outerCompact]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        displayName ? `Переслано от ${displayName}, открыть профиль` : 'Пересланное сообщение'
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
    marginTop: 1,
    marginBottom: 6,
    paddingTop: 1,
    paddingRight: 2,
  },
  outerCompact: {
    marginBottom: 2,
  },
  outerPressed: {
    opacity: 0.78,
  },
  content: {
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
    marginTop: 1,
  },
  rowCompact: {
    gap: 4,
  },
  labelText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  labelTextCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  titleText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  titleTextCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
  },
  avatarInitialCompact: {
    fontSize: 8,
    lineHeight: 9,
  },
});
