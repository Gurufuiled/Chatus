import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatsStackParamList } from '../navigation/types';
import { createAddressBookContact } from '../services/contactService';
import { createOrFindChat } from '../services/chatService';
import { chatStore } from '../stores/chatStore';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { StyleSheet } from 'react-native';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'CreateContact'>;

export function CreateContactScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSave = useCallback(async () => {
    const p = phone.trim();
    const digits = p.replace(/\D/g, '');
    if (digits.length < 6) {
      Alert.alert('Телефон', 'Введите номер: не менее 6 цифр.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createAddressBookContact({
        phone: digits,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      });
      if (created.linked_user_id) {
        const chat = await createOrFindChat(created.linked_user_id);
        chatStore.getState().addOrUpdateChat(chat);
        navigation.replace('Chat', {
          chatId: chat.id,
          chatTitle:
            chat.local_contact_name?.trim() ||
            chat.peer_display_name?.trim() ||
            chat.name ||
            [created.first_name, created.last_name].filter(Boolean).join(' ') ||
            'Чат',
        });
        return;
      }
      Alert.alert('Сохранено', 'Контакт добавлен в адресную книгу.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [firstName, lastName, navigation, phone]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingBottom: insets.bottom + 16 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Имя</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Имя"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="words"
        />
        <Text style={styles.label}>Фамилия</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Фамилия (необязательно)"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="words"
        />
        <Text style={styles.label}>Телефон</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+7 …"
          placeholderTextColor={colors.placeholder}
          keyboardType="phone-pad"
        />
        <Pressable
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={() => void onSave()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.textSecondaryMuted} />
          ) : (
            <Text style={styles.btnText}>Сохранить</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.header,
    },
    scroll: {
      padding: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.inputBackgroundSolid,
    },
    btn: {
      marginTop: 24,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.accent,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    btnText: {
      color: colors.textSecondaryMuted,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
