import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { telegramAccountStore } from '../../stores/telegramAccountStore';
import { refreshTelegramDialogs } from './telegramDialogsLoader';

export function useTelegramDialogsRefresh(enabled: boolean) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await refreshTelegramDialogs();
  }, [enabled]);

  const scheduleRefresh = useCallback(() => {
    if (!enabled) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void refresh();
    }, 500);
  }, [enabled, refresh]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      void refresh();
      const unsub = tdlibClient.subscribe((u) => {
        try {
          const t = (u['@type'] as string | undefined) ?? '';
          if (t === 'updateChatReadInbox') {
            const chatIdNum = typeof u.chat_id === 'number' ? u.chat_id : null;
            const unread =
              typeof u.unread_count === 'number' && Number.isFinite(u.unread_count)
                ? u.unread_count
                : 0;
            if (chatIdNum != null) {
              telegramAccountStore.getState().patchDialog(String(chatIdNum), { unreadCount: unread });
            }
          }
          if (
            t === 'updateNewChat' ||
            t === 'updateChatLastMessage' ||
            t === 'updateChatPosition' ||
            t === 'updateChatReadInbox' ||
            t === 'updateChatTitle' ||
            t === 'updateDeleteMessages'
          ) {
            scheduleRefresh();
          }
        } catch {
          /* ignore */
        }
      });
      return () => {
        unsub();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
      };
    }, [enabled, refresh, scheduleRefresh]),
  );

  return refresh;
}
