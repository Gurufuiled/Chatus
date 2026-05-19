/**
 * Регистрация Expo Push Token и отправка на API (POST /users/me/push-token).
 * Локальные уведомления в системную шторку Android при входящих в фоне.
 * Требует нативной сборки (expo run) и при необходимости EXPO_PUBLIC_EAS_PROJECT_ID в .env.
 *
 * Android: маленькая иконка в статусе — монохром (см. assets/notification_icon_small.png + expo-notifications в app.json);
 * крупная картинка в шторке для локальных уведомлений — large_notification_icon из плагина withAndroidNotificationLargeIcon.
 *
 * Важно: локальные уведомления (scheduleNotificationAsync) работают только пока живёт процесс
 * приложения (свёрнуто). После полного закрытия процесса показ идёт только через серверный
 * Expo Push (FCM) — см. PushService.notifyNewMessage на бэкенде. Картинка отправителя в remote push — richContent.image (лучше HTTPS).
 */

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { apiDelete, apiPost } from './apiClient';
import { tdlibClient } from './tdlib/TdlibClient';
import { throwIfTdError } from './tdlib/tdlibErrors';
import type { PushNotificationData } from '../stores/uiStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';

/**
 * Реальный телефон для push: `Constants.isDevice` на части Android (в т.ч. Xiaomi) даёт false —
 * тогда Expo push и FCM для Telegram не регистрировались бы. На Android всё равно пробуем
 * (на эмуляторе `getExpoPushTokenAsync` / `getDevicePushTokenAsync` просто упадут/вернут пусто).
 */
function shouldAttemptPushRegistration(): boolean {
  if (Constants.isDevice) return true;
  return Platform.OS === 'android';
}

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
  /** Один слот на чат: повторная доставка заменяет предыдущее уведомление (как `tag` в FCM). */
  trayIdentifier?: string;
}): Promise<void> {
  if (AppState.currentState === 'active') return;

  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return;

  if (Platform.OS === 'android') {
    await ensureAndroidPushChannels();
  }

  const chatId =
    typeof input.data.chat_id === 'string' && input.data.chat_id.trim().length > 0
      ? input.data.chat_id.trim()
      : undefined;
  const telegramChatId =
    typeof input.data.telegram_chat_id === 'string' &&
    input.data.telegram_chat_id.trim().length > 0
      ? input.data.telegram_chat_id.trim()
      : undefined;
  const identifier =
    input.trayIdentifier ??
    (chatId
      ? `chatus-tray-${chatId}`
      : telegramChatId
        ? `telegram-tray-${telegramChatId}`
        : `tray-${Date.now()}`);

  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: input.title,
        body: input.body.slice(0, 400),
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
  const row = chatStore.getState().chats.find((c) => c.id === data.chatId);
  const unread = Math.max(0, row?.unread_count ?? 0);
  const tail = unread > 1 ? `\nи ещё ${unread - 1}` : '';
  const body = `${data.messagePreview}${tail}`.slice(0, 400);
  await tryPostInboundSystemTrayNotification({
    title: data.title,
    body,
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
 * @returns `true` если не Android, разрешений нет (не ошибка TDLib), токен уже зарегистрирован,
 * или TDLib ответил без ошибки. `false` — сеть/TDLib ошибка (можно повторить).
 */
export async function registerTelegramAndroidPushWithTdlib(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

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
 * После успешного входа: разрешения, канал Android, Expo token + FCM token → бэкенд.
 * FCM token (нативный) нужен серверу для прямой отправки через Firebase Admin SDK —
 * это единственный способ показать уведомление при полностью убитом процессе приложения.
 */
export async function registerPushWithBackendAfterLogin(): Promise<void> {
  if (!shouldAttemptPushRegistration()) {
    console.warn('[push] skip registration (Expo reports non-device; iOS simulator?)');
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
    console.warn(
      '[push] notifications permission not granted; skip POST /users/me/push-token',
    );
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
  } catch (e) {
    console.warn(
      '[push] getExpoPushTokenAsync failed; skip POST /users/me/push-token',
      e,
    );
    return;
  }

  // Нативный FCM device token (Android) — для прямой доставки через Firebase Admin SDK
  let fcmToken: string | undefined;
  if (Platform.OS === 'android') {
    try {
      const deviceRes = await Notifications.getDevicePushTokenAsync();
      if (deviceRes.type === 'android' && typeof deviceRes.data === 'string') {
        fcmToken = deviceRes.data.trim() || undefined;
      }
    } catch (e) {
      console.warn('[push] getDevicePushTokenAsync failed (non-critical)', e);
    }
  }

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    const body: Record<string, unknown> = {
      expo_token: expoToken,
      platform,
    };
    if (fcmToken) {
      body.fcm_token = fcmToken;
    }
    const r = await apiPost('/users/me/push-token', body);
    if (!r.ok) {
      const text = (await r.text().catch(() => '')).slice(0, 400);
      console.warn('[push] POST /users/me/push-token failed', r.status, text);
      return;
    }
  } catch (e) {
    console.warn('[push] POST /users/me/push-token threw (network?)', e);
    return;
  }

  lastRegisteredToken = expoToken;
  if (__DEV__) {
    console.log('[push] Expo token registered with backend', fcmToken ? '(+ FCM token)' : '');
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
