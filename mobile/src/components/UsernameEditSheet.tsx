import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import Feather from '@expo/vector-icons/Feather';

const HANDLE_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: withAlpha('#000000', 0.45),
    },
    sheet: {
      width: '100%',
      maxHeight: Dimensions.get('window').height * 0.92,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      backgroundColor: c.inputBackgroundSolid,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: c.rowPressed,
    },
    pillText: { fontSize: 16, fontWeight: '600', color: c.textPrimary },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '700',
      color: c.textPrimary,
    },
    scroll: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 24,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.textSecondary,
      marginBottom: 8,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      backgroundColor: c.chatBackground,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    at: {
      fontSize: 17,
      fontWeight: '600',
      color: c.textSecondary,
      marginRight: 2,
    },
    input: {
      flex: 1,
      fontSize: 17,
      fontWeight: '600',
      color: c.textPrimary,
      paddingVertical: 0,
    },
    clearBtn: { padding: 6 },
    hint: {
      marginTop: 14,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
    },
    link: {
      marginTop: 12,
      fontSize: 15,
      fontWeight: '600',
      color: c.accent,
    },
  });
}

export type UsernameEditSheetProps = {
  visible: boolean;
  initialHandle: string;
  onClose: () => void;
  /** Сохранить handle без @; пустая строка — сброс (null на сервере). */
  onApply: (handleWithoutAt: string) => Promise<void>;
};

export function UsernameEditSheet({ visible, initialHandle, onClose, onApply }: UsernameEditSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const slide = useRef(new Animated.Value(0)).current;
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft((initialHandle ?? '').replace(/^@/, '').trim());
  }, [visible, initialHandle]);

  useEffect(() => {
    if (!visible) {
      slide.setValue(0);
      return;
    }
    const h = Dimensions.get('window').height;
    slide.setValue(h * 0.35);
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  }, [visible, slide]);

  const dismissAnimated = useCallback(
    (then: () => void) => {
      Animated.timing(slide, {
        toValue: Dimensions.get('window').height * 0.45,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) then();
      });
    },
    [slide],
  );

  const onBackdrop = useCallback(() => {
    dismissAnimated(onClose);
  }, [dismissAnimated, onClose]);

  const trimmed = draft.trim().replace(/^@/, '');
  const canSave =
    trimmed.length === 0 ||
    (trimmed.length >= 5 && trimmed.length <= 32 && HANDLE_REGEX.test(trimmed));

  const onSave = useCallback(async () => {
    const t = trimmed;
    if (t.length > 0 && (t.length < 5 || t.length > 32 || !HANDLE_REGEX.test(t))) {
      Alert.alert('Имя пользователя', '5–32 символа: латиница, цифры и подчёркивание.');
      return;
    }
    setSaving(true);
    try {
      await onApply(t);
      dismissAnimated(onClose);
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [dismissAnimated, onApply, onClose, trimmed]);

  const openLink = useCallback(() => {
    const h = trimmed || 'username';
    void Linking.openURL(`https://t.me/${encodeURIComponent(h)}`);
  }, [trimmed]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onBackdrop}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={onBackdrop}>
          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: slide }],
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.headerRow}>
                <Pressable style={styles.pill} onPress={() => dismissAnimated(onClose)}>
                  <Text style={styles.pillText}>Отмена</Text>
                </Pressable>
                <Text style={styles.title} numberOfLines={1}>
                  Имя пользователя
                </Text>
                <Pressable
                  style={[styles.pill, (!canSave || saving) && { opacity: 0.45 }]}
                  disabled={!canSave || saving}
                  onPress={() => void onSave()}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <Text style={styles.pillText}>Готово</Text>
                  )}
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
                <Text style={styles.fieldLabel}>ИМЯ ПОЛЬЗОВАТЕЛЯ</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.at}>@</Text>
                  <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={(t) => setDraft(t.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="username"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={32}
                  />
                  {draft.length > 0 ? (
                    <Pressable style={styles.clearBtn} onPress={() => setDraft('')} hitSlop={8}>
                      <Feather name="x" size={18} color={colors.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>

                <Text style={styles.hint}>
                  Вы можете выбрать имя пользователя в Chatus. Если сделаете это, люди смогут найти Вас по этому
                  имени без номера телефона.{'\n\n'}
                  Имя пользователя может содержать латиницу (a–z), цифры (0–9) и подчёркивания. Минимальная длина —
                  5 символов.
                </Text>

                <Pressable onPress={openLink}>
                  <Text style={styles.link}>https://t.me/{trimmed || 'username'}</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
