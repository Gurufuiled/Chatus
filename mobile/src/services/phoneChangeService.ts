/**
 * Смена номера телефона: запрос кода (SMS в prod не подключён — см. сервер) и подтверждение.
 */

import { apiPost } from './apiClient';
import type { ApiUser } from './AuthService';

export type PhoneChangeRequestResult = {
  session_id: string;
  expires_at: number;
  /** Только в dev / при PHONE_CHANGE_EXPOSE_CODE на сервере */
  demo_code?: string;
};

export async function requestPhoneChange(newPhone: string): Promise<PhoneChangeRequestResult> {
  const res = await apiPost('/users/me/phone/request', { new_phone: newPhone });
  if (!res.ok) {
    const text = await res.text();
    let message = `Не удалось отправить код: ${res.status}`;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string | string[] };
        const m = parsed?.message;
        message = Array.isArray(m) ? m.join(', ') : (m ?? message);
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  return res.json() as Promise<PhoneChangeRequestResult>;
}

export async function verifyPhoneChange(sessionId: string, code: string): Promise<ApiUser> {
  const res = await apiPost('/users/me/phone/verify', { session_id: sessionId, code });
  if (!res.ok) {
    const text = await res.text();
    let message = `Ошибка подтверждения: ${res.status}`;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string | string[] };
        const m = parsed?.message;
        message = Array.isArray(m) ? m.join(', ') : (m ?? message);
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  return res.json() as Promise<ApiUser>;
}
