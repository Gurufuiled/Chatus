import { useEffect, useRef, useState } from 'react';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useChatsQuery } from '@/queries/chats.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { useMessageContextStore } from '@/stores/messageContextStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { Avatar } from '@/components/avatar/Avatar';
import { MessageBubble } from './MessageBubble';
import {
  isSameGroupMessageRun,
  isSystemLikeMessage,
  resolveMessageSender,
} from './messageSender';
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
  const isGroupChat = chat?.chat_type === 'group';
  const closeMessageMenu = useMessageContextStore((s) => s.closeMessageMenu);
  const openMessageMenu = useMessageContextStore((s) => s.openMessageMenu);
  const selectionActive = useSelectionStore((s) => s.isActive && s.chatId === chatId);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const toggleMessage = useSelectionStore((s) => s.toggleMessage);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHighlight = (id: string) => {
    setHighlightedId(id);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 1500);
  };

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [chatId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stickToBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [chatId, messages?.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      closeMessageMenu();
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 80;
    };
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

  const visibleMessages = messages.filter((message) => !message.is_deleted);

  return (
    <div className="message-list" ref={containerRef} role="log" aria-relevant="additions">
      <div className="message-list__inner">
        {visibleMessages.map((message, index) => {
          // While `me` is loading, avoid treating own messages as incoming (avatar flash).
          const meId = me?.id;
          const isOutgoing = !!meId && message.sender_id === meId;
          const isSelected = selectedIds.includes(message.id);
          const isSystem = isSystemLikeMessage(message);
          const prev = visibleMessages[index - 1];
          const next = visibleMessages[index + 1];
          const chainedWithPrev = isSameGroupMessageRun(prev, message, meId);
          const chainedWithNext = isSameGroupMessageRun(message, next, meId);
          // Groups only: left avatar gutter for incoming (non-system) bubbles.
          // Skip until `me` is known so own rows don't briefly get the gutter.
          const showGroupAvatarGutter = Boolean(
            isGroupChat && meId && !isOutgoing && !isSystem,
          );
          const showSenderName = showGroupAvatarGutter && !chainedWithPrev;
          const showAvatar = showGroupAvatarGutter && !chainedWithNext;
          const sender = showGroupAvatarGutter
            ? resolveMessageSender(chat, message)
            : null;

          return (
            <div
              key={message.id}
              id={`msg-${message.id}`}
              className={[
                'message-list__row',
                isOutgoing ? 'message-list__row--outgoing' : 'message-list__row--incoming',
                isSystem ? 'message-list__row--system' : '',
                showGroupAvatarGutter ? 'message-list__row--group-in' : '',
                chainedWithPrev ? 'message-list__row--chain' : '',
                selectionActive ? 'message-list__row--selectable' : '',
                isSelected ? 'message-list__row--selected' : '',
                highlightedId === message.id ? 'message-list__row--highlighted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
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
              {showGroupAvatarGutter ? (
                <div
                  className="message-list__avatar-slot"
                  aria-hidden={!showAvatar}
                >
                  {showAvatar && sender ? (
                    <Avatar
                      name={sender.displayName}
                      imageUrl={sender.avatarUrl}
                      size={32}
                      fallbackColor={sender.color}
                    />
                  ) : null}
                </div>
              ) : null}
              <MessageBubble
                chatId={chatId}
                chatTitle={chatTitle}
                message={message}
                isOutgoing={isOutgoing}
                selectionActive={selectionActive}
                showSenderName={showSenderName}
                senderDisplayName={sender?.displayName}
                senderNameColor={sender?.color}
                onContextMenu={(e) => handleContextMenu(message.id, e)}
                onHighlightMessage={triggerHighlight}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
