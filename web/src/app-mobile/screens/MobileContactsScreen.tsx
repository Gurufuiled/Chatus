import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery, useCreatePrivateChatMutation } from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatLastSeen, getDisplayName } from '@/features/profile/profileFormatters';
import type { ChatSummary } from '@/types/chat';
import type { AuthUser } from '@/types/auth';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';

const SEARCH_DEBOUNCE_MS = 300;

type ContactFromChat = {
  chat: ChatSummary;
  peerId: string;
  title: string;
  avatarUrl: string | null | undefined;
  sortTime: number;
};

function buildContactsFromChats(chats: ChatSummary[], currentUserId: string | null): ContactFromChat[] {
  if (!currentUserId) return [];
  const rows: ContactFromChat[] = [];
  const seenPeerIds = new Set<string>();
  for (const chat of chats) {
    if (chat.chat_type !== 'private') continue;
    const peerMember = chat.members?.find((m) => m.user_id !== currentUserId);
    const peerId = peerMember?.user_id;
    if (!peerId || seenPeerIds.has(peerId)) continue;
    seenPeerIds.add(peerId);
    const user = peerMember?.user;
    const sortTime = chat.last_message_at ?? chat.updated_at ?? 0;
    const title =
      chat.peer_display_name?.trim() ||
      user?.display_name?.trim() ||
      (user?.handle ? `@${user.handle}` : null) ||
      user?.username?.trim() ||
      'Контакт';
    const avatarUrl = user?.avatar_url ?? chat.avatar_url;
    rows.push({ chat, peerId, title, avatarUrl, sortTime });
  }
  rows.sort((a, b) => b.sortTime - a.sortTime);
  return rows;
}

function formatPresence(user?: {
  is_online?: boolean;
  last_seen?: number | null;
}): string {
  if (!user) return 'был(а) недавно';
  return formatLastSeen({ is_online: user.is_online ?? false, last_seen: user.last_seen ?? null });
}

function ContactAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const src = resolveAvatarSrc(avatarUrl);
  if (src) {
    return <img className="mobile-contact-row__avatar" src={src} alt="" />;
  }
  return (
    <div
      className="mobile-contact-row__avatar-fallback"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </div>
  );
}

function ContactRow({
  title,
  subtitle,
  avatarUrl,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  avatarUrl?: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mobile-contact-row" onClick={onClick} disabled={disabled}>
      <ContactAvatar name={title} avatarUrl={avatarUrl} />
      <div className="mobile-contact-row__body">
        <div className="mobile-contact-row__title">{title}</div>
        <div className="mobile-contact-row__subtitle">{subtitle}</div>
      </div>
      {disabled ? <div className="mobile-auth__spinner" role="status" aria-label="Открытие чата" /> : null}
    </button>
  );
}

export function MobileContactsScreen() {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: chats, isLoading: chatsLoading } = useChatsQuery();
  const createChatMutation = useCreatePrivateChatMutation();
  const [query, setQuery] = useState('');
  const [createChatError, setCreateChatError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const {
    data: searchResults = [],
    isFetching: searchLoading,
    isError: searchError,
    error: searchErrorObj,
  } = useUserSearchQuery(debouncedQuery);

  const currentUserId = me?.id ?? null;
  const contactsFromChats = useMemo(
    () => buildContactsFromChats(chats ?? [], currentUserId),
    [chats, currentUserId],
  );

  const filteredResults = useMemo(
    () => (currentUserId ? searchResults.filter((u) => u.id !== currentUserId) : searchResults),
    [searchResults, currentUserId],
  );

  const isSearchMode = debouncedQuery.length > 0;
  const creatingUserId = createChatMutation.isPending ? createChatMutation.variables : null;

  const openChat = (chatId: string) => {
    navigate({ to: '/chat/$chatId', params: { chatId } });
  };

  const startChat = (user: AuthUser) => {
    if (!user.id || createChatMutation.isPending) return;
    setCreateChatError(null);
    createChatMutation.mutate(user.id, {
      onSuccess: (chat) => openChat(chat.id),
      onError: (err) => {
        setCreateChatError(err instanceof Error ? err.message : 'Не удалось открыть чат');
      },
    });
  };

  return (
    <div className="mobile-contacts">
      <header className="mobile-contacts__nav">
        <h1 className="mobile-contacts__nav-title">Контакты</h1>
      </header>
      <div className="mobile-contacts__scroll">
        <label className="mobile-chat-list__search mobile-chat-list__search--in-scroll">
          <span className="mobile-chat-list__search-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Поиск по имени или @нику"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск контактов"
          />
          {isSearchMode && searchLoading ? (
            <span className="mobile-chat-list__search-spinner" aria-hidden>
              <span className="mobile-auth__spinner" />
            </span>
          ) : null}
        </label>

        {createChatError ? (
          <p className="mobile-chat-list__empty" role="alert">
            {createChatError}
          </p>
        ) : null}

        {chatsLoading ? (
          <div className="mobile-chat-list__loading">
            <div className="mobile-auth__spinner" role="status" />
          </div>
        ) : isSearchMode ? (
          searchError ? (
            <p className="mobile-chat-list__empty" role="alert">
              {searchErrorObj instanceof Error ? searchErrorObj.message : 'Не удалось выполнить поиск'}
            </p>
          ) : filteredResults.length === 0 && !searchLoading ? (
            <p className="mobile-chat-list__empty">Пользователи не найдены</p>
          ) : (
            filteredResults.map((user) => {
              const displayName = getDisplayName(user);
              const handle = user.handle ? `@${user.handle}` : 'Контакт';
              return (
                <ContactRow
                  key={user.id}
                  title={displayName}
                  subtitle={handle}
                  avatarUrl={user.avatar_url}
                  disabled={creatingUserId === user.id}
                  onClick={() => startChat(user)}
                />
              );
            })
          )
        ) : contactsFromChats.length === 0 ? (
          <p className="mobile-chat-list__empty">
            Нет личных чатов. Найдите человека по имени или @нику.
          </p>
        ) : (
          contactsFromChats.map((item) => {
            const peerMember = item.chat.members?.find((m) => m.user_id === item.peerId);
            const presence = peerMember?.user;
            const subtitle = formatPresence(presence);
            return (
              <ContactRow
                key={item.chat.id}
                title={item.title}
                subtitle={subtitle}
                avatarUrl={item.avatarUrl}
                onClick={() => openChat(item.chat.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
