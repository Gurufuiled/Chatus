import { useCallback, useEffect, useRef } from 'react';
import { TYPING_SEND_INTERVAL_MS } from '@/stores/typingStore';
import { wsClient } from '@/ws/wsClient';

/** Emits WS typing while the composer has non-empty draft text. */
export function useComposerTyping(chatId: string, enabled: boolean, draft: string) {
  const lastSentAtRef = useRef(0);
  const hasTextRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const stopTyping = useCallback(() => {
    if (!hasTextRef.current) return;
    hasTextRef.current = false;
    lastSentAtRef.current = 0;
    wsClient.sendTyping(chatId, false);
  }, [chatId]);

  const onDraftChange = useCallback(
    (text: string) => {
      if (!enabled) return;
      const trimmed = text.trim();
      if (!trimmed) {
        stopTyping();
        return;
      }

      hasTextRef.current = true;
      const now = Date.now();
      if (now - lastSentAtRef.current < TYPING_SEND_INTERVAL_MS) return;
      lastSentAtRef.current = now;
      wsClient.sendTyping(chatId, true);
    },
    [chatId, enabled, stopTyping],
  );

  const onMessageSent = useCallback(() => {
    stopTyping();
  }, [stopTyping]);

  useEffect(() => {
    if (!enabled) {
      stopTyping();
      return;
    }

    // Sync persisted draft on mount / chat switch / re-enable
    const trimmed = draftRef.current.trim();
    if (trimmed) {
      hasTextRef.current = true;
      lastSentAtRef.current = Date.now();
      wsClient.sendTyping(chatId, true);
    } else {
      hasTextRef.current = false;
      lastSentAtRef.current = 0;
    }

    const timer = setInterval(() => {
      if (!hasTextRef.current) return;
      lastSentAtRef.current = Date.now();
      wsClient.sendTyping(chatId, true);
    }, TYPING_SEND_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      if (hasTextRef.current) {
        hasTextRef.current = false;
        lastSentAtRef.current = 0;
        wsClient.sendTyping(chatId, false);
      }
    };
  }, [chatId, enabled, stopTyping]);

  return { onDraftChange, onMessageSent };
}
