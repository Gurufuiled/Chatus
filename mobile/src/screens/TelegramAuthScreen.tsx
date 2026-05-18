import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { getTelegramBuildCredentials, tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters } from '../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import { runTdlibAuthorizationQuery } from '../services/tdlib/tdlibAuthQueue';
import { telegramAccountStore, type TelegramAuthStatus } from '../stores/telegramAccountStore';

function mapTdlibAuthToStore(authType: string | undefined): TelegramAuthStatus {
  switch (authType) {
    case 'authorizationStateReady':
      return 'ready';
    case 'authorizationStateWaitPassword':
      return 'waiting_password';
    case 'authorizationStateWaitCode':
    case 'authorizationStateWaitEmailCode':
    case 'authorizationStateWaitOtherDeviceConfirmation':
      return 'waiting_code';
    case 'authorizationStateWaitPhoneNumber':
    case 'authorizationStateWaitEmailAddress':
    case 'authorizationStateWaitRegistration':
      return 'waiting_phone';
    case 'authorizationStateLoggingOut':
    case 'authorizationStateClosing':
    case 'authorizationStateClosed':
      return 'error';
    default:
      return 'error';
  }
}

/** TDLib ждёт международный номер; «+» для страны нужен. Нормализуем типичный ввод РФ (8… / 7… / 9…). */
function normalizeTelegramPhone(raw: string): string {
  const collapsed = raw.replace(/[\s().-]/g, '').trim();
  if (!collapsed) return '';
  if (collapsed.startsWith('+')) {
    const rest = collapsed.slice(1).replace(/\D/g, '');
    return rest ? `+${rest}` : '';
  }
  const digits = collapsed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }
  return digits ? `+${digits}` : '';
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

function defaultPhoneNumberAuthenticationSettings(): Record<string, unknown> {
  return {
    '@type': 'phoneNumberAuthenticationSettings',
    allow_flash_call: false,
    allow_missed_call: false,
    is_current_phone_number: false,
    /**
     * has_unknown_phone_number: false — не сообщаем TDLib что мы «не знаем» свой номер.
     * Если true на Android — TDLib ждёт SIM-верификацию, которая никогда не приходит
     * в сторонних приложениях → бесконечная загрузка.
     */
    has_unknown_phone_number: false,
    allow_sms_retriever_api: false,
    authentication_tokens: [],
  };
}

