import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { telegramAccountStore } from '../../stores/telegramAccountStore';
import { patchDialogsWithTdlibFile } from './telegramFileUpdates';
import { refreshTelegramDialogs } from './telegramDialogsLoader';
import { getNestedRecord } from './tdlibMapping';

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
          if (
            t === 'updateNewChat' ||
            t === 'updateChatLastMessage' ||
            t === 'updateChatPosition' ||
            t === 'updateChatReadInbox' ||
            t === 'updateChatTitle' ||
            t === 'updateDeleteMessages'
          ) {
            scheduleRefresh();
            return;
          }
          if (t === 'updateFile') {
            const file = getNestedRecord(u.file);
            if (!file) return;
            const store = telegramAccountStore.getState();
            const patched = patchDialogsWithTdlibFile(store.dialogs, file);
            if (patched !== store.dialogs) {
              store.setDialogs(patched);
            }
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
