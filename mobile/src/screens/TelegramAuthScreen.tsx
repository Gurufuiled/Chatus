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
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { getTelegramBuildCredentials, tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters } from '../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import { inboxModeStore } from '../stores/inboxModeStore';
import { telegramAccountStore } from '../stores/telegramAccountStore';

export function TelegramAuthScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const { apiId, apiHash } = useMemo(() => getTelegramBuildCredentials(), []);

  const openTelegramChats = useCallback(() => {
    inboxModeStore.getState().setActiveInbox('telegram');
    navigation.getParent<NavigationProp<MainTabParamList>>()?.navigate('Chats', { screen: 'ChatList' });
  }, [navigation]);

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
      await applyTdlibParameters();
      const auth = await tdlibClient.send({ '@type': 'getAuthorizationState' });
      throwIfTdError(auth);
      const t = (auth as { '@type'?: string })['@type'];
      if (t === 'authorizationStateReady') {
        telegramAccountStore.getState().setAuthStatus('ready');
        await telegramAccountStore.getState().persistSnapshot();
        openTelegramChats();
        return;
      }
      if (t === 'authorizationStateWaitPassword') {
        telegramAccountStore.getState().setAuthStatus('waiting_password');
        await telegramAccountStore.getState().persistSnapshot();
        return;
      }
      telegramAccountStore.getState().setAuthStatus('waiting_phone');
      await telegramAccountStore.getState().persistSnapshot();
    } catch (e) {
      Alert.alert('TDLib', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [apiHash, apiId, openTelegramChats]);

  const submitPhone = useCallback(async () => {
    if (telegramAccountStore.getState().authStatus !== 'waiting_phone') {
      Alert.alert(
        'TDLib',
        'Сначала нажмите «Инициализировать TDLib» и дождитесь успеха (без ошибки в диалоге).',
      );
      return;
    }
    const trimmed = phone.replace(/\s+/g, '');
    if (!trimmed) {
      Alert.alert('Телефон', 'Введите номер в международном формате.');
      return;
    }
    setBusy(true);
    try {
      const phoneRes = await tdlibClient.send({
        '@type': 'setAuthenticationPhoneNumber',
        phone_number: trimmed,
      });
      throwIfTdError(phoneRes);
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
    if (telegramAccountStore.getState().authStatus !== 'waiting_code') {
      Alert.alert('TDLib', 'Сначала отправьте номер и дождитесь запроса кода.');
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert('Код', 'Введите код из Telegram.');
      return;
    }
    setBusy(true);
    try {
      const codeRes = await tdlibClient.send({
        '@type': 'checkAuthenticationCode',
        code: trimmed,
      });
      throwIfTdError(codeRes);
      const auth = await tdlibClient.send({ '@type': 'getAuthorizationState' });
      throwIfTdError(auth);
      const authType = (auth as { '@type'?: string })['@type'];
      if (authType === 'authorizationStateWaitPassword') {
        telegramAccountStore.getState().setAuthStatus('waiting_password');
        await telegramAccountStore.getState().persistSnapshot();
        return;
      }
      if (authType !== 'authorizationStateReady') {
        Alert.alert('Telegram', `Неожиданное состояние после кода: ${authType ?? '?'}`);
        return;
      }
      telegramAccountStore.getState().setAuthStatus('ready');
      telegramAccountStore.getState().setTelegramUserId(0);
      await telegramAccountStore.getState().persistSnapshot();
      openTelegramChats();
    } catch (e) {
      Alert.alert('TDLib', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [code, openTelegramChats]);

  const submitPassword = useCallback(async () => {
    if (telegramAccountStore.getState().authStatus !== 'waiting_password') {
      Alert.alert('TDLib', 'Сначала подтвердите код из SMS / Telegram.');
      return;
    }
    const trimmed = cloudPassword.trim();
    if (!trimmed) {
      Alert.alert('Пароль', 'Введите облачный пароль двухэтапной проверки (настройки Telegram).');
      return;
    }
    setBusy(true);
    try {
      const pwRes = await tdlibClient.send({
        '@type': 'checkAuthenticationPassword',
        password: trimmed,
      });
      throwIfTdError(pwRes);
      const auth = await tdlibClient.send({ '@type': 'getAuthorizationState' });
      throwIfTdError(auth);
      const authType = (auth as { '@type'?: string })['@type'];
      if (authType !== 'authorizationStateReady') {
        Alert.alert('Telegram', `Сессия не готова: ${authType ?? '?'}`);
        return;
      }
      telegramAccountStore.getState().setAuthStatus('ready');
      telegramAccountStore.getState().setTelegramUserId(0);
      await telegramAccountStore.getState().persistSnapshot();
      openTelegramChats();
    } catch (e) {
      Alert.alert('TDLib', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [cloudPassword, openTelegramChats]);

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
          Отдельная учётная запись от Chatus (Loginus). На Android используется TDLib (libtdjson) на устройстве;
          перед первой сборкой выполни из папки mobile: npm run tdlib:fetch-android (см. TDLIB.md).
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

        {apiId != null && apiHash && status !== 'ready' ? (
          <>
            {status !== 'waiting_phone' &&
            status !== 'waiting_code' &&
            status !== 'waiting_password' ? (
              <Text style={{ marginTop: 4, marginBottom: 10, fontSize: 13, color: colors.textSecondary }}>
                Поля ниже доступны сразу; номер можно отправить только после успешной инициализации TDLib.
              </Text>
            ) : null}
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
              disabled={busy || status !== 'waiting_phone'}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: colors.inputBackgroundSolid,
                opacity: busy || status !== 'waiting_phone' ? 0.5 : pressed ? 0.85 : 1,
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
              disabled={busy || status !== 'waiting_code'}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: colors.inputBackgroundSolid,
                opacity: busy || status !== 'waiting_code' ? 0.5 : pressed ? 0.85 : 1,
                alignItems: 'center',
              })}
            >
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Подтвердить код</Text>
            </Pressable>

            <Text style={{ marginTop: 16, marginBottom: 6, color: colors.textSecondary }}>
              Облачный пароль (2FA)
            </Text>
            <Text style={{ marginBottom: 8, fontSize: 12, color: colors.textSecondary }}>
              Если в Telegram включена двухэтапная проверка, после кода введите облачный пароль здесь.
            </Text>
            <TextInput
              value={cloudPassword}
              onChangeText={setCloudPassword}
              placeholder="Пароль из настроек Telegram"
              placeholderTextColor={colors.textSecondaryMuted}
              secureTextEntry
              autoCapitalize="none"
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
              onPress={() => void submitPassword()}
              disabled={busy || status !== 'waiting_password'}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: colors.inputBackgroundSolid,
                opacity: busy || status !== 'waiting_password' ? 0.5 : pressed ? 0.85 : 1,
                alignItems: 'center',
              })}
            >
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Подтвердить пароль 2FA</Text>
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
