/**
 * После авторизации Telegram: сохранить номер в профиль Chatus на сервере,
 * чтобы другие пользователи могли писать в Telegram через unified-чат.
 */
import { apiPost } from './apiClient';
import { authService, apiUserToUserRow, type ApiUser } from './AuthService';
import { authStore } from '../stores/authStore';
import { tdlibClient } from './tdlib/TdlibClient';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { normalizePhoneForTdlib } from '../utils/telegramPhone';

async function readTelegramAuthorizedPhone(): Promise<string | null> {
  try {
    const me = (await tdlibClient.send({ '@type': 'getMe' })) as Record<string, unknown>;
    if (me['@type'] === 'error') return null;
    const raw =
      typeof me.phone_number === 'string'
        ? me.phone_number
        : typeof me.phoneNumber === 'string'
          ? me.phoneNumber
          : '';
    const normalized = normalizePhoneForTdlib(raw);
    if (normalized.replace(/\D/g, '').length >= 10) {
      return normalized;
    }
  } catch {
    /* TDLib not ready */
  }

  const hint = telegramAccountStore.getState().phoneNumberHint;
  if (hint?.trim()) {
    const normalized = normalizePhoneForTdlib(hint);
    if (normalized.replace(/\D/g, '').length >= 10) {
      return normalized;
    }
  }

  return null;
}

function applySyncedUser(apiUser: ApiUser): void {
  void authService.saveUserToLocal(apiUser);
  const token = authStore.getState().accessToken;
  if (token) {
    authStore.getState().setSession(apiUserToUserRow(apiUser), token);
  }
}

/** Идempotent: no-op if Chatus profile already has phone or Telegram phone unavailable. */
export async function syncChatusPhoneFromTelegramAuth(): Promise<void> {
  if (telegramAccountStore.getState().authStatus !== 'ready') {
    return;
  }

  const currentPhone = authStore.getState().user?.phone?.trim();
  if (currentPhone) {
    return;
  }

  const phone = await readTelegramAuthorizedPhone();
  if (!phone) {
    return;
  }

  const res = await apiPost('/users/me/phone/sync-if-empty', { phone });
  if (!res.ok) {
    if (__DEV__) {
      const text = await res.text().catch(() => '');
      console.warn('[syncChatusPhoneFromTelegramAuth] failed:', res.status, text);
    }
    return;
  }

  const apiUser = (await res.json()) as ApiUser;
  applySyncedUser(apiUser);
  if (__DEV__) {
    console.log('[syncChatusPhoneFromTelegramAuth] phone synced to Chatus profile');
  }
}
