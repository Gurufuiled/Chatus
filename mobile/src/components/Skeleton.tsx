import React from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';

/**
 * Лёгкий skeleton-примитив. Один «живой» Animated.Value на компонент,
 * 1100 мс цикл — достаточно плавно, не перегружает фрейм.
 *
 * Специально без `react-native-reanimated`: skeleton должен работать
 * до инициализации UI-треда и в бэкграунд-экранах без лишних затрат.
 */

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Для уменьшения ре-рендеров в больших списках можно отключить анимацию. */
  animated?: boolean;
  /** Кастомные цвета (например под тёмную галерею). По умолчанию светлая сетка. */
  baseColor?: string;
  highlightColor?: string;
};

const BASE_COLOR = '#E6E8EC';
const HIGHLIGHT_COLOR = '#F2F3F6';

export function Skeleton({
  width,
  height = 14,
  radius = 8,
  style,
  animated = true,
  baseColor,
  highlightColor,
}: SkeletonProps) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const base = baseColor ?? BASE_COLOR;
  const hi = highlightColor ?? HIGHLIGHT_COLOR;

  React.useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, progress]);

  const backgroundColor = animated
    ? progress.interpolate({
        inputRange: [0, 1],
        outputRange: [base, hi],
      })
    : base;

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: backgroundColor as unknown as string,
        },
        style,
      ]}
    />
  );
}

/** Кольцо-аватар скелетон. */
export function SkeletonCircle({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton width={size} height={size} radius={size / 2} style={style} />;
}

/** Прямоугольник-блок (для медиа-плиток). */
export function SkeletonBlock({
  width,
  height,
  radius = 10,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Skeleton width={width} height={height} radius={radius} style={style} />;
}

/** Готовая обёртка — несколько одинаковых skeleton-строк. */
export function SkeletonRows({
  count,
  spacing = 8,
  rowHeight = 12,
  lastShorter = true,
  style,
}: {
  count: number;
  spacing?: number;
  rowHeight?: number;
  lastShorter?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.col, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          height={rowHeight}
          width={lastShorter && i === count - 1 ? '62%' : '100%'}
          style={{ marginTop: i === 0 ? 0 : spacing }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flexDirection: 'column' },
});
