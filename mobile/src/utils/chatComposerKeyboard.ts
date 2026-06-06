import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedStyle } from 'react-native-reanimated';

/** Нижний отступ дока, когда нет `insets.bottom` или он меньше этого значения. */
const CHAT_COMPOSER_DOCK_PADDING_MIN = 8;

/**
 * Android при открытой клавиатуре: нижний safe-area inset часто не «схлопывается» визуально над IME —
 * не дублируем его в padding дока (как в Telegram — плотно к панели клавиатуры).
 */
export const CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_ANDROID = CHAT_COMPOSER_DOCK_PADDING_MIN;

export type ChatComposerAnimatedKeyboard = {
  height: SharedValue<number>;
};

/**
 * Когда `true`, док смещается вверх на `useAnimatedKeyboard().height`, а список получает
 * столько же `marginBottom` — это нужно там, где корень **не** сжимается под IME (типичный iOS,
 * либо Android с `adjustPan` / иным режимом без изменения высоты окна).
 *
 * На типичном Android в Expo / React Native по умолчанию действует **`adjustResize`**: корень уже
 * поднимается над клавиатурой. Повторно применять высоту IME к доку и списку даёт **двойной зазор**
 * (заметно на части устройств с большим gesture inset), поэтому на Android здесь `false`.
 *
 * **Важно:** если для Activity когда-либо включат **`adjustPan`** (высота окна не меняется,
 * контент сдвигается), для Android этот флаг нужно будет снова включать или определять режим
 * динамически — иначе композер окажется под клавиатурой. Сейчас явно ориентируемся на resize.
 */
/** iOS / adjustPan: смещаем и док, и список. */
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
    const margin = CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET ? kb : 0;
    return { marginBottom: margin };
  });

  return { dockAnimatedStyle, listWrapAnimatedStyle };
}

/**
 * Нижний padding дока композера: на Android при открытой клавиатуре не суммируем полный gesture inset
 * с уже поджатым под IME layout (см. {@link CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_ANDROID}).
 */
export function useChatComposerDockPaddingBottom(insetsBottom: number): number {
  const [kbOpen, setKbOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS === 'android' && kbOpen) {
    return CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_ANDROID;
  }
  return Math.max(insetsBottom, CHAT_COMPOSER_DOCK_PADDING_MIN);
}
