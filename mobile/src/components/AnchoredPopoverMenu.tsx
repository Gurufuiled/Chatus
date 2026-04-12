import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Animated, Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export type AnchoredMenuState = {
  top: number;
  left: number;
  width: number;
  height: number;
} | null;

export type AnchoredPopoverMenuItem = {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'] | null;
  color?: string;
};

type AnchoredPopoverMenuProps = {
  menu: AnchoredMenuState;
  animation: Animated.Value;
  items: AnchoredPopoverMenuItem[];
  onClose: () => void;
  onSelect: (key: string) => void;
  width?: number;
  offsetY?: number;
  horizontalAlign?: 'center' | 'start' | 'end';
  verticalAlign?: 'below' | 'above' | 'auto';
};

const MENU_EDGE_GAP = 14;
const DEFAULT_MENU_WIDTH = 236;
const DEFAULT_OFFSET_Y = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AnchoredPopoverMenu({
  menu,
  animation,
  items,
  onClose,
  onSelect,
  width = DEFAULT_MENU_WIDTH,
  offsetY = DEFAULT_OFFSET_Y,
  horizontalAlign = 'center',
  verticalAlign = 'below',
}: AnchoredPopoverMenuProps) {
  if (!menu || items.length === 0) {
    return null;
  }

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const anchorCenterX = menu.left + menu.width / 2;
  const rawLeft =
    horizontalAlign === 'start'
      ? menu.left - 4
      : horizontalAlign === 'end'
        ? menu.left + menu.width - width + 4
        : anchorCenterX - width / 2;
  const cardLeft = clamp(rawLeft, MENU_EDGE_GAP, screenWidth - width - MENU_EDGE_GAP);
  const estimatedCardHeight = items.length * 52 + 18;
  const resolvedVerticalAlign =
    verticalAlign === 'auto'
      ? menu.top + menu.height + offsetY + estimatedCardHeight > screenHeight - MENU_EDGE_GAP
        ? 'above'
        : 'below'
      : verticalAlign;
  const cardTop =
    resolvedVerticalAlign === 'above'
      ? Math.max(MENU_EDGE_GAP, menu.top - estimatedCardHeight - offsetY)
      : menu.top + menu.height + offsetY;
  const arrowLeft = clamp(anchorCenterX - cardLeft - 9, 22, width - 30);

  const backdropOpacity = useMemo(
    () =>
      animation.interpolate({
        // Let the dim layer disappear almost immediately on close
        // while keeping the card itself softly animated.
        inputRange: [0, 0.72, 1],
        outputRange: [0, 0, 1],
      }),
    [animation]
  );

  const cardStyle = useMemo(
    () => ({
      opacity: animation.interpolate({
        inputRange: [0, 0.2, 1],
        outputRange: [0, 0.6, 1],
      }),
      transform: [
        {
          translateY: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [-6, 0],
          }),
        },
        {
          scale: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.985, 1],
          }),
        },
      ],
    }),
    [animation]
  ) as any;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.cardShell,
          {
            width,
            top: cardTop,
            left: cardLeft,
          },
          cardStyle,
        ]}
      >
        {resolvedVerticalAlign === 'above' ? (
          <View style={[styles.arrow, styles.arrowBottom, { left: arrowLeft }]} />
        ) : (
          <View style={[styles.arrow, styles.arrowTop, { left: arrowLeft }]} />
        )}
        <View style={styles.card}>
          <View pointerEvents="none" style={styles.cardTint} />

          {items.map((item, index) => (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => [
                styles.item,
                index < items.length - 1 && styles.itemBorder,
                pressed && styles.itemPressed,
              ]}
            >
              <Text style={[styles.itemLabel, { color: item.color ?? '#111827' }]}>
                {item.label}
              </Text>
              {item.icon ? (
                <Feather name={item.icon as never} size={18} color={item.color ?? '#111827'} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.028)',
  },
  cardShell: {
    position: 'absolute',
  },
  arrow: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 6,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  arrowTop: {
    top: -6,
  },
  arrowBottom: {
    bottom: -6,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.84)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  cardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250,252,255,0.36)',
  },
  item: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemPressed: {
    backgroundColor: 'rgba(77,141,255,0.09)',
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.92)',
  },
  itemLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
});
