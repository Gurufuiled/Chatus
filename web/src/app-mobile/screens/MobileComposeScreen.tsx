import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery, useCreatePrivateChatMutation } from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getDisplayName } from '@/features/profile/profileFormatters';
import { formatLastSeen } from '@/features/profile/profileFormatters';
import type { AuthUser } from '@/types/auth';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import {
  filterGroupMemberPickerUsers,
  getContactSortName,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '../utils/groupMemberPicker';

const SEARCH_DEBOUNCE_MS = 300;

function ComposeAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const src = resolveAvatarSrc(avatarUrl);
  if (src) {
    return <img className="mobile-compose__avatar" src={src} alt="" />;
  }
  return (
    <div
      className="mobile-compose__avatar-fallback"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </div>
  );
}

function letterForUser(user: AuthUser): string {
  const n = getContactSortName(user);
  const ch = n.charAt(0).toUpperCase();
  if (/[A-ZА-ЯЁ]/i.test(ch)) return ch === 'Ё' ? 'Е' : ch;
  return '#';
}

export function MobileComposeScreen() {
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

  const openChat = (chatId: string) => {
    navigate({ to: '/chat/$chatId', params: { chatId } });
  };

  const startChat = (user: AuthUser) => {
    if (!user.id || createChat.isPending) return;
    setError(null);
    createChat.mutate(user.id, {
      onSuccess: (chat) => openChat(chat.id),
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Не удалось открыть чат');
      },
    });
  };

  return (
    <div className="mobile-compose">
      <header className="mobile-compose__header">
        <button
          type="button"
          className="mobile-compose__close"
          aria-label="Закрыть"
          onClick={() => navigate({ to: '/' })}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="mobile-compose__title">Новое сообщение</h1>
        <span className="mobile-compose__header-spacer" />
      </header>

      <div className="mobile-compose__scroll">
        <button
          type="button"
          className="mobile-compose__quick"
          onClick={() => navigate({ to: '/create-group' })}
        >
          <span className="mobile-compose__quick-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </span>
          <span className="mobile-compose__quick-label">Создать группу</span>
        </button>

        <button
          type="button"
          className="mobile-compose__quick"
          onClick={() => navigate({ to: '/create-channel' })}
        >
          <span className="mobile-compose__quick-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 11v2a1 1 0 001 1h1l4 9V4L5 10H4a1 1 0 00-1 1z" />
              <path d="M13 8.5a5 5 0 010 7M17 5.5a9 9 0 010 13" />
            </svg>
          </span>
          <span className="mobile-compose__quick-label">Создать канал</span>
        </button>

        <label className="mobile-compose__search">
          <span className="mobile-compose__search-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {searchLoading && query.trim() ? (
            <span className="mobile-auth__spinner" aria-hidden />
          ) : null}
        </label>

        {error ? (
          <p className="mobile-compose__error" role="alert">
            {error}
          </p>
        ) : null}

        {sections.length === 0 ? (
          <p className="mobile-compose__empty">
            {query.trim() ? 'Пользователи не найдены' : 'Нет контактов для нового сообщения'}
          </p>
        ) : (
          sections.map(({ letter, users }) => (
            <section key={letter}>
              <h2 className="mobile-compose__section">{letter}</h2>
              {users.map((user) => {
                const displayName = getDisplayName(user);
                const subtitle = formatLastSeen({
                  is_online: user.is_online,
                  last_seen: user.last_seen,
                });
                return (
                  <button
                    key={user.id}
                    type="button"
                    className="mobile-compose__row"
                    disabled={creatingUserId === user.id}
                    onClick={() => startChat(user)}
                  >
                    <ComposeAvatar name={displayName} avatarUrl={user.avatar_url} />
                    <div className="mobile-compose__row-body">
                      <div className="mobile-compose__row-title">{displayName}</div>
                      <div className="mobile-compose__row-subtitle">{subtitle}</div>
                    </div>
                    {creatingUserId === user.id ? (
                      <span className="mobile-auth__spinner" role="status" />
                    ) : null}
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
