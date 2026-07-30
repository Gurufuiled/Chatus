import { Alert } from 'react-native';
import type { TelegramAuthStatus } from '../../stores/telegramAccountStore';

export type AuthWizardStep = 'phone' | 'code' | 'password';

const WIZARD_STEPS: AuthWizardStep[] = ['phone', 'code', 'password'];

export function resolveAuthWizardStep(status: TelegramAuthStatus): AuthWizardStep {
  if (status === 'waiting_password') return 'password';
  if (status === 'waiting_code') return 'code';
  // QR has its own card on the phone step; never display the confirmation-code form.
  if (status === 'waiting_qr') return 'phone';
  return 'phone';
}

export function getAuthWizardStepIndex(step: AuthWizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export type TelegramSettingsConnectionMeta = {
  subtitle: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
};

export function getTelegramSettingsConnectionMeta(
  status: TelegramAuthStatus,
): TelegramSettingsConnectionMeta {
  switch (status) {
    case 'ready':
      return {
        subtitle: 'Подключено · нажмите, чтобы выйти',
        badge: 'В сети',
        badgeBg: '#2E7D4A22',
        badgeText: '#2E7D4A',
      };
    case 'waiting_password':
      return {
        subtitle: 'Нужен облачный пароль 2FA',
        badge: '2FA',
        badgeBg: '#F59E0B22',
        badgeText: '#B45309',
      };
    case 'waiting_code':
      return {
        subtitle: 'Введите код из Telegram',
        badge: 'Код',
        badgeBg: '#3B82F622',
        badgeText: '#2563EB',
      };
    case 'waiting_qr':
      return {
        subtitle: 'Подтвердите вход на другом устройстве',
        badge: 'QR',
        badgeBg: '#3B82F622',
        badgeText: '#2563EB',
      };
    case 'error':
      return {
        subtitle: 'Ошибка входа',
        badge: 'Ошибка',
        badgeBg: '#E5393522',
        badgeText: '#C62828',
      };
    default:
      return {
        subtitle: 'Войти по номеру телефона',
        badge: 'Вход',
        badgeBg: '#64748B22',
        badgeText: '#64748B',
      };
  }
}

export function showCodeDeliveryInfo(): void {
  Alert.alert(
    'Где взять код?',
    'Обычно код приходит в открытый Telegram на другом устройстве. Если других сессий нет — придёт SMS на указанный номер.',
  );
}
