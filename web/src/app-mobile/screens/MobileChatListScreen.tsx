import { useMemo, useState } from 'react';
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
      <header className="mobile-chat-list__nav">
        <h1 className="mobile-chat-list__nav-title">Чаты</h1>
      </header>
      <div className="mobile-chat-list__scroll">
        <label className="mobile-chat-list__search mobile-chat-list__search--in-scroll">
          <span className="mobile-chat-list__search-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Поиск чатов"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Поиск чатов"
          />
        </label>

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
