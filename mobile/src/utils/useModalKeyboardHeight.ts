import { useEffect } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

/**
 * `useAnimatedKeyboard` часто возвращает 0 внутри React Native `Modal` на Android.
 * Этот хук читает высоту клавиатуры через `Keyboard` API и отдаёт SharedValue для Reanimated.
 */
export function useModalKeyboardHeight(enabled: boolean): SharedValue<number> {
  const height = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      height.value = 0;
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      height.value = event.endCoordinates.height;
    };
    const onHide = () => {
      height.value = 0;
    };

    const metrics = Keyboard.metrics();
    if (metrics?.height && metrics.height > 0) {
      height.value = metrics.height;
    }

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
      height.value = 0;
    };
  }, [enabled, height]);

  return height;
}
