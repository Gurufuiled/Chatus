import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, withAlpha } from '../theme/colors';

const AVATAR_SIZE = 22;

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

function initialFromName(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

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

  const body = (
    <View style={[styles.column, compact && styles.columnCompact]}>
      <View style={styles.labelRow}>
        <Feather name="corner-up-right" size={11} color={resolvedLabel} style={styles.labelIcon} />
        <Text style={[styles.labelText, { color: resolvedLabel }]} numberOfLines={1}>
          Переслано от
        </Text>
      </View>

      <View style={styles.titleRow}>
        <View style={[styles.avatar, { borderColor: resolvedTitle }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarInitial, { color: resolvedTitle }]}>
              {initialFromName(displayName || '?')}
            </Text>
          )}
        </View>
        <Text style={[styles.titleText, { color: resolvedTitle }]} numberOfLines={2}>
          {displayName || 'Сообщение'}
        </Text>
        {onPress ? (
          <Feather
            name="chevron-right"
            size={12}
            color={resolvedTitle}
            style={styles.chevron}
          />
        ) : null}
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
    marginBottom: 6,
    borderRadius: 12,
    paddingVertical: 2,
    paddingRight: 2,
  },
  outerCompact: {
    marginBottom: 0,
    paddingVertical: 0,
  },
  outerPressed: {
    opacity: 0.78,
  },
  column: {
    gap: 4,
    minWidth: 0,
  },
  columnCompact: {
    gap: 3,
    marginBottom: 0,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  labelIcon: {
    marginTop: 1,
  },
  labelText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    fontSize: 11,
    fontWeight: '800',
  },
  titleText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: -2,
    opacity: 0.85,
  },
});
