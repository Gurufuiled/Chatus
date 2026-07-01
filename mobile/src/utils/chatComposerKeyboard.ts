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
export const CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN = CHAT_COMPOSER_DOCK_PADDING_MIN;

/** @deprecated Use {@link CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN}. */
export const CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_ANDROID = CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN;

export type ChatComposerAnimatedKeyboard = {
  height: SharedValue<number>;
};

type ChatComposerKeyboardLiftOptions = {
  /** Some absolute-composer screens do not get Android root resize reliably; keep latest rows above IME. */
  applyListKeyboardOffsetOnAndroid?: boolean;
};

/**
 * Когда `true`, док смещается вверх на `useAnimatedKeyboard().height`, а список получает
 * столько же `marginBottom` — нужно там, где корень **не** сжимается под IME (типичный iOS
 * с абсолютным доком, либо Android с `adjustPan`).
 *
 * На Android с `adjustResize` корень уже поднимается над клавиатурой; повторный `marginBottom`
 * у списка даёт двойной зазор — поэтому здесь `false` на Android.
 * Подъём только дока на Android — {@link CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT}.
 */
export const CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET = Platform.OS !== 'android';

/**
 * Android: абсолютный док не всегда поднимается с `adjustResize` (MIUI / gesture nav).
 * Поднимаем только док по `useAnimatedKeyboard`, без `marginBottom` у списка — иначе двойной зазор.
 */
export const CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT = Platform.OS === 'android';

/**
 * Стили смещения абсолютного дока и нижнего отступа списка относительно клавиатуры.
 * Логика завязана на {@link CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET}.
 */
export function useChatComposerKeyboardLiftStyles(
  animatedKeyboard: ChatComposerAnimatedKeyboard,
  isVoiceRecordingShared?: SharedValue<boolean>,
  options?: ChatComposerKeyboardLiftOptions,
) {
  const applyListKeyboardOffsetOnAndroid = options?.applyListKeyboardOffsetOnAndroid === true;

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
    const shouldApplyListOffset =
      CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET ||
      (Platform.OS === 'android' && applyListKeyboardOffsetOnAndroid);
    const margin = shouldApplyListOffset ? kb : 0;
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
