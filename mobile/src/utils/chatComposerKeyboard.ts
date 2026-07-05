import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedStyle } from 'react-native-reanimated';

/** Нижний отступ дока, когда нет `insets.bottom` или он меньше этого значения. */
const CHAT_COMPOSER_DOCK_PADDING_MIN = 8;

/**
 * При открытой клавиатуре нижний safe-area inset не дублируем в padding дока
 * (композер плотно к панели IME на iOS и Android).
 */
export const CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN = 0;

/** @deprecated Use {@link CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN}. */
export const CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_ANDROID = CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN;

export type ChatComposerAnimatedKeyboard = {
  height: SharedValue<number>;
};

/**
 * Когда `true`, док смещается вверх на `useAnimatedKeyboard().height`, а список получает
 * столько же `marginBottom` — нужно там, где корень **не** сжимается под IME (типичный iOS
 * с абсолютным доком, либо Android с `adjustPan`).
 *
 * On Android, the base resize path is handled separately by
 * CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT.
 */
export const CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET = Platform.OS !== 'android';

/**
 * Android: absolute docks do not always move with `adjustResize` (MIUI / gesture nav).
 * When the dock is translated, the list reserves the same space.
 */
export const CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT = Platform.OS === 'android';

/**
 * Стили смещения абсолютного дока и нижнего отступа списка относительно клавиатуры.
 */
export function useChatComposerKeyboardLiftStyles(
  animatedKeyboard: ChatComposerAnimatedKeyboard,
  isVoiceRecordingShared?: SharedValue<boolean>
) {
  const dockAnimatedStyle = useAnimatedStyle(() => {
    if (isVoiceRecordingShared?.value) return { transform: [{ translateY: 0 }] };
    const kb = Math.max(animatedKeyboard.height.value, 0);
    const offset =
      CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET || CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT
        ? kb
        : 0;
    return { transform: [{ translateY: -offset }] };
  });

  const listWrapAnimatedStyle = useAnimatedStyle(() => {
    if (isVoiceRecordingShared?.value) return { marginBottom: 0 };
    const kb = Math.max(animatedKeyboard.height.value, 0);
    const margin =
      CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET || CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT
        ? kb
        : 0;
    return { marginBottom: margin };
  });

  return { dockAnimatedStyle, listWrapAnimatedStyle };
}

/**
 * Нижний padding дока композера: на Android при открытой клавиатуре не суммируем полный gesture inset
 * с уже поджатым под IME layout (см. {@link CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN}).
 */
export function useChatComposerDockPaddingBottom(insetsBottom: number): number {
  const [kbOpen, setKbOpen] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKbOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKbOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (kbOpen) {
    return CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN;
  }
  return Math.max(insetsBottom, CHAT_COMPOSER_DOCK_PADDING_MIN);
}
