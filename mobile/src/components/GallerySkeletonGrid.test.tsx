import React from 'react';
import { Dimensions } from 'react-native';
import { render } from '@testing-library/react-native';
import { GallerySkeletonGrid } from './GallerySkeletonGrid';
import { Skeleton } from './Skeleton';
import { getPaletteForScheme } from '../theme/palettes';

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../theme/palettes').getPaletteForScheme('light') }),
}));

describe('GallerySkeletonGrid', () => {
  // бесконечные анимации (мерцание/пульс) не должны тикать во время теста
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('рисует rows × 3 ячеек', () => {
    expect(getPaletteForScheme('light')).toBeTruthy();
    const { UNSAFE_getAllByType } = render(<GallerySkeletonGrid rows={4} />);
    expect(UNSAFE_getAllByType(Skeleton)).toHaveLength(12);
  });

  it('ячейки квадратные (раньше height=14 «сплющивал» плашки)', () => {
    const { UNSAFE_getAllByType } = render(<GallerySkeletonGrid rows={2} />);
    const cells = UNSAFE_getAllByType(Skeleton);
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      const { width, height } = cell.props;
      expect(typeof width).toBe('number');
      expect(height).toBe(width);
      expect(width).toBeGreaterThan(40);
    }
  });

  it('три колонки помещаются в ширину окна', () => {
    const { width: windowWidth } = Dimensions.get('window');
    const { UNSAFE_getAllByType } = render(<GallerySkeletonGrid rows={1} />);
    const total = UNSAFE_getAllByType(Skeleton).reduce(
      (sum, cell) => sum + (cell.props.width as number),
      0,
    );
    expect(total).toBeLessThanOrEqual(windowWidth);
  });
});
