import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import {
  applyTdlibParameters,
  scheduleBackgroundTdlibRecovery,
  waitForTdlibAuthorizationReady,
} from '../services/tdlib/tdlibBootstrap';
import { probeTdlibAuthStatus } from '../services/tdlib/tdlibAuthState';
import {
  notifyTelegramInboundMessagePreview,
  registerTelegramAndroidPushWithTdlib,
} from '../services/pushNotificationsService';
import { tdlibMessagePreviewFromContent } from '../services/telegramTdlibNotificationHelpers';
import { getNestedRecord } from '../screens/telegramChat/tdlibMapping';
import { patchDialogsWithTdlibFile } from '../screens/telegramChat/telegramFileUpdates';
import { loadChatRow } from '../screens/telegramChat/telegramDialogsLoader';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { telegramUiStore } from '../stores/telegramUiStore';
import { syncChatusPhoneFromTelegramAuth } from '../services/telegramChatusPhoneSync';

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

    const reconcileAuthStatus = async () => {
      const store = telegramAccountStore.getState();
      if (store.authStatus === 'idle') return;
      try {
        const { status } = await probeTdlibAuthStatus(store.authStatus);
        if (status !== store.authStatus) {
          store.setAuthStatus(status);
          if (status === 'ready') {
            syncChatusPhoneFromTelegramAuth().catch(console.error);
          }
          scheduleAuthPersist();
        }
      } catch (e) {
        if (__DEV__) console.warn('[tdlib-notify] auth reconcile failed', e);
      }
    };

    void reconcileAuthStatus();

    unsubTd = tdlibClient.subscribe((update) => {
      try {
        if (update['@type'] === 'updateAuthorizationState') {
          const authState = update['authorization_state'] as Record<string, unknown> | undefined;
          const stateType = authState?.['@type'] as string | undefined;
          if (__DEV__) {
            console.log('[tdlib-notify] updateAuthorizationState ->', stateType);
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
            case 'authorizationStateWaitOtherDeviceConfirmation':
              if (store.authStatus !== 'waiting_code') {
                store.setAuthStatus('waiting_code');
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
              if (
                store.authStatus !== 'waiting_code' &&
                store.authStatus !== 'waiting_password' &&
                store.authStatus !== 'ready'
              ) {
                store.setAuthStatus('waiting_phone');
                scheduleAuthPersist();
              }
              break;
            case 'authorizationStateClosing':
            case 'authorizationStateLoggingOut':
            case 'authorizationStateClosed':
              // Never flip ready → error on transient close; recover quietly in background.
              if (store.authStatus === 'ready') {
                scheduleBackgroundTdlibRecovery();
              } else {
                void reconcileAuthStatus();
              }
              break;
            default:
              break;
          }
          return;
        }

        if (update['@type'] === 'updateFile') {
          const file = getNestedRecord(update.file);
          if (!file) return;
          const store = telegramAccountStore.getState();
          const patched = patchDialogsWithTdlibFile(store.dialogs, file);
          if (patched !== store.dialogs) {
            store.setDialogs(patched);
          }
          return;
        }

        if (update['@type'] === 'updateChatPhoto') {
          const chatId = typeof update.chat_id === 'number' ? update.chat_id : null;
          if (chatId == null) return;
          void (async () => {
            const store = telegramAccountStore.getState();
            const prev = store.dialogs.find((d) => d.chatId === String(chatId));
            try {
              const row = await loadChatRow(chatId, prev);
              store.setDialogs(
                store.dialogs.map((d) => (d.chatId === String(chatId) ? row : d)),
              );
            } catch {
              /* best-effort */
            }
          })();
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
        if (__DEV__) console.warn('[tdlib-notify] subscribe parse', e);
      }
    });

    return () => {
      if (persistAuthDebounce) clearTimeout(persistAuthDebounce);
      unsubTd?.();
      unsubAuth?.();
    };
  }, [isAuthenticated]);

  return null;
}
