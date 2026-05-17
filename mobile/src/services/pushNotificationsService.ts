/**
 * Регистрация Expo Push Token и отправка на API (POST /users/me/push-token).
 * Локальные уведомления в системную шторку Android при входящих в фоне.
 * Требует нативной сборки (expo run) и при необходимости EXPO_PUBLIC_EAS_PROJECT_ID в .env.
 */

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { apiDelete, apiPost } from './apiClient';
import { tdlibClient } from './tdlib/TdlibClient';
import { throwIfTdError } from './tdlib/tdlibErrors';
import type { PushNotificationData } from '../stores/uiStore';
import { uiStore } from '../stores/uiStore';

export const ANDROID_CHANNEL_CHATUS = 'chatus_messages';
export const ANDROID_CHANNEL_TELEGRAM = 'telegram_messages';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastRegisteredToken: string | null = null;
/** TDLib `registerDevice` succeeded for this FCM token (token rotation → register again). */
let lastRegisteredTelegramFcmToken: string | null = null;

function channelBase(name: string) {
  return {
    name,
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250] as [number, ...number[]],
    sound: 'message_notification' as const,
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  };
}

/** Создать каналы до запроса разрешений (Android 13+) и для FCM/Expo payload `channelId`. */
export async function ensureAndroidPushChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_CHATUS, {
    ...channelBase('Сообщения Chatus'),
    description: 'Новые сообщения в аккаунте Chatus',
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_TELEGRAM, {
    ...channelBase('Telegram'),
    description: 'Входящие в привязанном Telegram-аккаунте',
  });
}

/**
 * Локальное уведомление в шторку, когда приложение не на переднем плане
 * (иначе остаётся только in-app баннер из `InAppPushNotification`).
 */
export async function tryPostInboundSystemTrayNotification(input: {
  title: string;
  body: string;
  channelId: string;
  data: Record<string, unknown>;
}): Promise<void> {
  if (AppState.currentState === 'active') return;

  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return;

  if (Platform.OS === 'android') {
    await ensureAndroidPushChannels();
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body.slice(0, 220),
        data: input.data,
        sound: Platform.OS === 'android' ? undefined : 'message_notification.wav',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: { channelId: input.channelId },
    });
  } catch (e) {
    console.warn('[push] scheduleNotificationAsync failed', e);
  }
}

/** In-app баннер + при необходимости системная шторка (фон). */
export async function notifyChatusInboundMessagePreview(
  data: Omit<PushNotificationData, 'id'>,
): Promise<void> {
  uiStore.getState().showPushNotification(data);
  await tryPostInboundSystemTrayNotification({
    title: data.title,
    body: data.messagePreview,
    channelId: ANDROID_CHANNEL_CHATUS,
    data: {
      kind: 'chatus_message',
      chat_id: data.chatId,
    },
  });
}

export async function notifyTelegramInboundMessagePreview(input: {
  telegramChatId: string;
  title: string;
  body: string;
}): Promise<void> {
  await tryPostInboundSystemTrayNotification({
    title: input.title,
    body: input.body,
    channelId: ANDROID_CHANNEL_TELEGRAM,
    data: {
      kind: 'telegram_message',
      telegram_chat_id: input.telegramChatId,
    },
  });
}

/**
 * Регистрация FCM device token в Telegram (TDLib `registerDevice`).
 * Нужен Server key в [my.telegram.org](https://my.telegram.org) для вашего `api_id`.
 *
 * @returns `true` если нечего делать (не Android / не девайс), разрешений нет (не ошибка TDLib),
 * токен уже зарегистрирован, или TDLib ответил без ошибки. `false` — сеть/TDLib ошибка (можно повторить).
 */
export async function registerTelegramAndroidPushWithTdlib(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Constants.isDevice) return true;

  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return false;

  await ensureAndroidPushChannels();

  let token: string;
  try {
    const res = await Notifications.getDevicePushTokenAsync();
    if (res.type !== 'android') return false;
    token = typeof res.data === 'string' ? res.data : '';
  } catch {
    return false;
  }
  const tokenTrim = token.trim();
  if (!tokenTrim) return false;
  if (lastRegisteredTelegramFcmToken === tokenTrim) return true;

  try {
    const response = (await tdlibClient.send({
      '@type': 'registerDevice',
      device_token: {
        '@type': 'deviceTokenFirebaseCloudMessaging',
        token: tokenTrim,
      },
      other_user_ids: [],
    })) as Record<string, unknown>;
    throwIfTdError(response);
    lastRegisteredTelegramFcmToken = tokenTrim;
    return true;
  } catch (e) {
    console.warn('[push] TDLib registerDevice (FCM) failed', e);
    return false;
  }
}

/** Сброс кэша успешной TDLib FCM-регистрации (выход из Telegram / смена аккаунта). */
export function resetTelegramPushRegistrationFlag(): void {
  lastRegisteredTelegramFcmToken = null;
}

/**
 * После успешного входа: разрешения, канал Android, Expo token → бэкенд.
 */
export async function registerPushWithBackendAfterLogin(): Promise<void> {
  if (!Constants.isDevice) {
    return;
  }

  await ensureAndroidPushChannels();

  const perm = await Notifications.getPermissionsAsync();
  let status = perm.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    return;
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId ?? undefined;

  let expoToken: string;
  try {
    const res = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    expoToken = res.data;
  } catch {
    return;
  }

  lastRegisteredToken = expoToken;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const r = await apiPost('/users/me/push-token', {
    expo_token: expoToken,
    platform,
  });
  if (!r.ok) {
    lastRegisteredToken = null;
  }
}

/** Снять токен с сервера при выходе (не критично при ошибке). */
export async function unregisterPushOnLogout(): Promise<void> {
  if (!lastRegisteredToken) return;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    await apiDelete('/users/me/push-token', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expo_token: lastRegisteredToken,
        platform,
      }),
    });
  } catch {
    // ignore
  }
  lastRegisteredToken = null;
}
