import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import { useMarkChatReadMutation, useMessagesQuery } from '@/queries/messages.queries';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import { MobileChatHeader } from '../components/MobileChatHeader';
import { MobileMessageList } from '../components/MobileMessageList';
import { MobileMessageComposer } from '../components/MobileMessageComposer';

interface MobileChatScreenProps {
  chatId: string;
}

export function MobileChatScreen({ chatId }: MobileChatScreenProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading: chatsLoading } = useChatsQuery();
  const { isLoading: messagesLoading } = useMessagesQuery(chatId);
  const { mutate: markChatRead } = useMarkChatReadMutation();
  const markedRef = useRef<string | null>(null);
  const chat = chats?.find((c) => c.id === chatId);

  useEffect(() => {
    markedRef.current = null;
  }, [chatId]);

  useEffect(() => {
    if (!chat || chat.unread_count === 0) return;
    if (markedRef.current === chatId) return;
    markedRef.current = chatId;
    markChatRead(chatId);
  }, [chatId, chat, markChatRead]);

  if (chatsLoading) {
    return (
      <div className="mobile-chat">
        <div className="mobile-chat__messages-loading">Загрузка…</div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="mobile-chat">
        <header className="mobile-chat__header">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад к списку чатов"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat__title">Чат не найден</span>
        </header>
        <p className="mobile-chat__messages-empty">Возможно, диалог был удалён</p>
      </div>
    );
  }

  return (
    <div
      className="mobile-chat"
      style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
    >
      <MobileChatHeader chat={chat} />
      <MobileMessageList chatId={chatId} />
      <MobileMessageComposer chatId={chatId} disabled={messagesLoading} />
    </div>
  );
}
