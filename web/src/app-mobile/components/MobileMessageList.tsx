import { useEffect, useRef, useState, useCallback } from 'react';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useMessageContextStore } from '@/stores/messageContextStore';
import { MobileMessageBubble } from './MobileMessageBubble';

interface MobileMessageListProps {
  chatId: string;
  keyboardLift?: number;
}

const LONG_PRESS_MS = 450;

export function MobileMessageList({ chatId, keyboardLift = 0 }: MobileMessageListProps) {
  const { data: messages, isLoading, isError } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const openMessageMenu = useMessageContextStore((s) => s.openMessageMenu);
  const closeMessageMenu = useMessageContextStore((s) => s.closeMessageMenu);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastChatIdRef = useRef(chatId);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPointRef = useRef<{ x: number; y: number } | null>(null);
  const [pressedMessageId, setPressedMessageId] = useState<string | null>(null);

  useEffect(() => {
    const behavior = lastChatIdRef.current === chatId ? 'smooth' : 'auto';
    lastChatIdRef.current = chatId;
    bottomRef.current?.scrollIntoView({ behavior });
  }, [chatId, messages?.length]);

  useEffect(() => {
    if (keyboardLift <= 0) return;
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [keyboardLift]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => closeMessageMenu();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [closeMessageMenu]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressPointRef.current = null;
    setPressedMessageId(null);
  }, []);

  const handlePointerDown = useCallback(
    (messageId: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      clearLongPress();
      longPressPointRef.current = { x: e.clientX, y: e.clientY };
      setPressedMessageId(messageId);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        const point = longPressPointRef.current;
        if (!point) return;
        openMessageMenu(chatId, messageId, point);
        setPressedMessageId(null);
      }, LONG_PRESS_MS);
    },
    [chatId, clearLongPress, openMessageMenu],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const point = longPressPointRef.current;
      if (!point || !longPressTimerRef.current) return;
      const dx = Math.abs(e.clientX - point.x);
      const dy = Math.abs(e.clientY - point.y);
      if (dx > 10 || dy > 10) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  const handlePointerUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  if (isLoading) {
    return <div className="mobile-chat__messages-loading">Загрузка…</div>;
  }

  if (isError) {
    return <div className="mobile-chat__messages-empty">Не удалось загрузить сообщения</div>;
  }

  if (!messages?.length) {
    return <div className="mobile-chat__messages-empty">Нет сообщений</div>;
  }

  return (
    <div
      ref={containerRef}
      className="mobile-chat__messages"
      style={keyboardLift > 0 ? { paddingBottom: keyboardLift + 8 } : undefined}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`mobile-bubble-row-wrap${pressedMessageId === message.id ? ' mobile-bubble-row-wrap--pressed' : ''}`}
          onPointerDown={(e) => handlePointerDown(message.id, e)}
        >
          <MobileMessageBubble
            message={message}
            isOutgoing={!!me?.id && message.sender_id === me.id}
          />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
