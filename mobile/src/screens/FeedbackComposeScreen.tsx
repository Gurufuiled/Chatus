import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createFeedback } from '../services/feedbackService';
import { colors } from '../theme/colors';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'FeedbackCompose'>;

export function FeedbackComposeScreen({ navigation, route }: Props) {
  const { kind } = route.params;
  const title = kind === 'bug' ? 'Сообщить о баге' : 'Предложение';

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const t = subject.trim();
    const b = body.trim();
    if (!t || !b) {
      Alert.alert('', 'Заполните заголовок и текст.');
      return;
    }
    setSubmitting(true);
    try {
      await createFeedback({ type: kind, title: t, body: b });
      Alert.alert('', 'Отправлено.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('', e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setSubmitting(false);
    }
  }, [body, kind, navigation, subject]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () =>
        submitting ? (
          <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} />
        ) : (
          <Pressable onPress={submit} hitSlop={12} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Отправить</Text>
          </Pressable>
        ),
    });
  }, [navigation, submit, submitting, title]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.label}>Заголовок</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Кратко"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          maxLength={200}
          editable={!submitting}
        />
        <Text style={styles.label}>Текст</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Опишите подробнее"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, styles.bodyInput]}
          multiline
          textAlignVertical="top"
          maxLength={8000}
          editable={!submitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.chatBackground },
  scroll: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: colors.inputBackgroundSolid,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    marginBottom: 16,
  },
  bodyInput: { minHeight: 200 },
  headerBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  headerBtnText: { fontSize: 17, fontWeight: '600', color: colors.accent },
});
