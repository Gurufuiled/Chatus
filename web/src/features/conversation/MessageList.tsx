import { useEffect, useRef, useState } from 'react';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useChatsQuery } from '@/queries/chats.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { useMessageContextStore } from '@/stores/messageContextStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { MessageBubble } from './MessageBubble';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

interface MessageListProps {
  chatId: string;
}

export function MessageList({ chatId }: MessageListProps) {
  const { data: messages, isLoading, isError, error } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const chat = chats?.find((c) => c.id === chatId);
  const chatTitle = chat ? getChatDisplayName(chat) : 'Группа';
  const closeMessageMenu = useMessageContextStore((s) => s.closeMessageMenu);
  const openMessageMenu = useMessageContextStore((s) => s.openMessageMenu);
  const selectionActive = useSelectionStore((s) => s.isActive && s.chatId === chatId);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const toggleMessage = useSelectionStore((s) => s.toggleMessage);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChatIdRef = useRef(chatId);

  const triggerHighlight = (id: string) => {
    setHighlightedId(id);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 1500);
  };

  useEffect(() => {
    const behavior = lastChatIdRef.current === chatId ? 'smooth' : 'auto';
    lastChatIdRef.current = chatId;
    bottomRef.current?.scrollIntoView({ behavior });
  }, [chatId, messages?.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => closeMessageMenu();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [closeMessageMenu]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  const handleContextMenu = (messageId: string, e: React.MouseEvent) => {
    if (selectionActive) return;
    e.preventDefault();
    openMessageMenu(chatId, messageId, { x: e.clientX, y: e.clientY });
  };

  const handleRowClick = (messageId: string) => {
    if (!selectionActive) return;
    toggleMessage(messageId);
  };

  if (isLoading) {
    return (
      <div className="message-list message-list--centered">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="message-list message-list--centered">
        <EmptyState
          title="Не удалось загрузить сообщения"
          description={error instanceof Error ? error.message : 'Неизвестная ошибка'}
        />
      </div>
    );
  }

  if (!messages?.length) {
    return (
      <div className="message-list message-list--centered">
        <EmptyState
          title="Сообщений пока нет"
          description="Напишите первое сообщение, чтобы начать переписку"
        />
      </div>
    );
  }

  return (
    <div className="message-list" ref={containerRef} role="log" aria-relevant="additions">
      <div className="message-list__inner">
        {messages.map((message) => {
          const isOutgoing = !!me?.id && message.sender_id === me.id;
          const isSelected = selectedIds.includes(message.id);
          return (
            <div
              key={message.id}
              id={`msg-${message.id}`}
              className={`message-list__row${isOutgoing ? ' message-list__row--outgoing' : ' message-list__row--incoming'}${selectionActive ? ' message-list__row--selectable' : ''}${isSelected ? ' message-list__row--selected' : ''}${highlightedId === message.id ? ' message-list__row--highlighted' : ''}`}
              onClick={() => handleRowClick(message.id)}
            >
              {selectionActive ? (
                <span className="message-list__select-mark" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path
                      d="M6 12.5l3.5 3.5L18 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              ) : null}
              <MessageBubble
                chatId={chatId}
                chatTitle={chatTitle}
                message={message}
                isOutgoing={isOutgoing}
                selectionActive={selectionActive}
                onContextMenu={(e) => handleContextMenu(message.id, e)}
                onHighlightMessage={triggerHighlight}
              />
            </div>
          );
        })}
        <div ref={bottomRef} className="message-list__anchor" aria-hidden />
      </div>
    </div>
  );
}
