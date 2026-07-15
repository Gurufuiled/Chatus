import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import {
  applyTdlibParameters,
  cancelBackgroundTdlibRecovery,
  clearTdlibLoggingOutExpectation,
  getTdlibClientIdentity,
  isExpectingEmptyTdlibDatabaseAfterLogout,
  isTdlibRecoveryInFlight,
  markTdlibLoggingOut,
  scheduleBackgroundTdlibRecovery,
  shouldClearStickyTelegramSession,
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
import { logTdlibEvent } from '../services/clientRemoteLog';

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
      try {
        // Always probe — including idle — so an on-disk TDLib session can restore after
        // SecureStore miss / crash without forcing the user through SMS again.
        const probeFrom =
          store.authStatus === 'idle' && store.telegramUserId != null
            ? 'ready'
            : store.authStatus;
        const { status } = await probeTdlibAuthStatus(probeFrom);
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
          const isInteresting =
            stateType === 'authorizationStateClosed' ||
            stateType === 'authorizationStateClosing' ||
            stateType === 'authorizationStateLoggingOut' ||
            stateType === 'authorizationStateWaitTdlibParameters' ||
            stateType === 'authorizationStateReady';
          if (isInteresting || stateType?.startsWith('authorizationStateWait')) {
            logTdlibEvent(`auth ${stateType ?? 'unknown'}`, {
              level:
                stateType === 'authorizationStateClosed' ||
                stateType === 'authorizationStateClosing'
                  ? 'warn'
                  : 'info',
              data: { prevStatus: telegramAccountStore.getState().authStatus },
              flushSoon:
                stateType === 'authorizationStateClosed' ||
                stateType === 'authorizationStateClosing',
            });
          }
          const store = telegramAccountStore.getState();
          switch (stateType) {
            case 'authorizationStateReady':
              clearTdlibLoggingOutExpectation();
              logTdlibEvent('auth Ready identity', {
                level: 'info',
                data: {
                  ...getTdlibClientIdentity(),
                  prevStatus: store.authStatus,
                },
                flushSoon: true,
              });
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
              // Never drop a Ready session back to phone entry — only Settings logout does.
              // Transient WaitPhone while DB opens after recreate must not stack recoveries.
              if (store.authStatus === 'ready' || store.telegramUserId != null) {
                void (async () => {
                  const live = stateType ?? null;
                  if (!(await shouldClearStickyTelegramSession(live))) {
                    if (!isTdlibRecoveryInFlight()) {
                      scheduleBackgroundTdlibRecovery();
                    }
                    return;
                  }
                  // Re-check after await — avoid wiping a session that recovered meanwhile.
                  const now = telegramAccountStore.getState();
                  if (!now.hasLocalSession()) {
                    clearTdlibLoggingOutExpectation();
                    return;
                  }
                  if (!(await shouldClearStickyTelegramSession(live))) return;
                  logTdlibEvent('WaitPhone + empty/logout — clear sticky session', {
                    level: 'warn',
                    flushSoon: true,
                  });
                  await now.clearLocalTelegramSession();
                  clearTdlibLoggingOutExpectation();
                })();
                break;
              }
              if (
                store.authStatus !== 'waiting_code' &&
                store.authStatus !== 'waiting_password'
              ) {
                store.setAuthStatus('waiting_phone');
                scheduleAuthPersist();
              }
              break;
            case 'authorizationStateClosing':
              // Closing alone is not a DB wipe — cancel pending recover, but do not arm logout flag.
              cancelBackgroundTdlibRecovery();
              break;
            case 'authorizationStateLoggingOut':
              // LoggingOut wipes the TDLib DB — do NOT schedule recover (empty DB + sticky Ready
              // loops forever on "переподключается").
              markTdlibLoggingOut();
              if (store.hasLocalSession()) {
                logTdlibEvent('auth LoggingOut — will clear sticky after Closed', {
                  level: 'warn',
                  data: { prevStatus: store.authStatus },
                  flushSoon: true,
                });
              }
              break;
            case 'authorizationStateClosed':
              void (async () => {
                if (!store.hasLocalSession() && !isExpectingEmptyTdlibDatabaseAfterLogout()) {
                  void reconcileAuthStatus();
                  return;
                }
                if (await shouldClearStickyTelegramSession('authorizationStateClosed')) {
                  const now = telegramAccountStore.getState();
                  if (!now.hasLocalSession() && !isExpectingEmptyTdlibDatabaseAfterLogout()) {
                    clearTdlibLoggingOutExpectation();
                    return;
                  }
                  logTdlibEvent('auth Closed + empty/logout — clear sticky session', {
                    level: 'warn',
                    flushSoon: true,
                  });
                  await now.clearLocalTelegramSession();
                  clearTdlibLoggingOutExpectation();
                  return;
                }
                if (!isTdlibRecoveryInFlight()) {
                  scheduleBackgroundTdlibRecovery();
                }
              })();
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
