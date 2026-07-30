import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../services/tdlib/tdlibBootstrap';
import {
  notifyTelegramInboundMessagePreview,
  registerTelegramAndroidPushWithTdlib,
} from '../services/pushNotificationsService';
import { tdlibMessagePreviewFromContent } from '../services/telegramTdlibNotificationHelpers';
import { getNestedRecord } from '../screens/telegramChat/tdlibMapping';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { telegramUiStore } from '../stores/telegramUiStore';
import { syncChatusPhoneFromTelegramAuth } from '../services/telegramChatusPhoneSync';
import { logTdlibEvent, scheduleTdlibLogFlush } from '../services/clientRemoteLog';

/**
 * Глобально: входящие TDLib → превью в шторку (фон), регистрация FCM в Telegram после авторизации.
 * Также слушает updateAuthorizationState и синхронизирует стор немедленно — без polling'а.
 */
export function TelegramTdlibNotificationListener() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    let unsubTd: (() => void) | undefined;
    let unsubAuth: (() => void) | undefined;

    const tryRegisterFcm = async () => {
      await applyTdlibParameters();
      const { ready } = await waitForTdlibAuthorizationReady();
      if (!ready) return;
      let ok = await registerTelegramAndroidPushWithTdlib();
      if (!ok) {
        await new Promise<void>((r) => setTimeout(r, 2500));
        ok = await registerTelegramAndroidPushWithTdlib();
      }
      if (!ok && __DEV__) {
        console.warn('[tdlib-notify] registerTelegramAndroidPushWithTdlib failed after retry');
      }
    };

    unsubAuth = telegramAccountStore.subscribe((state, prev) => {
      if (state.authStatus === 'ready' && prev?.authStatus !== 'ready') {
        void tryRegisterFcm();
        syncChatusPhoneFromTelegramAuth().catch(console.error);
      }
    });
    if (telegramAccountStore.getState().authStatus === 'ready') {
      void tryRegisterFcm();
      syncChatusPhoneFromTelegramAuth().catch(console.error);
    }

    let persistAuthDebounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleAuthPersist = () => {
      if (persistAuthDebounce) clearTimeout(persistAuthDebounce);
      persistAuthDebounce = setTimeout(() => {
        persistAuthDebounce = null;
        void telegramAccountStore.getState().persistSnapshot();
      }, 400);
    };

    unsubTd = tdlibClient.subscribe((update) => {
      try {
        // Синхронизируем стор при получении push-события об изменении авторизации
        if (update['@type'] === 'updateAuthorizationState') {
          const authState = update['authorization_state'] as Record<string, unknown> | undefined;
          const stateType = authState?.['@type'] as string | undefined;
          if (__DEV__) {
            console.log('[tdlib-notify] updateAuthorizationState ->', stateType);
          }
          if (stateType) {
            const terminal =
              stateType === 'authorizationStateReady' ||
              stateType === 'authorizationStateLoggingOut' ||
              stateType === 'authorizationStateClosing' ||
              stateType === 'authorizationStateClosed';
            logTdlibEvent('authorization state', {
              level: terminal && stateType !== 'authorizationStateReady' ? 'error' : 'info',
              data: { state: stateType },
              flushSoon: terminal,
            });
          }
          const store = telegramAccountStore.getState();
          switch (stateType) {
            case 'authorizationStateReady':
              if (store.authStatus !== 'ready') {
                store.setAuthStatus('ready');
                scheduleAuthPersist();
                syncChatusPhoneFromTelegramAuth().catch(console.error);
              }
              break;
            case 'authorizationStateWaitCode':
            case 'authorizationStateWaitEmailCode':
              if (store.authStatus !== 'waiting_code') {
                store.setAuthStatus('waiting_code');
                scheduleAuthPersist();
              }
              break;
            case 'authorizationStateWaitOtherDeviceConfirmation':
              if (store.authStatus !== 'waiting_qr') {
                store.setAuthStatus('waiting_qr');
                scheduleAuthPersist();
              }
              break;
            case 'authorizationStateWaitPassword':
              if (store.authStatus !== 'waiting_password') {
                store.setAuthStatus('waiting_password');
                scheduleAuthPersist();
              }
              break;
            case 'authorizationStateWaitPhoneNumber':
            case 'authorizationStateWaitEmailAddress':
            case 'authorizationStateWaitRegistration':
              // Во время активного ввода кода/пароля не откатываем шаг назад из-за гонки,
              // но после завершения/сброса auth-flow позволяем вернуться на телефон.
              if (
                store.authStatus !== 'waiting_code' &&
                store.authStatus !== 'waiting_password' &&
                store.authStatus !== 'ready'
              ) {
                store.setAuthStatus('waiting_phone');
                scheduleAuthPersist();
              }
              break;
            case 'authorizationStateLoggingOut':
            case 'authorizationStateClosing':
            case 'authorizationStateClosed':
              if (store.authStatus !== 'error') {
                store.setAuthStatus('error');
                scheduleAuthPersist();
              }
              break;
            default:
              break;
          }
          return;
        }

        if (update['@type'] !== 'updateNewMessage') return;
        const message = getNestedRecord(update.message);
        if (!message || message.is_outgoing === true) return;
        const chatIdNum = typeof message.chat_id === 'number' ? message.chat_id : null;
        if (chatIdNum == null) return;
        const chatKey = String(chatIdNum);
        const active = telegramUiStore.getState().activeTelegramChatId;
        if (active != null && active === chatKey) return;

        const content = getNestedRecord(message.content);
        const preview = tdlibMessagePreviewFromContent(content ?? undefined);
        const row = telegramAccountStore.getState().dialogs.find((d) => d.chatId === chatKey);
        const title = row?.title?.trim() || 'Telegram';
        void notifyTelegramInboundMessagePreview({
          telegramChatId: chatKey,
          title,
          body: preview,
        });
      } catch (e) {
        logTdlibEvent('authorization update handling failed', {
          level: 'error',
          data: { error: e instanceof Error ? e.message : String(e) },
          flushSoon: true,
        });
        if (__DEV__) console.warn('[tdlib-notify] subscribe parse', e);
      }
    });
    scheduleTdlibLogFlush();

    return () => {
      if (persistAuthDebounce) clearTimeout(persistAuthDebounce);
      unsubTd?.();
      unsubAuth?.();
    };
  }, [isAuthenticated]);

  return null;
}
