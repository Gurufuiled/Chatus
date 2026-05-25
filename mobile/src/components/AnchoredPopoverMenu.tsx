import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import type { ImageSourcePropType } from 'react-native';
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { ResolvedColorScheme, ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

export type AnchoredMenuState = {
  top: number;
  left: number;
  width: number;
  height: number;
} | null;

type AnchoredMenuAnchor = NonNullable<AnchoredMenuState>;

export type AnchoredPopoverMenuItem = {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'] | null;
  /** When set, shown instead of the Feather icon (e.g. bundled PNG). */
  iconImage?: ImageSourcePropType;
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
  /** Replaces the list of items (same card shell). Used for in-place “step 2” flows. */
  customBody?: React.ReactNode | null;
  /** Vertical size hint for positioning when `customBody` is set. */
  customBodyEstimatedHeight?: number;
};

const MENU_EDGE_GAP = 14;
const DEFAULT_MENU_WIDTH = 236;
const DEFAULT_OFFSET_Y = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createAnchoredMenuStyles(c: ThemeColors, scheme: ResolvedColorScheme) {
  const shadow = withAlpha('#000000', scheme === 'dark' ? 0.45 : 0.12);
  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 50,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: scheme === 'dark' ? withAlpha('#000000', 0.4) : withAlpha('#0F172A', 0.06),
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
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      ...Platform.select({
        ios: {
          shadowColor: shadow,
          shadowOpacity: 0.2,
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
      backgroundColor: c.inputBackgroundSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      ...Platform.select({
        ios: {
          shadowColor: shadow,
          shadowOpacity: scheme === 'dark' ? 0.35 : 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        },
        default: {},
      }),
    },
    cardTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: scheme === 'dark' ? withAlpha('#FFFFFF', 0.03) : withAlpha('#FFFFFF', 0.06),
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
      backgroundColor: c.rowPressed,
    },
    itemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    itemLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
    },
  });
}

type AnchoredPopoverMenuContentProps = Omit<AnchoredPopoverMenuProps, 'menu'> & {
  menu: AnchoredMenuAnchor;
};

function AnchoredPopoverMenuContent({
  menu,
  animation,
  items,
  onClose,
  onSelect,
  width = DEFAULT_MENU_WIDTH,
  offsetY = DEFAULT_OFFSET_Y,
  horizontalAlign = 'center',
  verticalAlign = 'below',
  customBody = null,
  customBodyEstimatedHeight = 260,
}: AnchoredPopoverMenuContentProps) {
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(
    () => createAnchoredMenuStyles(colors, resolvedScheme),
    [colors, resolvedScheme],
  );

  const backdropOpacity = useMemo(
    () =>
      animation.interpolate({
        inputRange: [0, 0.72, 1],
        outputRange: [0, 0, 1],
      }),
    [animation],
  );

  const cardStyle = useMemo(
    () => ({
      opacity: animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          translateY: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [-18, 0],
          }),
        },
        {
          scale: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.88, 1],
          }),
        },
      ],
      ...Platform.select({
        android: {
          elevation: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [0, resolvedScheme === 'dark' ? 8 : 2],
          }),
        },
        default: {},
      }),
    }),
    [animation, resolvedScheme],
  ) as any;

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
  const estimatedCardHeight =
    customBody != null ? customBodyEstimatedHeight + 18 : items.length * 52 + 18;
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
        {customBody == null ? (
          resolvedVerticalAlign === 'above' ? (
            <View style={[styles.arrow, styles.arrowBottom, { left: arrowLeft }]} />
          ) : (
            <View style={[styles.arrow, styles.arrowTop, { left: arrowLeft }]} />
          )
        ) : null}
        <View style={styles.card}>
          <View pointerEvents="none" style={styles.cardTint} />

          {customBody != null ? (
            customBody
          ) : (
            items.map((item, index) => (
              <Pressable
                key={item.key}
                onPress={() => onSelect(item.key)}
                style={({ pressed }) => [
                  styles.item,
                  index < items.length - 1 && styles.itemBorder,
                  pressed && styles.itemPressed,
                ]}
              >
                <Text style={[styles.itemLabel, { color: item.color ?? colors.textPrimary }]}>
                  {item.label}
                </Text>
                {item.iconImage ? (
                  <Image
                    source={item.iconImage}
                    style={{ width: 20, height: 20, tintColor: item.color ?? colors.textPrimary }}
                    resizeMode="contain"
                  />
                ) : item.icon ? (
                  <Feather name={item.icon as never} size={18} color={item.color ?? colors.textPrimary} />
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export function AnchoredPopoverMenu(props: AnchoredPopoverMenuProps) {
  const { menu, items, customBody } = props;
  if (!menu || (items.length === 0 && customBody == null)) {
    return null;
  }
  return <AnchoredPopoverMenuContent {...props} menu={menu} />;
}
