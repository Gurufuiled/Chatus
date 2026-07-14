import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar/Avatar';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getDisplayName } from '@/features/profile/profileFormatters';
import { useMeQuery } from '@/queries/auth.queries';
import { useChatsQuery } from '@/queries/chats.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import type { AuthUser } from '@/types/auth';
import {
  filterGroupMemberPickerUsers,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '@/app-mobile/utils/groupMemberPicker';

const SEARCH_DEBOUNCE_MS = 300;

interface ChatInfoAddMembersModalProps {
  chatId: string;
  excludedUserIds: Set<string>;
  onClose: () => void;
  onAdd: (memberIds: string[]) => void;
  pending?: boolean;
  error?: string | null;
}

function userHandle(user: AuthUser): string | null {
  const handle = user.handle?.trim() || user.username?.trim();
  return handle ? `@${handle.replace(/^@+/, '')}` : null;
}

export function ChatInfoAddMembersModal({
  chatId,
  excludedUserIds,
  onClose,
  onAdd,
  pending = false,
  error = null,
}: ChatInfoAddMembersModalProps) {
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AuthUser[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const { data: searchResults = [], isFetching } = useUserSearchQuery(debouncedQuery);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  const contacts = useMemo(
    () =>
      getGroupMemberPickerContacts({
        chats: chats ?? [],
        currentUserId: me?.id ?? null,
        excludedUserIds,
      }),
    [chats, excludedUserIds, me?.id],
  );

  const users = useMemo(() => {
    const merged = mergeGroupMemberPickerUsers(contacts, searchResults).filter(
      (user) => !excludedUserIds.has(user.id),
    );
    return filterGroupMemberPickerUsers(merged, debouncedQuery);
  }, [contacts, debouncedQuery, excludedUserIds, searchResults]);

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);

  const toggleUser = (user: AuthUser) => {
    if (pending) return;
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  return (
    <div
      className="chat-info-add-members"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-info-add-members-title"
      data-chat-id={chatId}
    >
      <button
        type="button"
        className="chat-info-add-members__backdrop"
        onClick={() => {
          if (!pending) onClose();
        }}
        aria-label="Закрыть"
      />
      <div className="chat-info-add-members__panel">
        <header className="chat-info-add-members__header">
          <button
            type="button"
            className="chat-info-add-members__cancel"
            onClick={onClose}
            disabled={pending}
          >
            Отмена
          </button>
          <h2 id="chat-info-add-members-title" className="chat-info-add-members__title">
            Добавить участника
          </h2>
          <button
            type="button"
            className="chat-info-add-members__done"
            disabled={selected.length === 0 || pending}
            onClick={() => onAdd(selected.map((u) => u.id))}
          >
            {pending ? '…' : selected.length > 0 ? `Добавить (${selected.length})` : 'Добавить'}
          </button>
        </header>

        <label className="chat-info-add-members__search">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            placeholder="Имя или @username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск по имени или @username"
            disabled={pending}
          />
        </label>

        {error ? (
          <p className="chat-info-add-members__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="chat-info-add-members__list">
          {users.length === 0 ? (
            <p className="chat-info-add-members__empty">
              {debouncedQuery
                ? isFetching
                  ? 'Поиск…'
                  : 'Никого не найдено'
                : 'Нет контактов — введите имя или @username'}
            </p>
          ) : (
            users.map((user) => {
              const name = getDisplayName(user);
              const handle = userHandle(user);
              const selectedUser = selectedIds.has(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`chat-info-add-members__row${
                    selectedUser ? ' chat-info-add-members__row--selected' : ''
                  }`}
                  aria-pressed={selectedUser}
                  onClick={() => toggleUser(user)}
                  disabled={pending}
                >
                  <Avatar name={name} imageUrl={user.avatar_url} size={40} />
                  <span className="chat-info-add-members__user">
                    <span className="chat-info-add-members__name">{name}</span>
                    {handle ? (
                      <span className="chat-info-add-members__handle">{handle}</span>
                    ) : null}
                  </span>
                  <span
                    className={`chat-info-add-members__check${
                      selectedUser ? ' chat-info-add-members__check--on' : ''
                    }`}
                    aria-hidden
                  >
                    {selectedUser ? '✓' : ''}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
