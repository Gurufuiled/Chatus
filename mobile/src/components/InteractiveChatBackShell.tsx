import React, { useCallback, useMemo, useRef } from 'react';
import { BackHandler, Dimensions, Platform, StyleSheet, View } from 'react-native';
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
/** Only touches that start in this band may activate interactive back (avoids bubble/video taps). */
const BACK_GESTURE_EDGE_PX = 28;

type Props = {
  navigation: NavigationProp<ParamListBase>;
  gestureEnabled: boolean;
  /**
   * Called first on Android hardware/system back while this screen is focused.
   * Return true if the press was consumed (e.g. closed menu / selection / search).
   */
  onBackPress?: () => boolean;
  children: React.ReactNode;
};

/**
 * Telegram-style interactive pop: drag the whole chat layer to the right, then go back.
 * On iOS, native-stack fullScreenGesture handles this; this shell is Android-only so it
 * does not compete with the system gesture.
 *
 * System back on Android also routes through this shell: the native stack transition
 * blanks expo-image wallpaper + FlatList, so we animate ourselves then pop with
 * animation: 'none'.
 */
export function InteractiveChatBackShell({
  navigation,
  gestureEnabled,
  onBackPress,
  children,
}: Props) {
  const translateX = useSharedValue(0);
  const dismissingRef = useRef(false);
  const onBackPressRef = useRef(onBackPress);
  onBackPressRef.current = onBackPress;

  const clearDismissing = useCallback(() => {
    dismissingRef.current = false;
  }, []);

  const snapBack = useCallback(() => {
    dismissingRef.current = false;
    translateX.value = withSpring(0, { damping: 26, stiffness: 280 });
  }, [translateX]);

  const goBackSafe = useCallback(() => {
    if (!navigation.canGoBack()) {
      snapBack();
      return;
    }
    // Screen is already off-screen via Reanimated; skip native pop animation that
    // blanks wallpaper/FlatList on Android transparentModal screens.
    if (Platform.OS === 'android') {
      navigation.setOptions({ animation: 'none' } as never);
      requestAnimationFrame(() => {
        if (navigation.canGoBack()) {
          dismissingRef.current = false;
          navigation.goBack();
        } else {
          snapBack();
        }
      });
      return;
    }
    dismissingRef.current = false;
    navigation.goBack();
  }, [navigation, snapBack]);

  const beginDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    if (!navigation.canGoBack()) {
      snapBack();
      return;
    }
    dismissingRef.current = true;
    translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(goBackSafe)();
      } else {
        runOnJS(clearDismissing)();
      }
    });
  }, [clearDismissing, goBackSafe, navigation, snapBack, translateX]);

  useFocusEffect(
    useCallback(() => {
      dismissingRef.current = false;
      translateX.value = 0;

      if (Platform.OS !== 'android') {
        return undefined;
      }

      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (onBackPressRef.current?.()) {
          return true;
        }
        if (!navigation.canGoBack()) {
          return false;
        }
        // Never raw goBack(): native pop blanks wallpaper on transparentModal.
        beginDismiss();
        return true;
      });

      return () => {
        sub.remove();
      };
    }, [beginDismiss, navigation, translateX]),
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(gestureEnabled)
        .manualActivation(true)
        .activeOffsetX(22)
        .failOffsetY([-22, 22])
        .onTouchesDown((event, stateManager) => {
          const touch = event.allTouches[0];
          if (touch && touch.x <= BACK_GESTURE_EDGE_PX) {
            stateManager.activate();
          } else {
            stateManager.fail();
          }
        })
        .onUpdate((e) => {
          const x = Math.max(0, e.translationX);
          translateX.value = Math.min(x, SCREEN_WIDTH);
        })
        .onEnd((e) => {
          const dismiss = translateX.value > SCREEN_WIDTH * 0.2 || e.velocityX > 900;
          if (dismiss) {
            runOnJS(beginDismiss)();
          } else {
            translateX.value = withSpring(0, { damping: 26, stiffness: 280 });
          }
        }),
    [beginDismiss, gestureEnabled, translateX],
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
