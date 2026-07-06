import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { MobileChatListRow } from '../components/MobileChatListRow';
import type { ChatSummary } from '@/types/chat';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';

const SEARCH_DEBOUNCE_MS = 300;

function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return b.is_pinned ? 1 : -1;
    return (b.last_message_at ?? 0) - (a.last_message_at ?? 0);
  });
}

export function MobileChatListScreen() {
  const { data: chats, isLoading, isError, error } = useChatsQuery();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), SEARCH_DEBOUNCE_MS);

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    const sorted = sortChats(chats.filter((c) => !c.is_archived));
    if (!debouncedQuery) return sorted;
    const q = debouncedQuery.toLowerCase();
    return sorted.filter((chat) => getChatDisplayName(chat).toLowerCase().includes(q));
  }, [chats, debouncedQuery]);

  return (
    <div className="mobile-chat-list">
      <header className="mobile-chat-list__toolbar">
        <h1 className="mobile-chat-list__title">Чаты</h1>
        <label className="mobile-chat-list__search">
          <span aria-hidden>🔍</span>
          <input
            type="search"
            placeholder="Поиск"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Поиск чатов"
          />
        </label>
      </header>
      <div className="mobile-chat-list__scroll">
        {isLoading ? (
          <div className="mobile-chat-list__loading">
            <div className="mobile-auth__spinner" role="status" />
          </div>
        ) : isError ? (
          <p className="mobile-chat-list__empty" role="alert">
            {error instanceof Error ? error.message : 'Не удалось загрузить чаты'}
          </p>
        ) : filteredChats.length === 0 ? (
          <p className="mobile-chat-list__empty">
            {debouncedQuery ? 'Ничего не найдено' : 'Пока нет чатов'}
          </p>
        ) : (
          filteredChats.map((chat) => <MobileChatListRow key={chat.id} chat={chat} />)
        )}
      </div>
    </div>
  );
}

/** Settings placeholder — Phase 1 stub */
export function MobileSettingsScreen() {
  const navigate = useNavigate();
  return (
    <div className="mobile-chat-list">
      <header className="mobile-chat-list__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={() => navigate({ to: '/' })}
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="mobile-chat-list__title">Профиль</h1>
      </header>
      <p className="mobile-chat-list__empty">Настройки профиля — в следующей фазе</p>
    </div>
  );
}
