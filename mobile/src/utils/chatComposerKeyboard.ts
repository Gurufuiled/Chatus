import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

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

function dockPaddingForKeyboardHeight(keyboardHeight: number, restPad: number, openPad: number): number {
  'worklet';
  const kb = Math.max(keyboardHeight, 0);
  if (kb <= 0) return restPad;
  // Shrink home-indicator padding over the first `restPad` px of keyboard rise so
  // interactive dismiss stays locked to IME (no React-state snap on willShow/willHide).
  const span = Math.max(restPad - openPad, 1);
  if (kb >= span) return openPad;
  return restPad - (kb / span) * (restPad - openPad);
}

/**
 * Стили смещения абсолютного дока и нижнего отступа списка относительно клавиатуры.
 * `insetsBottom` drives animated dock `paddingBottom` in sync with keyboard height.
 * When `suppressDockPaddingShared` is true (e.g. selection bar owns the inset), padding is 0.
 */
export function useChatComposerKeyboardLiftStyles(
  animatedKeyboard: ChatComposerAnimatedKeyboard,
  isVoiceRecordingShared?: SharedValue<boolean>,
  insetsBottom = 0,
  suppressDockPaddingShared?: SharedValue<boolean>,
) {
  const controllerKeyboard = useReanimatedKeyboardAnimation();
  const restPad = Math.max(insetsBottom, CHAT_COMPOSER_DOCK_PADDING_MIN);
  const restPadShared = useSharedValue(restPad);
  const openPadShared = useSharedValue(CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN);

  useEffect(() => {
    restPadShared.value = restPad;
  }, [restPad, restPadShared]);

  const dockAnimatedStyle = useAnimatedStyle(() => {
    const suppressPad = suppressDockPaddingShared?.value === true;
    const rest = suppressPad ? 0 : restPadShared.value;
    const open = suppressPad ? 0 : openPadShared.value;
    if (isVoiceRecordingShared?.value) {
      return {
        transform: [{ translateY: 0 }],
        paddingBottom: rest,
      };
    }
    // On iOS this value follows the keyboard frame during an interactive
    // scroll-dismiss, so the composer and the list move on the same frame.
    const kb =
      Platform.OS === 'ios'
        ? Math.max(-controllerKeyboard.height.value, 0)
        : Math.max(animatedKeyboard.height.value, 0);
    const offset =
      CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET || CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT
        ? kb
        : 0;
    return {
      transform: [{ translateY: -offset }],
      paddingBottom: dockPaddingForKeyboardHeight(kb, rest, open),
    };
  });

  const listWrapAnimatedStyle = useAnimatedStyle(() => {
    if (isVoiceRecordingShared?.value) return { marginBottom: 0 };
    const applyLift =
      CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET || CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT;
    if (!applyLift) return { marginBottom: 0 };
    const kb =
      Platform.OS === 'ios'
        ? Math.max(-controllerKeyboard.height.value, 0)
        : Math.max(animatedKeyboard.height.value, 0);
    const rest = restPadShared.value;
    const open = openPadShared.value;
    const dockPad = dockPaddingForKeyboardHeight(kb, rest, open);
    // Keep inverted list bottom inset locked to the live dock pad so rows do not
    // jump when keyboard opens, and do not leave a gap when pad shrinks to openPad.
    return { marginBottom: kb + dockPad - rest };
  });

  return { dockAnimatedStyle, listWrapAnimatedStyle };
}

/**
 * Stable bottom inset for list content / FAB — never toggles on keyboard show/hide,
 * so inverted chat rows do not jump when the composer rises.
 */
export function useChatComposerDockPaddingBottom(insetsBottom: number): number {
  return Math.max(insetsBottom, CHAT_COMPOSER_DOCK_PADDING_MIN);
}
