import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Skeleton } from './Skeleton';

/**
 * Сетка-заглушка для `InputAttachmentSheet` пока загружается галерея.
 * Совпадает геометрически с реальными ячейками (3 в ряд, квадратные).
 * Размер ячейки считаем числом от ширины окна: `aspectRatio` + проценты в
 * `flexWrap` давали «сплющенные» плашки, а `Skeleton` по умолчанию height=14.
 */

const COLUMNS = 3;
const H_PADDING = 8;
const CELL_GAP = 4;

export function GallerySkeletonGrid({ rows = 4 }: { rows?: number }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - H_PADDING * 2 - CELL_GAP * (COLUMNS - 1)) / COLUMNS);
  const cells = rows * COLUMNS;
  return (
    <View style={styles.grid} pointerEvents="none">
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton
          key={i}
          width={cell}
          height={cell}
          radius={10}
          baseColor={colors.placeholderBg}
          highlightColor={colors.inputBackgroundSolid}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
  },
});
