import { useEffect, useRef, useState, useCallback } from 'react';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useComposerStore } from '@/stores/composerStore';
import { useMessageContextStore } from '@/stores/messageContextStore';
import { MobileMessageBubble } from './MobileMessageBubble';
import { MobileSwipeReplyRow } from './MobileSwipeReplyRow';

interface MobileMessageListProps {
  chatId: string;
  keyboardLift?: number;
  isGroupChat?: boolean;
}

const LONG_PRESS_MS = 450;

function canSwipeReplyMessage(message: {
  is_deleted?: boolean;
  msg_type: string;
}): boolean {
  if (message.is_deleted) return false;
  return (
    message.msg_type === 'text' ||
    message.msg_type === 'voice' ||
    message.msg_type === 'video_note' ||
    message.msg_type === 'image' ||
    message.msg_type === 'video'
  );
}

export function MobileMessageList({ chatId, keyboardLift = 0, isGroupChat = false }: MobileMessageListProps) {
  const { data: messages, isLoading, isError } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const openMessageMenu = useMessageContextStore((s) => s.openMessageMenu);
  const closeMessageMenu = useMessageContextStore((s) => s.closeMessageMenu);
  const menuMessageId = useMessageContextStore((s) =>
    s.chatId === chatId ? s.messageId : null,
  );
  const setReply = useComposerStore((s) => s.setReply);
  const requestComposerFocus = useComposerStore((s) => s.requestComposerFocus);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastChatIdRef = useRef(chatId);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRectRef = useRef<DOMRect | null>(null);
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
    longPressRectRef.current = null;
    longPressPointRef.current = null;
    setPressedMessageId(null);
  }, []);

  const handleSwipeReply = useCallback(
    (messageId: string) => {
      setReply(chatId, messageId);
      requestComposerFocus();
    },
    [chatId, requestComposerFocus, setReply],
  );

  const handlePointerDown = useCallback(
    (messageId: string, isOutgoing: boolean, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      clearLongPress();
      longPressRectRef.current = e.currentTarget.getBoundingClientRect();
      longPressPointRef.current = { x: e.clientX, y: e.clientY };
      setPressedMessageId(messageId);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        const rect = longPressRectRef.current;
        if (!rect) return;
        openMessageMenu(chatId, messageId, {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          isOutgoing,
        });
        setPressedMessageId(null);
      }, LONG_PRESS_MS);
    },
    [chatId, clearLongPress, openMessageMenu],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressTimerRef.current || !longPressPointRef.current) return;
      const point = longPressPointRef.current;
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
      {messages
        .filter((message) => !message.is_deleted)
        .map((message) => {
        const isOutgoing = !!me?.id && message.sender_id === me.id;
        return (
          <MobileSwipeReplyRow
            key={message.id}
            enabled={canSwipeReplyMessage(message)}
            onReply={() => handleSwipeReply(message.id)}
          >
            <div
              className={`mobile-bubble-row-wrap${
                pressedMessageId === message.id ? ' mobile-bubble-row-wrap--pressed' : ''
              }${menuMessageId === message.id ? ' mobile-bubble-row-wrap--menu-hidden' : ''}`}
              onPointerDown={(e) => handlePointerDown(message.id, isOutgoing, e)}
            >
              <MobileMessageBubble
                message={message}
                isOutgoing={isOutgoing}
                showSenderName={isGroupChat && !isOutgoing}
              />
            </div>
          </MobileSwipeReplyRow>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
