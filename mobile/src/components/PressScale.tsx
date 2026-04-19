import React from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Тонкая обёртка над Pressable: на press-in сжимает содержимое до `pressedScale`,
 * на press-out возвращает обратно spring-анимацией. Обслуживает «тактильное»
 * ощущение кнопок/карточек без видимого лаггинга.
 *
 * Не ломает accessibility — все пропы Pressable пробрасываются.
 */

type PressScaleProps = PressableProps & {
  children: React.ReactNode;
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
  /** Фон при press-in, опционально. */
  pressedBackground?: string;
};

export function PressScale({
  children,
  pressedScale = 0.97,
  pressedBackground,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressScaleProps) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const bgOpacity = React.useRef(new Animated.Value(0)).current;

  const handlePressIn: PressableProps['onPressIn'] = (e) => {
    Animated.spring(scale, {
      toValue: pressedScale,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
    if (pressedBackground) {
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }).start();
    }
    onPressIn?.(e);
  };

  const handlePressOut: PressableProps['onPressOut'] = (e) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
    if (pressedBackground) {
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start();
    }
    onPressOut?.(e);
  };

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {pressedBackground ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: pressedBackground,
              opacity: bgOpacity,
              borderRadius: 14,
            }}
          />
        ) : null}
        {children}
      </Animated.View>
    </Pressable>
  );
}
