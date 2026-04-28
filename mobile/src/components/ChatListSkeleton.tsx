import React, { useMemo } from 'react';
import { View } from 'react-native';

import { CHAT_LIST_AVATAR_SIZE } from '../presentation';
import { useTheme } from '../contexts/ThemeContext';
import { createChatListSkeletonStyles } from './chatListSkeleton.styles';
import { Skeleton, SkeletonCircle } from './Skeleton';

/**
 * Скелетон одной строки чата. Геометрия совпадает с `ChatListRow` — не прыгает
 * макет при переходе ready → real.
 */
function SkeletonRow({
  widthOffset,
  styles,
}: {
  widthOffset: number;
  styles: ReturnType<typeof createChatListSkeletonStyles>;
}) {
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
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createChatListSkeletonStyles(themeColors), [themeColors]);

  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>
          <SkeletonRow widthOffset={((i * 13) % 20) - 10} styles={styles} />
          {i < count - 1 ? <View style={styles.separator} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}
