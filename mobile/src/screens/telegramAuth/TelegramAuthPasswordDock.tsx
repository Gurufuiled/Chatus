import React, { memo, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Reanimated, { useAnimatedKeyboard } from 'react-native-reanimated';
import {
  useChatComposerDockPaddingBottom,
  useChatComposerKeyboardLiftStyles,
} from '../../utils/chatComposerKeyboard';
import { AuthWizardTextField } from './AuthWizardTextField';

type Props = {
  cloudPassword: string;
  onChangePassword: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  preparing: boolean;
  canSubmit: boolean;
  insetsBottom: number;
  colors: {
    accent: string;
    textPrimary: string;
    inputBackgroundSolid: string;
  };
  isLight: boolean;
  ui: {
    label: string;
    placeholder: string;
    border: string;
    fieldBg: string;
  };
  inputFieldStyle: StyleProp<TextStyle>;
};

/** Отдельный док 2FA: `useAnimatedKeyboard` только здесь, чтобы не дёргать весь wizard при вводе телефона. */
export const TelegramAuthPasswordDock = memo(function TelegramAuthPasswordDock({
  cloudPassword,
  onChangePassword,
  onSubmit,
  busy,
  preparing,
  canSubmit,
  insetsBottom,
  colors,
  isLight,
  ui,
  inputFieldStyle,
}: Props) {
  const passwordInputRef = useRef<TextInput>(null);
  const animatedKeyboard = useAnimatedKeyboard();
  const { dockAnimatedStyle } = useChatComposerKeyboardLiftStyles(animatedKeyboard);
  const composerDockPaddingBottom = useChatComposerDockPaddingBottom(insetsBottom);

  useEffect(() => {
    if (preparing) return;
    const timer = setTimeout(() => passwordInputRef.current?.focus(), 320);
    return () => clearTimeout(timer);
  }, [preparing]);

  return (
    <Reanimated.View
      style={[
        styles.passwordDock,
        dockAnimatedStyle,
        {
          backgroundColor: isLight ? '#FFFFFF' : colors.inputBackgroundSolid,
          borderTopColor: ui.border,
          paddingBottom: composerDockPaddingBottom,
        },
      ]}
    >
      <Text style={[styles.fieldLabel, { color: ui.label }]}>Облачный пароль</Text>
      <AuthWizardTextField
        ref={passwordInputRef}
        value={cloudPassword}
        onChangeText={onChangePassword}
        placeholder="Пароль 2FA"
        placeholderTextColor={ui.placeholder}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="password"
        spellCheck={false}
        editable={!busy && !preparing}
        style={[inputFieldStyle, styles.passwordDockInput]}
      />
      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.primaryBtn,
          {
            backgroundColor: colors.accent,
            opacity: !canSubmit ? 0.45 : pressed ? 0.9 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Продолжить</Text>
        )}
      </Pressable>
    </Reanimated.View>
  );
});

const styles = StyleSheet.create({
  passwordDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  passwordDockInput: {
    marginBottom: 12,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
