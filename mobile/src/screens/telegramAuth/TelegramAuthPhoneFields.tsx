import React, { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { AuthWizardTextField } from './AuthWizardTextField';

type Props = {
  phoneInitialValue: string;
  onCommitPhone: (value: string) => void;
  onSubmitPhone: (value: string) => void;
  busy: boolean;
  preparing: boolean;
  canSendPhone: boolean;
  phonePrimary: boolean;
  colors: { accent: string };
  ui: { placeholder: string };
  inputFieldStyle: StyleProp<TextStyle>;
};

/** Изолированный шаг телефона — меньше ре-рендеров от password dock / keyboard. */
export const TelegramAuthPhoneFields = memo(function TelegramAuthPhoneFields({
  phoneInitialValue,
  onCommitPhone,
  onSubmitPhone,
  busy,
  preparing,
  canSendPhone,
  phonePrimary,
  colors,
  ui,
  inputFieldStyle,
}: Props) {
  const [phone, setPhone] = useState(phoneInitialValue);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setPhone(phoneInitialValue);
  }, [phoneInitialValue]);

  return (
    <>
      <AuthWizardTextField
        value={phone}
        onChangeText={(value) => {
          dirtyRef.current = true;
          setPhone(value);
        }}
        onBlur={() => {
          dirtyRef.current = false;
          onCommitPhone(phone);
        }}
        placeholder="+7 900 000-00-00"
        placeholderTextColor={ui.placeholder}
        keyboardType="phone-pad"
        editable={!busy && !preparing}
        style={inputFieldStyle}
      />
      <Pressable
        onPress={() =>
          Alert.alert(
            'Формат номера',
            'Международный формат: +7 и 10 цифр. Можно ввести 8 988… или 988… — подставим +7.',
          )
        }
        hitSlop={8}
      >
        <Text style={[styles.linkHint, { color: colors.accent }]}>Как ввести номер?</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          dirtyRef.current = false;
          onCommitPhone(phone);
          onSubmitPhone(phone);
        }}
        disabled={!canSendPhone || !phonePrimary}
        style={({ pressed }) => [
          styles.primaryBtn,
          styles.primaryBtnSpaced,
          {
            backgroundColor: colors.accent,
            opacity: !canSendPhone || !phonePrimary ? 0.45 : pressed ? 0.9 : 1,
          },
        ]}
      >
        {busy && phonePrimary ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Получить код</Text>
        )}
      </Pressable>
    </>
  );
});

const styles = StyleSheet.create({
  linkHint: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  primaryBtnSpaced: { marginTop: 4 },
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
