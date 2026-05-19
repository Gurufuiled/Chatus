import React, { useCallback, useMemo } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Props = {
  navigation: NavigationProp<ParamListBase>;
  gestureEnabled: boolean;
  children: React.ReactNode;
};

/**
 * Telegram-style interactive pop: drag the whole chat layer to the right, then go back.
 * On iOS, native-stack fullScreenGesture handles this; this shell is Android-only so it
 * does not compete with the system gesture.
 */
export function InteractiveChatBackShell({ navigation, gestureEnabled, children }: Props) {
  const translateX = useSharedValue(0);

  const goBackSafe = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      translateX.value = 0;
    }, [translateX]),
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(gestureEnabled)
        .activeOffsetX(18)
        .failOffsetY([-22, 22])
        .onUpdate((e) => {
          const x = Math.max(0, e.translationX);
          translateX.value = Math.min(x, SCREEN_WIDTH);
        })
        .onEnd((e) => {
          const dismiss = translateX.value > SCREEN_WIDTH * 0.2 || e.velocityX > 900;
          if (dismiss) {
            translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, (finished) => {
              if (finished) {
                runOnJS(goBackSafe)();
              }
            });
          } else {
            translateX.value = withSpring(0, { damping: 26, stiffness: 280 });
          }
        }),
    [gestureEnabled, goBackSafe, translateX],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    flex: 1,
    backgroundColor: 'transparent',
    transform: [{ translateX: translateX.value }],
    ...(Platform.OS === 'android' && translateX.value > 0.5
      ? {
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: -4, height: 0 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        }
      : {}),
  }));

  if (Platform.OS !== 'android') {
    return <View style={styles.flex}>{children}</View>;
  }

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View style={sheetStyle}>{children}</Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
