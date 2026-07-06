import { useEffect, useRef } from 'react';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { MobileMessageBubble } from './MobileMessageBubble';

interface MobileMessageListProps {
  chatId: string;
}

export function MobileMessageList({ chatId }: MobileMessageListProps) {
  const { data: messages, isLoading, isError } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastChatIdRef = useRef(chatId);

  useEffect(() => {
    const behavior = lastChatIdRef.current === chatId ? 'smooth' : 'auto';
    lastChatIdRef.current = chatId;
    bottomRef.current?.scrollIntoView({ behavior });
  }, [chatId, messages?.length]);

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
    <div className="mobile-chat__messages">
      {messages.map((message) => (
        <MobileMessageBubble
          key={message.id}
          message={message}
          isOutgoing={!!me?.id && message.sender_id === me.id}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
