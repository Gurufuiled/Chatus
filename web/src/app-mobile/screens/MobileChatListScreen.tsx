import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMobileUiStore } from '@/stores/mobileUiStore';
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
  const navigate = useNavigate();
  const { data: chats, isLoading, isError, error } = useChatsQuery();
  const chatListFilter = useMobileUiStore((s) => s.chatListFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), SEARCH_DEBOUNCE_MS);

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    if (chatListFilter === 'telegram_only') return [];
    const sorted = sortChats(chats.filter((c) => !c.is_archived));
    if (!debouncedQuery) return sorted;
    const q = debouncedQuery.toLowerCase();
    return sorted.filter((chat) => getChatDisplayName(chat).toLowerCase().includes(q));
  }, [chats, debouncedQuery, chatListFilter]);

  return (
    <div className="mobile-chat-list">
      <header className="mobile-chat-list__nav mobile-chat-list__nav--with-action">
        <span className="mobile-chat-list__nav-side" />
        <h1 className="mobile-chat-list__nav-title">Чаты</h1>
        <button
          type="button"
          className="mobile-chat-list__compose"
          aria-label="Написать сообщение"
          onClick={() => navigate({ to: '/compose' })}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
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
