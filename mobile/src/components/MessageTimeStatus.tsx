import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, typography } from '../theme/colors';
import Feather from '@expo/vector-icons/Feather';
import { PlatformSourceIcon } from './PlatformSourceIcon';
import type { MessageSource } from '../stores/types';

interface MessageTimeStatusProps {
  time: string;
  status: string;
  isMe: boolean;
  compact?: boolean;
  timeColor?: string;
  iconColor?: string;
  viewCount?: string;
  source?: MessageSource;
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

function SendingClockIcon({
  compact = false,
  color,
}: {
  compact?: boolean;
  color: string;
}) {
  const size = compact ? 10 : 11;
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Circle cx="6" cy="6" r="4.75" stroke={color} strokeWidth="1.35" />
      <Path
        d="M6 3.35V6.15L7.85 7.25"
        stroke={color}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
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

  return (
    <View style={[styles.statusSlot, compact && styles.statusSlotCompact]}>
      {status === 'read' ? (
        <DoubleCheckIcon compact={compact} color={resolvedIconColor} />
      ) : status === 'sent' || status === 'delivered' ? (
        <SingleCheckIcon compact={compact} color={resolvedIconColor} />
      ) : status === 'failed' ? (
        <Feather
          name="alert-circle"
          size={compact ? 10 : 11}
          color={resolvedIconColor}
        />
      ) : (
        <SendingClockIcon compact={compact} color={resolvedIconColor} />
      )}
    </View>
  );
}

export function MessageTimeStatus({
  time,
  status,
  isMe,
  compact = false,
  timeColor,
  iconColor,
  viewCount,
  source,
}: MessageTimeStatusProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {source === 'telegram' ? (
        <PlatformSourceIcon source={source} size={compact ? 10 : 12} />
      ) : null}
      {viewCount ? (
        <View style={styles.viewCountWrap}>
          <Feather name="eye" size={compact ? 11 : 12} color={timeColor || colors.textSecondary} />
          <Text
            style={[
              styles.time,
              isMe && styles.timeMe,
              compact && styles.timeCompact,
              timeColor ? { color: timeColor } : null,
              { marginLeft: 2, marginRight: 4 },
            ]}
          >
            {viewCount}
          </Text>
        </View>
      ) : null}
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
  viewCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  containerCompact: {
    marginTop: 0,
    gap: 2,
  },
  time: {
    fontSize: typography.timeStatus,
    lineHeight: typography.timeStatus + 2,
    color: colors.textSecondary,
  },
  timeCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
  timeMe: {
    color: colors.textSecondaryMuted,
  },
  statusSlot: {
    width: 16,
    height: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusSlotCompact: {
    width: 14,
    height: 10,
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
