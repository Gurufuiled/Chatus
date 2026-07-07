import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';
import {
  useAnimatedKeyboard,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  makeMutable,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

/** Нижний отступ дока, когда нет `insets.bottom` или он меньше этого значения. */
const COMPOSER_DOCK_PADDING_MIN = 8;

/** Window height drop that indicates `adjustResize` already consumed the keyboard inset. */
const ANDROID_RESIZE_SHRINK_THRESHOLD = 96;
/** Early in IME animation even a small shrink means the window is resizing with the keyboard. */
const ANDROID_RESIZE_EARLY_SHRINK_THRESHOLD = 24;

/**
 * При открытой клавиатуре нижний safe-area inset не дублируем в padding дока
 * (композер плотно к панели IME на iOS и Android).
 */
export const CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN = COMPOSER_DOCK_PADDING_MIN;

/** @deprecated Use {@link CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN}. */
export const CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_ANDROID = CHAT_COMPOSER_DOCK_PADDING_WHEN_KEYBOARD_OPEN;

export type ChatComposerAnimatedKeyboard = {
  height: SharedValue<number>;
  /** Shared with lift styles on Android to avoid duplicate resize listeners. */
  androidResizeHandled?: SharedValue<boolean>;
  /** Captured on JS thread — safe to read inside Reanimated worklets. */
  applyIosKeyboardOffset?: boolean;
  applyAndroidDockLift?: boolean;
};

/**
 * Когда `true`, док смещается вверх на `useAnimatedKeyboard().height`, а список получает
 * столько же `marginBottom` — нужно там, где корень **не** сжимается под IME (типичный iOS
 * с абсолютным доком, либо Android с `adjustPan`).
 */
export const CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET = Platform.OS !== 'android';

/**
 * Android: absolute docks do not always move with `adjustResize` (MIUI / gesture nav).
 * When the dock is translated, the list reserves the same space.
 */
export const CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT = Platform.OS === 'android';

const androidResizeHandledGlobal = makeMutable(false);
let androidResizeListenerCount = 0;
let androidResizeSessionLocked = false;
/** Window height baseline (keyboard closed) for resize detection. */
let androidResizeMaxBaseline = Dimensions.get('window').height;

function refreshAndroidResizeMaxBaseline(): void {
  androidResizeMaxBaseline = Dimensions.get('window').height;
}

/**
 * Decide once per keyboard session whether adjustResize already moved the layout.
 * Monotonic: shrink can only lock to resize-handled=true; false commits once on keyboardDidShow.
 */
function lockAndroidResizeHandledForKeyboardSession(early = false): void {
  const shrink = androidResizeMaxBaseline - Dimensions.get('window').height;
  const threshold = early ? ANDROID_RESIZE_EARLY_SHRINK_THRESHOLD : ANDROID_RESIZE_SHRINK_THRESHOLD;

  if (shrink >= threshold) {
    androidResizeHandledGlobal.value = true;
    androidResizeSessionLocked = true;
    return;
  }
  if (early) return;
  if (!androidResizeSessionLocked) {
    androidResizeHandledGlobal.value = false;
    androidResizeSessionLocked = true;
  }
}

function beginAndroidKeyboardSessionFromAnimatedFrame(): void {
  lockAndroidResizeHandledForKeyboardSession(true);
}

function unlockAndroidResizeHandledSession(): void {
  androidResizeSessionLocked = false;
  androidResizeHandledGlobal.value = false;
  refreshAndroidResizeMaxBaseline();
}

function useAndroidKeyboardResizeHandledShared(): SharedValue<boolean> {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    androidResizeListenerCount += 1;
    let showSub: ReturnType<typeof Keyboard.addListener> | null = null;
    let hideSub: ReturnType<typeof Keyboard.addListener> | null = null;

    if (androidResizeListenerCount === 1) {
      refreshAndroidResizeMaxBaseline();
      showSub = Keyboard.addListener('keyboardDidShow', () => {
        lockAndroidResizeHandledForKeyboardSession();
      });
      hideSub = Keyboard.addListener('keyboardDidHide', () => {
        unlockAndroidResizeHandledSession();
      });
    }

    return () => {
      androidResizeListenerCount -= 1;
      if (androidResizeListenerCount === 0) {
        showSub?.remove();
        hideSub?.remove();
        unlockAndroidResizeHandledSession();
      }
    };
  }, []);

  return androidResizeHandledGlobal;
}

