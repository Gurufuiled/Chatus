import { useEffect } from 'react';
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

/**
 * Глобально: входящие TDLib → превью в шторку (фон), регистрация FCM в Telegram после авторизации.
 */
export function TelegramTdlibNotificationListener() {
  useEffect(() => {
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
      }
    });
    if (telegramAccountStore.getState().authStatus === 'ready') {
      void tryRegisterFcm();
    }

    unsubTd = tdlibClient.subscribe((json) => {
      try {
        const update = JSON.parse(json) as Record<string, unknown>;
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
      unsubTd?.();
      unsubAuth?.();
    };
  }, []);

  return null;
}
