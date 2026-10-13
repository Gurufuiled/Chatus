import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { telegramAccountStore } from '../../stores/telegramAccountStore';
import { refreshTelegramDialogs } from './telegramDialogsLoader';
import { patchDialogsWithTdlibFiles } from './telegramFileUpdates';
import { createCoalesceQueue } from '../../utils/coalesceQueue';

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
      // Аватарки диалогов докачиваются в фоне: подставляем их по `updateFile`, не дожидаясь следующего
      // обновления списка (раньше они появлялись только при рефреше). Пачкой, чтобы список не мигал.
      const fileUpdates = createCoalesceQueue<Record<string, unknown>>((files) => {
        const { dialogs, setDialogs } = telegramAccountStore.getState();
        const next = patchDialogsWithTdlibFiles(dialogs, files);
        if (next !== dialogs) setDialogs(next);
      }, 60);
      const unsub = tdlibClient.subscribe((u) => {
        try {
          const t = (u['@type'] as string | undefined) ?? '';
          if (t === 'updateFile') {
            const file = u.file as Record<string, unknown> | null | undefined;
            const local = file?.local as Record<string, unknown> | null | undefined;
            if (file && local?.is_downloading_completed === true) {
              fileUpdates.push(file);
            }
            return;
          }
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
        fileUpdates.flush();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
      };
    }, [enabled, refresh, scheduleRefresh]),
  );

  return refresh;
}
