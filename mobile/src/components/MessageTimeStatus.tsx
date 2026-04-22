import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, typography } from '../theme/colors';

const STATUS_TEXT_ICONS: Record<string, string> = {
  sending: '\u23F1',
  failed: '\u26A0',
};

interface MessageTimeStatusProps {
  time: string;
  status: string;
  isMe: boolean;
  compact?: boolean;
  timeColor?: string;
  iconColor?: string;
}

interface MessageStatusIconProps {
  status: string;
  isMe: boolean;
  compact?: boolean;
  iconColor?: string;
}

function getResolvedIconColor(isMe: boolean, iconColor?: string) {
  /** Не форсим colors.accent для read: он совпадает с bubbleMe на теме по умолчанию — галочки пропадают. */
  return iconColor ?? (isMe ? colors.textSecondaryMuted : colors.textSecondary);
}

function DoubleCheckIcon({
  compact = false,
  color,
}: {
  compact?: boolean;
  color: string;
}) {
  const width = compact ? 14 : 16;
  const height = compact ? 9 : 10;
  const strokeWidth = compact ? 1.8 : 2;
  const checkWidth = compact ? 9 : 10;
  const checkHeight = compact ? 8 : 9;
  const slashWidth = compact ? 6 : 7;
  const slashHeight = compact ? 7 : 8;

  return (
    <View style={[styles.doubleCheckWrap, compact && styles.doubleCheckWrapCompact]}>
      <View style={[styles.doubleCheckLayer, { width, height }]}>
        <View
          style={[
            styles.doubleCheckSlash,
            compact ? styles.doubleCheckSlashCompact : styles.doubleCheckSlashRegular,
          ]}
        >
          <Svg width={slashWidth} height={slashHeight} viewBox="0 0 7 8" fill="none">
            <Path
              d="M0.7 7.35L6.45 1.55"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
        <View
          style={[
            styles.doubleCheckCheck,
            compact ? styles.doubleCheckCheckCompact : styles.doubleCheckCheckRegular,
          ]}
        >
          <Svg width={checkWidth} height={checkHeight} viewBox="0 0 10 9" fill="none">
            <Path
              d="M1.15 4.95L3.75 7.35L9.45 1.75"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </View>
    </View>
  );
}

function SingleCheckIcon({
  compact = false,
  color,
}: {
  compact?: boolean;
  color: string;
}) {
  const width = compact ? 10 : 11;
  const height = compact ? 8 : 9;
  const strokeWidth = compact ? 1.85 : 2.05;

  return (
    <View style={styles.singleCheckWrap}>
      <Svg width={width} height={height} viewBox="0 0 11 9" fill="none">
        <Path
          d="M1.15 4.95L3.75 7.35L9.45 1.75"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export function MessageStatusIcon({
  status,
  isMe,
  compact = false,
  iconColor,
}: MessageStatusIconProps) {
  if (!isMe) return null;

  const resolvedIconColor = getResolvedIconColor(isMe, iconColor);

  if (status === 'delivered' || status === 'read') {
    return <DoubleCheckIcon compact={compact} color={resolvedIconColor} />;
  }

  if (status === 'sent') {
    return <SingleCheckIcon compact={compact} color={resolvedIconColor} />;
  }

  const icon = STATUS_TEXT_ICONS[status] ?? STATUS_TEXT_ICONS.sending;
  return (
    <Text
      style={[
        styles.icon,
        compact && styles.iconCompact,
        { color: resolvedIconColor },
      ]}
    >
      {icon}
    </Text>
  );
}

export function MessageTimeStatus({
  time,
  status,
  isMe,
  compact = false,
  timeColor,
  iconColor,
}: MessageTimeStatusProps) {
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
      <MessageStatusIcon
        status={status}
        isMe={isMe}
        compact={compact}
        iconColor={iconColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 4,
    gap: 3,
    flexShrink: 0,
  },
  containerCompact: {
    marginTop: 0,
    gap: 2,
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
    includeFontPadding: false,
    lineHeight: typography.timeStatus + 1,
  },
  iconCompact: {
    fontSize: 11,
    lineHeight: 11,
  },
  singleCheckWrap: {
    marginBottom: 0.5,
  },
  doubleCheckWrap: {
    marginBottom: 0.5,
  },
  doubleCheckWrapCompact: {
    marginBottom: 0,
  },
  doubleCheckLayer: {
    position: 'relative',
  },
  doubleCheckSlash: {
    position: 'absolute',
  },
  doubleCheckSlashCompact: {
    top: 1,
    left: 8,
  },
  doubleCheckSlashRegular: {
    top: 1,
    left: 9,
  },
  doubleCheckCheck: {
    position: 'absolute',
  },
  doubleCheckCheckCompact: {
    top: 1,
    left: 0,
  },
  doubleCheckCheckRegular: {
    top: 2,
    left: 0,
  },
});
