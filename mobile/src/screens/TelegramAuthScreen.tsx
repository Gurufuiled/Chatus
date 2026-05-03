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
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import Constants from 'expo-constants';
import { getTelegramBuildCredentials, tdlibClient } from '../services/tdlib/TdlibClient';
import { telegramAccountStore } from '../stores/telegramAccountStore';

export function TelegramAuthScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const { apiId, apiHash } = useMemo(() => getTelegramBuildCredentials(), []);

  const initTdlib = useCallback(async () => {
    if (apiId == null || !apiHash) {
      Alert.alert(
        'Нет ключей Telegram API',
        'Задайте TELEGRAM_API_ID и TELEGRAM_API_HASH в EAS Secrets (или в .env при локальной сборке). См. mobile/TDLIB.md.',
      );
      return;
    }
    setBusy(true);
    try {
      await tdlibClient.send({
        '@type': 'setTdlibParameters',
        use_test_dc: false,
        database_directory: 'tdlib',
        files_directory: 'tdlib_files',
        database_encryption_key: '',
        api_id: apiId,
        api_hash: apiHash,
        system_language_code: 'ru',
        device_model: 'Chatus',
        application_version: String(Constants.expoConfig?.version ?? '1.0.0'),
      });
      const auth = await tdlibClient.send({ '@type': 'getAuthorizationState' });
      const t = (auth as { '@type'?: string })['@type'];
      if (t === 'authorizationStateReady') {
        telegramAccountStore.getState().setAuthStatus('ready');
        await telegramAccountStore.getState().persistSnapshot();
        navigation.replace('TelegramDialogs');
        return;
      }
      telegramAccountStore.getState().setAuthStatus('waiting_phone');
      await telegramAccountStore.getState().persistSnapshot();
    } catch (e) {
      Alert.alert('TDLib', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [apiHash, apiId, navigation]);

  const submitPhone = useCallback(async () => {
    const trimmed = phone.replace(/\s+/g, '');
    if (!trimmed) {
      Alert.alert('Телефон', 'Введите номер в международном формате.');
      return;
    }
    setBusy(true);
    try {
      await tdlibClient.send({
        '@type': 'setAuthenticationPhoneNumber',
        phone_number: trimmed,
      });
      telegramAccountStore.getState().setPhoneHint(trimmed);
      telegramAccountStore.getState().setAuthStatus('waiting_code');
      await telegramAccountStore.getState().persistSnapshot();
    } catch (e) {
      Alert.alert('TDLib', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const submitCode = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert('Код', 'Введите код из Telegram.');
      return;
    }
    setBusy(true);
    try {
      await tdlibClient.send({
        '@type': 'checkAuthenticationCode',
        code: trimmed,
      });
      telegramAccountStore.getState().setAuthStatus('ready');
      telegramAccountStore.getState().setTelegramUserId(0);
      await telegramAccountStore.getState().persistSnapshot();
      navigation.replace('TelegramDialogs');
    } catch (e) {
      Alert.alert('TDLib', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [code, navigation]);

  const resetTg = useCallback(() => {
    Alert.alert('Сбросить Telegram?', 'Локальные данные сессии будут очищены.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сбросить',
        style: 'destructive',
        onPress: () => {
          void telegramAccountStore.getState().resetTelegramSession();
          telegramAccountStore.getState().setAuthStatus('idle');
        },
      },
    ]);
  }, []);

  const status = telegramAccountStore((s) => s.authStatus);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.chatBackground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
          Telegram
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
          Отдельная учётная запись от Chatus (Loginus). Нативный TDLib на устройстве; после подключения
          libtdjson ответы станут «живыми».
        </Text>

        {apiId == null || !apiHash ? (
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.inputBackgroundSolid,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: colors.textPrimary }}>
              Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH в сборке.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void initTdlib()}
          disabled={busy}
          style={({ pressed }) => ({
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: colors.accent,
            opacity: busy ? 0.6 : pressed ? 0.9 : 1,
            marginBottom: 12,
            alignItems: 'center',
          })}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700' }}>Инициализировать TDLib</Text>
          )}
        </Pressable>

        {status === 'waiting_phone' || status === 'waiting_code' ? (
          <>
            <Text style={{ marginTop: 8, marginBottom: 6, color: colors.textSecondary }}>Телефон</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+7…"
              placeholderTextColor={colors.textSecondaryMuted}
              keyboardType="phone-pad"
              style={{
                borderWidth: 1,
                borderColor: colors.separator,
                borderRadius: 10,
                padding: 12,
                color: colors.textPrimary,
                marginBottom: 12,
              }}
            />
            <Pressable
              onPress={() => void submitPhone()}
              disabled={busy}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: colors.inputBackgroundSolid,
                opacity: pressed ? 0.85 : 1,
                marginBottom: 16,
                alignItems: 'center',
              })}
            >
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Отправить номер</Text>
            </Pressable>

            <Text style={{ marginBottom: 6, color: colors.textSecondary }}>Код</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Код из SMS / Telegram"
              placeholderTextColor={colors.textSecondaryMuted}
              keyboardType="number-pad"
              style={{
                borderWidth: 1,
                borderColor: colors.separator,
                borderRadius: 10,
                padding: 12,
                color: colors.textPrimary,
                marginBottom: 12,
              }}
            />
            <Pressable
              onPress={() => void submitCode()}
              disabled={busy}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: colors.inputBackgroundSolid,
                opacity: pressed ? 0.85 : 1,
                alignItems: 'center',
              })}
            >
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Подтвердить код</Text>
            </Pressable>
          </>
        ) : null}

        <Pressable onPress={resetTg} style={{ marginTop: 24 }}>
          <Text style={{ color: '#E53935', fontWeight: '600' }}>
            Сбросить локальную сессию Telegram
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
