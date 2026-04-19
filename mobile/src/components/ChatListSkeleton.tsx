import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  CHAT_LIST_AVATAR_GAP,
  CHAT_LIST_AVATAR_SIZE,
  CHAT_LIST_HORIZONTAL_PADDING,
  CHAT_LIST_SEPARATOR_INSET,
} from '../presentation';
import { colors } from '../theme/colors';
import { Skeleton, SkeletonCircle } from './Skeleton';

/**
 * Скелетон одной строки чата. Геометрия совпадает с `ChatListRow` — не прыгает
 * макет при переходе ready → real.
 */
function SkeletonRow({ widthOffset }: { widthOffset: number }) {
  const titleWidth = `${62 + widthOffset}%` as const;
  const previewWidth = `${48 + widthOffset}%` as const;

  return (
    <View style={styles.row}>
      <SkeletonCircle size={CHAT_LIST_AVATAR_SIZE} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Skeleton width={titleWidth} height={14} radius={7} />
          <Skeleton width={36} height={10} radius={5} />
        </View>
        <View style={styles.bottomRow}>
          <Skeleton width={previewWidth} height={12} radius={6} />
        </View>
      </View>
    </View>
  );
}

export function ChatListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>
          <SkeletonRow widthOffset={((i * 13) % 20) - 10} />
          {i < count - 1 ? <View style={styles.separator} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.inputBackgroundSolid,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    paddingHorizontal: CHAT_LIST_HORIZONTAL_PADDING,
    paddingVertical: 10,
    backgroundColor: colors.inputBackgroundSolid,
  },
  content: {
    flex: 1,
    marginLeft: CHAT_LIST_AVATAR_GAP,
    justifyContent: 'center',
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: CHAT_LIST_SEPARATOR_INSET,
    backgroundColor: colors.separator,
  },
});