/**
 * Unified keyboard height for chat composers.
 * iOS: Reanimated keyboard (frame-synced).
 * Android: Reanimated keyboard only when manual dock lift is needed; skip when adjustResize
 * already shrank the window (locked for the whole keyboard session).
 */
export function useChatComposerKeyboard(): ChatComposerAnimatedKeyboard {
  const animated = useAnimatedKeyboard();
  const isAndroid = Platform.OS === 'android';
  const androidResizeHandled = useAndroidKeyboardResizeHandledShared();
  const height = useSharedValue(0);
  const applyIosKeyboardOffset = !isAndroid;
  const applyAndroidDockLift = isAndroid;

  useAnimatedReaction(
    () => animated.height.value,
    (current, previous) => {
      'worklet';
      if (!isAndroid) return;
      const prev = previous ?? 0;
      if (current > 0 && prev <= 0) {
        runOnJS(beginAndroidKeyboardSessionFromAnimatedFrame)();
      }
    },
  );

  useAnimatedReaction(
    () => {
      'worklet';
      if (!isAndroid) {
        return Math.max(animated.height.value, 0);
      }
      if (androidResizeHandled.value) {
        return 0;
      }
      return Math.max(animated.height.value, 0);
    },
    (next) => {
      'worklet';
      height.value = next;
    },
  );

  return { height, androidResizeHandled, applyIosKeyboardOffset, applyAndroidDockLift };
}

function resolveComposerKeyboardLift(
  kb: number,
  androidResizeHandled: boolean,
  applyIosKeyboardOffset: boolean,
  applyAndroidDockLift: boolean,
): number {
  'worklet';
  if (kb <= 0) return 0;
  if (applyIosKeyboardOffset) return kb;
  if (applyAndroidDockLift && !androidResizeHandled) return kb;
  return 0;
}

/**
 * Стили смещения абсолютного дока и нижнего отступа списка относительно клавиатуры.
 */
export function useChatComposerKeyboardLiftStyles(
  animatedKeyboard: ChatComposerAnimatedKeyboard,
  isVoiceRecordingShared?: SharedValue<boolean>,
) {
  const fallbackResizeHandled = useAndroidKeyboardResizeHandledShared();
  const androidResizeHandled =
    animatedKeyboard.androidResizeHandled ?? fallbackResizeHandled;

  const applyIosKeyboardOffset =
    animatedKeyboard.applyIosKeyboardOffset ?? CHAT_COMPOSER_APPLY_KEYBOARD_ANIMATION_OFFSET;
  const applyAndroidDockLift =
    animatedKeyboard.applyAndroidDockLift ?? CHAT_COMPOSER_APPLY_ANDROID_DOCK_KEYBOARD_LIFT;

  const dockAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    if (isVoiceRecordingShared?.value) return { transform: [{ translateY: 0 }] };
    const kb = Math.max(animatedKeyboard.height.value, 0);
    const offset = resolveComposerKeyboardLift(
      kb,
      androidResizeHandled.value,
      applyIosKeyboardOffset,
      applyAndroidDockLift,
    );
    return { transform: [{ translateY: -offset }] };
  });

  const listWrapAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    if (isVoiceRecordingShared?.value) return { marginBottom: 0 };
    const kb = Math.max(animatedKeyboard.height.value, 0);
    const margin = resolveComposerKeyboardLift(
      kb,
      androidResizeHandled.value,
      applyIosKeyboardOffset,
      applyAndroidDockLift,
    );
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
  return Math.max(insetsBottom, COMPOSER_DOCK_PADDING_MIN);
}
