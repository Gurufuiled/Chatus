import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/colors';

/** Unicode icons for message status. */
const STATUS_ICONS: Record<string, string> = {
  sending: '\u23F1', // ⏱ (stopwatch)
  sent: '\u2713', // ✓
  delivered: '\u2713\u2713', // ✓✓
  read: '\u2713\u2713', // ✓✓
  failed: '\u26A0', // ⚠
};

interface MessageTimeStatusProps {
  time: string;
  status: string;
  isMe: boolean;
  compact?: boolean;
  timeColor?: string;
  iconColor?: string;
}

/**
 * Renders time and optional status icon at bottom-right of a message bubble.
 * For "my" messages (isMe): shows time + status icon (e.g. "10:30 ✓").
 * For "other" messages: shows only time.
 */
export function MessageTimeStatus({
  time,
  status,
  isMe,
  compact = false,
  timeColor,
  iconColor,
}: MessageTimeStatusProps) {
  const icon = isMe ? STATUS_ICONS[status] ?? STATUS_ICONS.sending : null;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Text
        style={[
          styles.time,
          isMe && styles.timeMe,
          compact && styles.timeCompact,
          timeColor ? { color: timeColor } : null,
        ]}
      >
        {time}
      </Text>
      {icon != null && (
        <Text
          style={[
            styles.icon,
            isMe && styles.iconMe,
            compact && styles.iconCompact,
            iconColor ? { color: iconColor } : null,
          ]}
        >
          {icon}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 4,
    gap: 4,
    flexShrink: 0,
  },
  containerCompact: {
    marginTop: 0,
    gap: 3,
  },
  time: {
    fontSize: typography.timeStatus,
    color: colors.textSecondary,
  },
  timeCompact: {
    fontSize: 11,
  },
  timeMe: {
    color: colors.textSecondaryMuted,
  },
  icon: {
    fontSize: typography.timeStatus,
    color: colors.textSecondary,
  },
  iconCompact: {
    fontSize: 11,
  },
  iconMe: {
    color: colors.textSecondaryMuted,
  },
});
