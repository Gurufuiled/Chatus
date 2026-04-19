import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from './Skeleton';

/**
 * Сетка-заглушка для `InputAttachmentSheet` пока загружается галерея.
 * Совпадает геометрически с реальными ячейками (3 в ряд, квадратные).
 */

export function GallerySkeletonGrid({ rows = 4 }: { rows?: number }) {
  const cells = rows * 3;
  return (
    <View style={styles.grid} pointerEvents="none">
      {Array.from({ length: cells }).map((_, i) => (
        <View key={i} style={styles.cellOuter}>
          <Skeleton width="100%" height="100%" radius={10} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  cellOuter: {
    width: '33.3333%',
    aspectRatio: 1,
    padding: 2,
  },
});