export function TelegramAuthScreen() {
  const { colors, resolvedScheme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const firstScreenFocus = useRef(true);
  /** Не уводить в чаты, если пользователь уже ушёл с экрана, а sync завершился позже. */
  const screenFocusedRef = useRef(false);

  const { apiId, apiHash } = useMemo(() => getTelegramBuildCredentials(), []);
  const isLight = resolvedScheme === 'light';

  const ui = useMemo(() => {
    const label = isLight ? '#4A5568' : colors.textSecondary;
    const hint = isLight ? '#5A6578' : colors.textSecondary;
    const placeholder = isLight ? 'rgba(0,0,0,0.38)' : colors.textSecondaryMuted;
    const fieldBg = isLight ? '#FFFFFF' : colors.inputBackgroundSolid;
    const border = isLight ? '#B8C0CC' : colors.separator;
    const secondaryBtnBg = isLight ? '#E8EDF4' : colors.inputBackgroundSolid;
    return { label, hint, placeholder, fieldBg, border, secondaryBtnBg };
  }, [colors, isLight]);

  const openTelegramChats = useCallback(() => {
    navigation.getParent<NavigationProp<MainTabParamList>>()?.navigate('Chats', { screen: 'ChatList' });
  }, [navigation]);

  const syncAuthorizationFromTdlib = useCallback(async (): Promise<TelegramAuthStatus> => {
    if (apiId == null || !apiHash) {
      return telegramAccountStore.getState().authStatus;
    }
    await applyTdlibParameters();
    let auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as { '@type'?: string };
    throwIfTdError(auth);
    let t = auth['@type'];
    if (t === 'authorizationStateWaitTdlibParameters') {
      await applyTdlibParameters();
      auth = (await tdlibClient.send({ '@type': 'getAuthorizationState' })) as { '@type'?: string };
      throwIfTdError(auth);
      t = auth['@type'];
    }
    if (t === 'authorizationStateWaitTdlibParameters') {
      throw new Error('Не удалось инициализировать Telegram. Перезапустите приложение.');
    }
    if (t === 'authorizationStateReady') {
      telegramAccountStore.getState().setAuthStatus('ready');
      await telegramAccountStore.getState().persistSnapshot();
      if (screenFocusedRef.current) {
        openTelegramChats();
      }
      return 'ready';
    }
    const next = mapTdlibAuthToStore(t);
    telegramAccountStore.getState().setAuthStatus(next);
    await telegramAccountStore.getState().persistSnapshot();
    return next;
  }, [apiHash, apiId, openTelegramChats]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      screenFocusedRef.current = true;
      if (apiId == null || !apiHash) {
        setPreparing(false);
        return () => {
          cancelled = true;
          screenFocusedRef.current = false;
        };
      }
      const showBlockingSpinner = firstScreenFocus.current;
      firstScreenFocus.current = false;
      if (showBlockingSpinner) setPreparing(true);
      void (async () => {
        try {
          setBootstrapError(null);
          await syncAuthorizationFromTdlib();
        } catch (e) {
          if (!cancelled) {
            setBootstrapError(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) setPreparing(false);
        }
      })();
      return () => {
        cancelled = true;
        screenFocusedRef.current = false;
      };
    }, [apiHash, apiId, syncAuthorizationFromTdlib]),
  );

  const submitPhone = useCallback(async () => {
    const trimmed = normalizeTelegramPhone(phone);
    if (!trimmed || trimmed.length < 8) {
      Alert.alert(
        'Телефон',
        'Укажите номер в международном формате: +7 и 10 цифр (например +79881234567). Можно ввести 8 988… или 988… — мы подставим +7.',
      );
      return;
    }
    if (apiId == null || !apiHash) {
      Alert.alert(
        'Нет ключей Telegram API',
        'Для сборки нужны TELEGRAM_API_ID и TELEGRAM_API_HASH (см. mobile/TDLIB.md).',
      );
      return;
    }
    setBusy(true);
    try {
      setBootstrapError(null);

      const currentStatus = telegramAccountStore.getState().authStatus;
      if (currentStatus === 'ready') {
        if (screenFocusedRef.current) openTelegramChats();
        return;
      }
      if (currentStatus === 'waiting_code') {
        Alert.alert('Код уже отправлен', 'Введите код из Telegram или SMS ниже.');
        return;
      }
      if (currentStatus === 'waiting_password') {
        Alert.alert('Нужен пароль 2FA', 'Сначала введите код, затем облачный пароль внизу экрана.');
        return;
      }

      await withTimeout(
        applyTdlibParameters(),
        30000,
        'TDLib не смог инициализировать параметры за 30 с. Перезапустите приложение.',
      );

      const authProbe = (await withTimeout(
        tdlibClient.send({ '@type': 'getAuthorizationState' }) as Promise<unknown>,
        20000,
        'TDLib не ответил на getAuthorizationState за 20 с.',
      )) as { '@type'?: string };
      throwIfTdError(authProbe);
      const probeType = authProbe['@type'];

      if (probeType === 'authorizationStateReady') {
        telegramAccountStore.getState().setAuthStatus('ready');
        await telegramAccountStore.getState().persistSnapshot();
        if (screenFocusedRef.current) openTelegramChats();
        return;
      }
      if (probeType === 'authorizationStateWaitCode' || probeType === 'authorizationStateWaitEmailCode') {
        telegramAccountStore.getState().setAuthStatus('waiting_code');
        await telegramAccountStore.getState().persistSnapshot();
        Alert.alert('Код уже отправлен', 'Введите код из Telegram или SMS ниже.');
        return;
      }
      if (probeType === 'authorizationStateWaitPassword') {
        telegramAccountStore.getState().setAuthStatus('waiting_password');
        await telegramAccountStore.getState().persistSnapshot();
        Alert.alert('Нужен пароль 2FA', 'Сначала введите код, затем облачный пароль внизу экрана.');
        return;
      }
      if (
        probeType !== 'authorizationStateWaitPhoneNumber' &&
        probeType !== 'authorizationStateWaitEmailAddress' &&
        probeType !== 'authorizationStateWaitRegistration'
      ) {
        Alert.alert(
          'Telegram',
          `Не удалось начать вход (состояние: ${probeType ?? '?'}). Закройте экран и откройте снова.`,
        );
        return;
      }

      telegramAccountStore.getState().setAuthStatus('waiting_phone');

      // Проверяем сеть до отправки номера — если TDLib не может достучаться
      // до серверов Telegram, сразу покажем ошибку вместо 4-мин зависания
      try {
        const netResult = (await withTimeout(
          tdlibClient.send({ '@type': 'testNetwork' }) as Promise<unknown>,
          15000,
          'testNetwork timeout',
        )) as { '@type'?: string };
        console.log('[TDLib] testNetwork result:', JSON.stringify(netResult));
        if ((netResult as { '@type'?: string })?.['@type'] !== 'ok') {
          throw new Error(`testNetwork вернул: ${JSON.stringify(netResult)}`);
        }
        console.log('[TDLib] ✅ Telegram серверы достижимы');
      } catch (netErr: unknown) {
        const netMsg = netErr instanceof Error ? netErr.message : String(netErr);
        console.warn('[TDLib] ⚠️ testNetwork FAILED:', netMsg);
        // Не прерываем — попробуем отправить номер всё равно, но логируем
      }

      await runTdlibAuthorizationQuery(async () => {
        /**
         * ВАЖНО: TDLib при обработке setAuthenticationPhoneNumber сначала шлёт
         * updateAuthorizationState { waitCode } (push без @extra), а потом возвращает ok.
         *
         * ПРОБЛЕМА: нативный TdlibModule имеет таймаут 4 минуты (SEND_TIMEOUT_MS).
         * Если он сработал — Promise отклоняется с E_TD_TIMEOUT, но TDLib продолжает
         * работать! При FLOOD_WAIT TDLib ждёт внутри (до 5+ мин) и только потом отвечает.
         *
         * РЕШЕНИЕ: при E_TD_TIMEOUT — НЕ отклонять Promise, продолжать слушать
         * updateAuthorizationState push-события. setBusy(false) не вызывается.
         * Итоговый таймаут 10 минут. Через 30 сек — показываем info-сообщение.
         */
        const result = await new Promise<unknown>((resolve, reject) => {
          let settled = false;
          let nativeTimedOut = false;

          // Итоговый таймаут 10 минут (больше нативного 4-минутного таймаута)
          const totalTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            unsubTdlib();
            reject(
              new Error(
                'Telegram не ответил за 10 минут при отправке номера. ' +
                  'Скорее всего активен FLOOD_WAIT — Telegram временно ' +
                  'заблокировал отправку кода на этот номер (слишком много попыток). ' +
                  'Подождите 30+ минут и повторите.',
              ),
            );
          }, 600_000);

          // Через 30 секунд показываем информацию что ещё ждём
          const slowTimer = setTimeout(() => {
            if (!settled && screenFocusedRef.current) {
              setBootstrapError(
                nativeTimedOut
                  ? 'TDLib ожидает ответа Telegram (возможно FLOOD_WAIT). Не закрывайте экран…'
                  : 'Ожидаем ответа Telegram, это может занять несколько минут…',
              );
            }
          }, 30_000);

          // Слушаем updateAuthorizationState — если TDLib перешёл в waitCode, сразу успех
          const unsubTdlib = tdlibClient.subscribe((json) => {
            if (settled) return;
            try {
              const update = JSON.parse(json) as Record<string, unknown>;
              if (update['@type'] !== 'updateAuthorizationState') return;
              const authState = update['authorization_state'] as Record<string, unknown> | undefined;
              const stateType = authState?.['@type'] as string | undefined;
              if (
                stateType === 'authorizationStateWaitCode' ||
                stateType === 'authorizationStateWaitEmailCode' ||
                stateType === 'authorizationStateWaitOtherDeviceConfirmation' ||
                stateType === 'authorizationStateReady'
              ) {
                settled = true;
                clearTimeout(totalTimer);
                clearTimeout(slowTimer);
                unsubTdlib();
                resolve({ '@type': 'ok', _resolvedBy: 'updateAuthorizationState', _state: stateType });
              } else if (
                stateType === 'authorizationStateLoggingOut' ||
                stateType === 'authorizationStateClosing' ||
                stateType === 'authorizationStateClosed'
              ) {
                settled = true;
                clearTimeout(totalTimer);
                clearTimeout(slowTimer);
                unsubTdlib();
                reject(new Error(`TDLib перешёл в состояние ${stateType} — сессия прервана.`));
              }
            } catch {
              /* ignore parse errors */
            }
          });

          // Отправляем номер — обрабатываем ответ
          void (tdlibClient.send({
            '@type': 'setAuthenticationPhoneNumber',
            phone_number: trimmed,
            settings: defaultPhoneNumberAuthenticationSettings(),
          }) as Promise<unknown>).then(
            (res) => {
              if (settled) return;
              settled = true;
              clearTimeout(totalTimer);
              clearTimeout(slowTimer);
              unsubTdlib();
              resolve(res);
            },
            (err: unknown) => {
              if (settled) return;
              const errCode = (err as { code?: string })?.code ?? '';
              const errMsg = err instanceof Error ? err.message : String(err);

              // E_TD_TIMEOUT = нативный 4-мин таймаут — TDLib ещё работает внутри!
              // Не отклоняем Promise, ждём push-события (до 10 мин итого).
              if (errCode === 'E_TD_TIMEOUT' || errMsg.includes('нет ответа за')) {
                nativeTimedOut = true;
                if (screenFocusedRef.current) {
                  setBootstrapError(
                    'Telegram ещё обрабатывает запрос (возможно FLOOD_WAIT). ' +
                      'Продолжаем ожидание — не нажимайте кнопку снова.',
                  );
                }
                return; // НЕ reject — ждём дальше
              }

              // "Another authorization query has started" — значит TDLib уже начал
              // обрабатывать новый запрос. Ждём updateAuthorizationState push.
              if (errMsg.includes('Another authorization query')) {
                nativeTimedOut = true;
                if (screenFocusedRef.current) {
                  setBootstrapError('TDLib обрабатывает новый запрос авторизации, ожидаем…');
                }
                return; // НЕ reject — ждём push
              }

              // Реальная ошибка (PHONE_NUMBER_INVALID, PHONE_NUMBER_BANNED, и т.д.)
              settled = true;
              clearTimeout(totalTimer);
              clearTimeout(slowTimer);
              unsubTdlib();
              reject(err instanceof Error ? err : new Error(errMsg));
            },
          );
        });

        throwIfTdError(result);
        telegramAccountStore.getState().setPhoneHint(trimmed);
        telegramAccountStore.getState().setAuthStatus('waiting_code');
        await telegramAccountStore.getState().persistSnapshot();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (screenFocusedRef.current) {
        setBootstrapError(msg);
        Alert.alert('Telegram', msg);
      }
    } finally {
      setBusy(false);
    }
  }, [apiHash, apiId, phone, openTelegramChats]);

  const resendAuthCode = useCallback(async () => {
    if (telegramAccountStore.getState().authStatus !== 'waiting_code') return;
    setBusy(true);
    try {
      await runTdlibAuthorizationQuery(async () => {
        if (telegramAccountStore.getState().authStatus !== 'waiting_code') return;
        const r = await withTimeout(
          tdlibClient.send({ '@type': 'resendAuthenticationCode' }) as Promise<unknown>,
          60000,
          'Повторная отправка кода: нет ответа TDLib за 60 с.',
        );
        throwIfTdError(r);
      });
      if (screenFocusedRef.current) {
        Alert.alert(
          'Код',
          'Если сервер разрешил повтор — проверь открытый Telegram на других устройствах и SMS. Иначе подожди таймер в официальном клиенте или попробуй позже.',
        );
      }
    } catch (e) {
      if (screenFocusedRef.current) {
        Alert.alert('Telegram', e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const submitCode = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert('Код', 'Введите код из Telegram или SMS.');
      return;
    }
    setBusy(true);
    try {
      setBootstrapError(null);
      const status = await syncAuthorizationFromTdlib();
      if (status === 'ready') {
        if (screenFocusedRef.current) {
          openTelegramChats();
        }
        return;
      }
      if (status !== 'waiting_code') {
        Alert.alert('Telegram', 'Сначала отправьте номер и дождитесь кода.');
        return;
      }
      await runTdlibAuthorizationQuery(async () => {
        if (telegramAccountStore.getState().authStatus !== 'waiting_code') return;
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
        if (screenFocusedRef.current) {
          openTelegramChats();
        }
      });
    } catch (e) {
      Alert.alert('Telegram', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [code, openTelegramChats, syncAuthorizationFromTdlib]);

  const submitPassword = useCallback(async () => {
    const trimmed = cloudPassword.trim();
    if (!trimmed) {
      Alert.alert('Пароль', 'Введите облачный пароль двухэтапной проверки из настроек Telegram.');
      return;
    }
    setBusy(true);
    try {
      setBootstrapError(null);
      const status = await syncAuthorizationFromTdlib();
      if (status === 'ready') {
        if (screenFocusedRef.current) {
          openTelegramChats();
        }
        return;
      }
      if (status !== 'waiting_password') {
        Alert.alert('Telegram', 'Сначала введите код из Telegram или SMS.');
        return;
      }
      await runTdlibAuthorizationQuery(async () => {
        if (telegramAccountStore.getState().authStatus !== 'waiting_password') return;
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
        if (screenFocusedRef.current) {
          openTelegramChats();
        }
      });
    } catch (e) {
      Alert.alert('Telegram', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [cloudPassword, openTelegramChats, syncAuthorizationFromTdlib]);

  const resetTg = useCallback(() => {
    Alert.alert('Выйти из Telegram?', 'Локальная сессия на этом устройстве будет сброшена.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сбросить',
        style: 'destructive',
        onPress: () => {
          void telegramAccountStore.getState().resetTelegramSession();
        },
      },
    ]);
  }, []);

  const status = telegramAccountStore((s) => s.authStatus);

  const canSendPhone = !preparing && !busy && apiId != null && apiHash && status !== 'ready';
  const phonePrimary =
    status === 'waiting_phone' ||
    status === 'idle' ||
    status === 'error' ||
    status === 'waiting_parameters';

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.chatBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Telegram</Text>
        <Text style={[styles.subtitle, { color: ui.hint }]}>
          Введите номер — код придёт в приложение Telegram (или по SMS). Аккаунт Telegram отдельный от Chatus
          (Loginus).
        </Text>

        {bootstrapError ? (
          <Text style={[styles.errorBanner, { color: '#C62828', backgroundColor: isLight ? '#FFEBEE' : '#3A1F1F' }]}>
            {bootstrapError}
          </Text>
        ) : null}

        {apiId == null || !apiHash ? (
          <View style={[styles.banner, { backgroundColor: ui.fieldBg, borderColor: ui.border }]}>
            <Text style={[styles.bannerText, { color: colors.textPrimary }]}>
              В этой сборке не заданы ключи Telegram API (TELEGRAM_API_ID / TELEGRAM_API_HASH). См. mobile/TDLIB.md.
            </Text>
          </View>
        ) : null}

        {preparing && apiId != null && apiHash ? (
          <View style={styles.preparingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.preparingText, { color: ui.label, marginLeft: 12 }]}>
              Подключение к Telegram…
            </Text>
          </View>
        ) : null}

        {apiId != null && apiHash && status !== 'ready' ? (
          <>
            <Text style={[styles.fieldLabel, { color: ui.label }]}>Номер телефона</Text>
            <Text style={[styles.phoneHint, { color: ui.hint }]}>
              Нужен международный формат: плюс и код страны (+7…). Можно ввести 8 988… или 988… — подставим +7 автоматически.
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+7 900 000-00-00"
              placeholderTextColor={ui.placeholder}
              keyboardType="phone-pad"
              editable={!busy && !preparing}
              style={[
                styles.input,
                {
                  borderColor: ui.border,
                  backgroundColor: ui.fieldBg,
                  color: colors.textPrimary,
                },
              ]}
            />
            <Pressable
              onPress={() => void submitPhone()}
              disabled={!canSendPhone || !phonePrimary}
              style={({ pressed }) => [
                styles.primaryBtn,
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

            <Text style={[styles.fieldLabel, { color: ui.label, marginTop: 20 }]}>Код</Text>
            <Text style={[styles.codeDeliveryHint, { color: ui.hint }]}>
              Обычно код приходит в уже открытый Telegram на другом телефоне или компьютере. Если других сессий нет —
              придёт SMS на этот номер (не «сообщения» от оператора).
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Цифры из Telegram или SMS"
              placeholderTextColor={ui.placeholder}
              keyboardType="number-pad"
              editable={!busy && !preparing}
              style={[
                styles.input,
                {
                  borderColor: ui.border,
                  backgroundColor: ui.fieldBg,
                  color: colors.textPrimary,
                },
              ]}
            />
            <Pressable
              onPress={() => void resendAuthCode()}
              disabled={busy || preparing || status !== 'waiting_code'}
              style={{ marginBottom: 10 }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: busy || preparing || status !== 'waiting_code' ? ui.placeholder : colors.accent,
                  fontWeight: '600',
                }}
              >
                Отправить код ещё раз
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void submitCode()}
              disabled={busy || preparing || status !== 'waiting_code'}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  backgroundColor: ui.secondaryBtnBg,
                  opacity: busy || preparing || status !== 'waiting_code' ? 0.45 : pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.accent }]}>Войти с этим кодом</Text>
            </Pressable>

            <Text style={[styles.fieldLabel, { color: ui.label, marginTop: 20 }]}>
              Облачный пароль (если включена 2FA)
            </Text>
            <Text style={[styles.hintSmall, { color: ui.hint }]}>
              Только если в Telegram включена двухэтапная проверка — после кода запросит пароль.
            </Text>
            <TextInput
              value={cloudPassword}
              onChangeText={setCloudPassword}
              placeholder="Пароль из настроек Telegram"
              placeholderTextColor={ui.placeholder}
              secureTextEntry
              autoCapitalize="none"
              editable={!busy && !preparing}
              style={[
                styles.input,
                {
                  borderColor: ui.border,
                  backgroundColor: ui.fieldBg,
                  color: colors.textPrimary,
                },
              ]}
            />
            <Pressable
              onPress={() => void submitPassword()}
              disabled={busy || preparing || status !== 'waiting_password'}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  backgroundColor: ui.secondaryBtnBg,
                  opacity: busy || preparing || status !== 'waiting_password' ? 0.45 : pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.accent }]}>Подтвердить пароль 2FA</Text>
            </Pressable>
          </>
        ) : null}

        <Pressable onPress={resetTg} style={styles.resetWrap} hitSlop={12}>
          <Text style={styles.resetText}>Сбросить сессию Telegram на устройстве</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  errorBanner: {
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    overflow: 'hidden',
  },
  banner: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  preparingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  preparingText: { fontSize: 15, fontWeight: '500' },
  fieldLabel: { marginBottom: 8, fontSize: 14, fontWeight: '600' },
  phoneHint: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  codeDeliveryHint: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  hintSmall: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 15 },
  resetWrap: { marginTop: 28 },
  resetText: { color: '#E53935', fontWeight: '600', fontSize: 15 },
});
