import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import type { ApiUser } from '../services/AuthService';
import { requestPhoneChange, verifyPhoneChange } from '../services/phoneChangeService';

function digitsOnly(s: string) {
  return s.replace(/\D/g, '');
}

/** 10 цифр после +7 (часто с 9…), с учётом вставки +7… */
function normalizeNationalInput(raw: string): string {
  let d = digitsOnly(raw);
  if (d.length >= 11 && d.startsWith('7')) {
    d = d.slice(1);
  }
  if (d.length >= 11 && d.startsWith('8')) {
    d = d.slice(1);
  }
  return d.slice(0, 10);
}

function formatRuNational10(d: string): string {
  const x = digitsOnly(d).slice(0, 10);
  const a = x.slice(0, 3);
  const b = x.slice(3, 6);
  const c = x.slice(6, 8);
  const e = x.slice(8, 10);
  const parts = [a, b, c, e].filter((p) => p.length > 0);
  return parts.join(' ');
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.chatBackground },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      minHeight: 48,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.rowPressed,
    },
    emoji: {
      textAlign: 'center',
      fontSize: 72,
      marginTop: 4,
      marginBottom: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    subtitle: {
      marginTop: 12,
      fontSize: 15,
      lineHeight: 22,
      color: c.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 28,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginHorizontal: 20,
      marginTop: 28,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 22,
      paddingVertical: 14,
      marginHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    countryFlag: { fontSize: 22, marginRight: 10 },
    countryText: { flex: 1, fontSize: 17, fontWeight: '600', color: c.textPrimary },
    codeBox: {
      minWidth: 44,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.inputBackgroundSolid,
      marginRight: 12,
    },
    codeBoxText: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    phoneInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: c.textPrimary,
      paddingVertical: 4,
    },
    continueWrap: {
      paddingHorizontal: 22,
      marginTop: 28,
    },
    continueBtn: {
      borderRadius: 26,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    continueText: { fontSize: 16, fontWeight: '800' },
    codeHint: {
      marginTop: 16,
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    demoCode: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: '700',
      color: c.accent,
      textAlign: 'center',
    },
    codeField: {
      marginHorizontal: 28,
      marginTop: 24,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 6,
      textAlign: 'center',
      backgroundColor: c.inputBackgroundSolid,
      color: c.textPrimary,
    },
  });
}

export type ChangePhoneSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: (user: ApiUser) => void;
};

type Step = 'phone' | 'code';

export function ChangePhoneSheet({ visible, onClose, onSuccess }: ChangePhoneSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep] = useState<Step>('phone');
  const [national, setNational] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingE164, setPendingE164] = useState('');
  const [demoCodeHint, setDemoCodeHint] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep('phone');
    setNational('');
    setSessionId(null);
    setPendingE164('');
    setDemoCodeHint(null);
    setCode('');
    setLoading(false);
  }, [visible]);

  const national10 = digitsOnly(national).slice(0, 10);
  const canContinuePhone = national10.length === 10 && national10.startsWith('9');
  const canContinueCode = digitsOnly(code).length === 6;

  const handleBack = useCallback(() => {
    if (step === 'code') {
      setStep('phone');
      setCode('');
      setDemoCodeHint(null);
      return;
    }
    onClose();
  }, [onClose, step]);

  const onRequestCode = useCallback(async () => {
    if (!canContinuePhone) return;
    const e164 = `+7${national10}`;
    setLoading(true);
    try {
      const res = await requestPhoneChange(e164);
      setSessionId(res.session_id);
      setPendingE164(e164);
      if (res.demo_code) {
        setDemoCodeHint(`Код (dev): ${res.demo_code}`);
      } else {
        setDemoCodeHint(null);
      }
      setStep('code');
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canContinuePhone, national10]);

  const onVerify = useCallback(async () => {
    if (!sessionId || !canContinueCode) return;
    setLoading(true);
    try {
      const user = await verifyPhoneChange(sessionId, digitsOnly(code));
      onSuccess(user);
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canContinueCode, code, onSuccess, sessionId]);

  const displayPhone = useMemo(() => formatRuNational10(national), [national]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
    >
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={handleBack} hitSlop={8}>
            <Feather name="chevron-left" size={26} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Text style={styles.emoji}>☎️</Text>

          {step === 'phone' ? (
            <>
              <Text style={styles.title}>Новый номер</Text>
              <Text style={styles.subtitle}>
                На Ваш новый номер поступит звонок или SMS с кодом подтверждения.
              </Text>
              <View style={styles.divider} />
              <Pressable
                style={styles.row}
                onPress={() =>
                  Alert.alert('Страна', 'Сейчас доступна только Россия (+7).')
                }
              >
                <Text style={styles.countryFlag}>🇷🇺</Text>
                <Text style={styles.countryText}>Россия</Text>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.row, styles.rowLast]}>
                <View style={styles.codeBox}>
                  <Text style={styles.codeBoxText}>+7</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={displayPhone}
                  onChangeText={(t) => setNational(normalizeNationalInput(t))}
                  placeholder="000 000 00 00"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                  maxLength={14}
                  autoFocus={visible}
                />
              </View>
              <View style={styles.continueWrap}>
                <Pressable
                  style={[
                    styles.continueBtn,
                    {
                      backgroundColor: canContinuePhone ? colors.accent : colors.buttonBackground,
                      opacity: canContinuePhone ? 1 : 0.75,
                    },
                  ]}
                  disabled={!canContinuePhone || loading}
                  onPress={() => void onRequestCode()}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.textSecondaryMuted} />
                  ) : (
                    <Text
                      style={[
                        styles.continueText,
                        { color: canContinuePhone ? colors.textSecondaryMuted : colors.textSecondary },
                      ]}
                    >
                      Продолжить
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Подтверждение</Text>
              <Text style={styles.subtitle}>
                Введите код из SMS, отправленный на номер{'\n'}
                <Text style={{ fontWeight: '800' }}>{pendingE164}</Text>
              </Text>
              <TextInput
                style={styles.codeField}
                value={code}
                onChangeText={(t) => setCode(digitsOnly(t).slice(0, 6))}
                placeholder="••••••"
                placeholderTextColor={colors.placeholder}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              {demoCodeHint ? <Text style={styles.demoCode}>{demoCodeHint}</Text> : null}
              <Text style={styles.codeHint}>
                В production код приходит по SMS; пока провайдер не подключён, код может быть в ответе API (dev).
              </Text>
              <View style={styles.continueWrap}>
                <Pressable
                  style={[
                    styles.continueBtn,
                    {
                      backgroundColor: canContinueCode ? colors.accent : colors.buttonBackground,
                      opacity: canContinueCode ? 1 : 0.75,
                    },
                  ]}
                  disabled={!canContinueCode || loading}
                  onPress={() => void onVerify()}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.textSecondaryMuted} />
                  ) : (
                    <Text
                      style={[
                        styles.continueText,
                        { color: canContinueCode ? colors.textSecondaryMuted : colors.textSecondary },
                      ]}
                    >
                      Продолжить
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
