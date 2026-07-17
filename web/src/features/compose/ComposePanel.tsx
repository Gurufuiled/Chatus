import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Avatar } from '@/components/avatar/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatLastSeen, getDisplayName } from '@/features/profile/profileFormatters';
import { useMeQuery } from '@/queries/auth.queries';
import { useChatsQuery, useCreatePrivateChatMutation } from '@/queries/chats.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import { resolveMediaUrl } from '@/services/mediaService';
import type { AuthUser } from '@/types/auth';
import {
  filterGroupMemberPickerUsers,
  getContactSortName,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '@/app-mobile/utils/groupMemberPicker';
import './compose.css';

const SEARCH_DEBOUNCE_MS = 300;

function letterForUser(user: AuthUser): string {
  const n = getContactSortName(user);
  const ch = n.charAt(0).toUpperCase();
  if (/[A-ZА-ЯЁ]/i.test(ch)) return ch === 'Ё' ? 'Е' : ch;
  return '#';
}

export function ComposePanel() {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const createChat = useCreatePrivateChatMutation();

  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const { data: searchResults = [], isFetching: searchLoading } = useUserSearchQuery(debouncedQuery);

  const currentUserId = me?.id ?? null;
  const chatContacts = useMemo(
    () => getGroupMemberPickerContacts({ chats: chats ?? [], currentUserId }),
    [chats, currentUserId],
  );

  const filteredRemote = useMemo(
    () => (currentUserId ? searchResults.filter((u) => u.id !== currentUserId) : searchResults),
    [searchResults, currentUserId],
  );

  const visibleUsers = useMemo(() => {
    const localMatches = filterGroupMemberPickerUsers(chatContacts, query);
    if (!query.trim()) return localMatches;
    return mergeGroupMemberPickerUsers(localMatches, filteredRemote);
  }, [chatContacts, filteredRemote, query]);

  const sections = useMemo(() => {
    const byLetter = new Map<string, AuthUser[]>();
    for (const user of visibleUsers) {
      const letter = letterForUser(user);
      const list = byLetter.get(letter) ?? [];
      list.push(user);
      byLetter.set(letter, list);
    }
    return Array.from(byLetter.entries())
      .sort(([a], [b]) => {
        if (a === '#' && b !== '#') return 1;
        if (b === '#' && a !== '#') return -1;
        return a.localeCompare(b, 'ru', { sensitivity: 'base' });
      })
      .map(([letter, users]) => ({ letter, users }));
  }, [visibleUsers]);

  const creatingUserId = createChat.isPending ? createChat.variables : null;

  const startChat = (user: AuthUser) => {
    if (!user.id || createChat.isPending) return;
    setError(null);
    createChat.mutate(user.id, {
      onSuccess: (chat) => {
        void navigate({ to: '/chat/$chatId', params: { chatId: chat.id } });
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Не удалось открыть чат');
      },
    });
  };

  return (
    <div className="compose-panel">
      <header className="compose-panel__header">
        <button
          type="button"
          className="compose-panel__back"
          aria-label="Назад"
          onClick={() => void navigate({ to: '/' })}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="compose-panel__title">Новое сообщение</h1>
        <span />
      </header>

      <div className="compose-panel__scroll">
        <button
          type="button"
          className="compose-panel__quick"
          onClick={() => void navigate({ to: '/create-group' })}
        >
          <span className="compose-panel__quick-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </span>
          <span className="compose-panel__quick-label">Новая группа</span>
        </button>

        <label className="compose-panel__search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск контактов"
            autoCapitalize="off"
            autoCorrect="off"
          />
          {searchLoading && query.trim() ? <Spinner label="Searching" /> : null}
        </label>

        {error ? (
          <p className="compose-panel__error" role="alert">
            {error}
          </p>
        ) : null}

        {sections.length === 0 ? (
          <p className="compose-panel__empty">
            {query.trim() ? 'Пользователи не найдены' : 'Нет контактов для нового сообщения'}
          </p>
        ) : (
          sections.map(({ letter, users }) => (
            <section key={letter}>
              <h2 className="compose-panel__section">{letter}</h2>
              {users.map((user) => {
                const displayName = getDisplayName(user);
                const avatarUrl = user.avatar_url ? resolveMediaUrl(user.avatar_url) : null;
                const subtitle = formatLastSeen({
                  is_online: user.is_online,
                  last_seen: user.last_seen,
                });
                return (
                  <button
                    key={user.id}
                    type="button"
                    className="compose-panel__row"
                    disabled={creatingUserId === user.id}
                    onClick={() => startChat(user)}
                  >
                    <Avatar name={displayName} imageUrl={avatarUrl} size={48} />
                    <span className="compose-panel__row-body">
                      <span className="compose-panel__row-title">{displayName}</span>
                      <span className="compose-panel__row-subtitle">{subtitle}</span>
                    </span>
                    {creatingUserId === user.id ? <Spinner label="Opening chat" /> : null}
                  </button>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
