import { useMemo, useState } from 'react';
import { useChatsQuery } from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getDisplayName } from '@/features/profile/profileFormatters';
import type { AuthUser } from '@/types/auth';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import {
  filterGroupMemberPickerUsers,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '../utils/groupMemberPicker';

const SEARCH_DEBOUNCE_MS = 300;

interface MobileGroupAddMembersModalProps {
  chatId: string;
  excludedUserIds: Set<string>;
  onClose: () => void;
  onAdd: (memberIds: string[]) => void;
  pending?: boolean;
}

function MemberRow({
  user,
  selected,
  onToggle,
}: {
  user: AuthUser;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = getDisplayName(user);
  const src = resolveAvatarSrc(user.avatar_url);

  return (
    <button type="button" className="mobile-group-add-modal__row" onClick={onToggle}>
      {src ? (
        <img className="mobile-group-add-modal__avatar" src={src} alt="" />
      ) : (
        <div
          className="mobile-group-add-modal__avatar-fallback"
          style={{ backgroundColor: getAvatarColor(name) }}
        >
          {(name.trim()[0] || '?').toUpperCase()}
        </div>
      )}
      <span className="mobile-group-add-modal__name">{name}</span>
      <span
        className={`mobile-group-add-modal__check${selected ? ' mobile-group-add-modal__check--on' : ''}`}
        aria-hidden
      >
        {selected ? '✓' : ''}
      </span>
    </button>
  );
}

export function MobileGroupAddMembersModal({
  chatId,
  excludedUserIds,
  onClose,
  onAdd,
  pending = false,
}: MobileGroupAddMembersModalProps) {
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AuthUser[]>([]);
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const { data: searchResults = [] } = useUserSearchQuery(debouncedQuery);

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
    const merged = mergeGroupMemberPickerUsers(contacts, searchResults);
    return filterGroupMemberPickerUsers(merged, debouncedQuery);
  }, [contacts, debouncedQuery, searchResults]);

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);

  const toggleUser = (user: AuthUser) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  return (
    <div className="mobile-group-add-modal" role="dialog" aria-modal="true" aria-labelledby="add-members-title">
      <button type="button" className="mobile-group-add-modal__backdrop" onClick={onClose} aria-label="Закрыть" />
      <div className="mobile-group-add-modal__sheet">
        <header className="mobile-group-add-modal__header">
          <button type="button" className="mobile-group-add-modal__cancel" onClick={onClose}>
            Отмена
          </button>
          <h2 id="add-members-title" className="mobile-group-add-modal__title">
            Добавить участников
          </h2>
          <button
            type="button"
            className="mobile-group-add-modal__done"
            disabled={selected.length === 0 || pending}
            onClick={() => onAdd(selected.map((u) => u.id))}
          >
            {pending ? '…' : `Готово (${selected.length})`}
          </button>
        </header>
        <label className="mobile-group-add-modal__search">
          <input
            type="search"
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск пользователей"
          />
        </label>
        <div className="mobile-group-add-modal__list">
          {users.length === 0 ? (
            <p className="mobile-group-add-modal__empty">Никого не найдено</p>
          ) : (
            users.map((user) => (
              <MemberRow
                key={user.id}
                user={user}
                selected={selectedIds.has(user.id)}
                onToggle={() => toggleUser(user)}
              />
            ))
          )}
        </div>
        <input type="hidden" value={chatId} readOnly />
      </div>
    </div>
  );
}
