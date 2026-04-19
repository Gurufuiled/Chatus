import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Skeleton } from './Skeleton';

/**
 * Skeleton «облаков» сообщений. Чередующиеся входящие/исходящие бабблы разной
 * ширины — похоже на реальный поток текстов, чтобы при ready → real не было
 * layout-скачков.
 */

type BubbleSpec = {
  isMe: boolean;
  width: number;
  lines?: number;
};

const DEFAULT_SPECS: BubbleSpec[] = [
  { isMe: false, width: 180, lines: 2 },
  { isMe: true, width: 140, lines: 1 },
  { isMe: false, width: 240, lines: 3 },
  { isMe: true, width: 92, lines: 1 },
  { isMe: false, width: 210, lines: 2 },
  { isMe: true, width: 170, lines: 2 },
  { isMe: false, width: 110, lines: 1 },
  { isMe: true, width: 230, lines: 3 },
];

function SkeletonBubble({ spec }: { spec: BubbleSpec }) {
  const lines = spec.lines ?? 1;
  const bubbleStyle: StyleProp<ViewStyle> = [
    styles.bubble,
    spec.isMe ? styles.bubbleMe : styles.bubbleOther,
    { width: spec.width },
  ];

  return (
    <View style={[styles.row, spec.isMe ? styles.rowMe : styles.rowOther]}>
      <View style={bubbleStyle}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            height={10}
            width={i === lines - 1 ? '70%' : '100%'}
            radius={5}
            style={i === 0 ? undefined : styles.lineGap}
          />
        ))}
      </View>
    </View>
  );
}

export function ChatMessagesSkeleton({
  style,
  topPadding = 24,
}: {
  style?: StyleProp<ViewStyle>;
  topPadding?: number;
}) {
  return (
    <View pointerEvents="none" style={[styles.container, { paddingTop: topPadding }, style]}>
      {DEFAULT_SPECS.map((spec, i) => (
        <SkeletonBubble key={i} spec={spec} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 10,
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
  },
  rowMe: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '82%',
  },
  bubbleMe: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  lineGap: {
    marginTop: 6,
  },
});
