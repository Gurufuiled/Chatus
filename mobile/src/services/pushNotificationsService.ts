/**
 * Регистрация Expo Push Token и отправка на API (POST /users/me/push-token).
 * Требует нативной сборки (expo run) и при необходимости EXPO_PUBLIC_EAS_PROJECT_ID в .env.
 */

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiDelete, apiPost } from './apiClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    /** iOS / старые пути */
    shouldShowAlert: true,
    /** Android 13+ и актуальный Expo: иначе push в foreground часто не попадает в шторку и список уведомлений */
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastRegisteredToken: string | null = null;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('chatus_messages', {
    name: 'Сообщения',
    importance: Notifications.AndroidImportance.HIGH,
    /** Имя raw-ресурса без расширения (см. app.json → expo-notifications → sounds). */
    sound: 'message_notification',
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * После успешного входа: разрешения, канал Android, Expo token → бэкенд.
 */
export async function registerPushWithBackendAfterLogin(): Promise<void> {
  if (!Constants.isDevice) {
    return;
  }

  await ensureAndroidChannel();

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
