import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery, useCreateGroupChatMutation } from '@/queries/chats.queries';
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
import { SettingsSubpageLayout } from '../components/settings/SettingsSubpageLayout';

const MAX_GROUP_MEMBERS = 100;
const SEARCH_DEBOUNCE_MS = 300;

function MemberAvatar({ user }: { user: AuthUser }) {
  const name = getDisplayName(user);
  const src = resolveAvatarSrc(user.avatar_url);
  if (src) {
    return <img className="mobile-create-group__avatar" src={src} alt="" />;
  }
  return (
    <div
      className="mobile-create-group__avatar-fallback"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </div>
  );
}

export function MobileCreateGroupScreen() {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const createGroup = useCreateGroupChatMutation();

  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const { data: searchResults = [], isFetching: searchLoading } = useUserSearchQuery(debouncedQuery);

  const currentUserId = me?.id ?? null;
  const selectedUserIds = useMemo(
    () => new Set(selectedUsers.map((user) => user.id)),
    [selectedUsers],
  );

  const chatContacts = useMemo(
    () => getGroupMemberPickerContacts({ chats: chats ?? [], currentUserId }),
    [chats, currentUserId],
  );

  const filteredRemote = useMemo(
    () => (currentUserId ? searchResults.filter((u) => u.id !== currentUserId) : searchResults),
    [searchResults, currentUserId],
  );

  const visibleResults = useMemo(() => {
    const localMatches = filterGroupMemberPickerUsers(chatContacts, query);
    if (!query.trim()) return localMatches;
    return mergeGroupMemberPickerUsers(localMatches, filteredRemote);
  }, [chatContacts, filteredRemote, query]);

  const toggleUser = useCallback((user: AuthUser) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((item) => item.id === user.id);
      if (exists) return prev.filter((item) => item.id !== user.id);
      return [...prev, user];
    });
  }, []);

  const handleCreate = () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setError('Введите название группы');
      return;
    }
    if (selectedUsers.length === 0) {
      setError('Выберите хотя бы одного участника');
      return;
    }
    if (selectedUsers.length > MAX_GROUP_MEMBERS) {
      setError(`Можно добавить не более ${MAX_GROUP_MEMBERS} участников`);
      return;
    }

    setError(null);
    createGroup.mutate(
      { name: trimmedName, memberIds: selectedUsers.map((user) => user.id) },
      {
        onSuccess: (chat) => {
          navigate({ to: '/chat/$chatId', params: { chatId: chat.id } });
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Не удалось создать группу');
        },
      },
    );
  };

  return (
    <SettingsSubpageLayout title="Новая группа" backTo="/compose">
      <div className="mobile-create-group">
        <div className="mobile-create-group__form-card">
          <label className="mobile-create-group__label" htmlFor="group-name">
            Название группы
          </label>
          <input
            id="group-name"
            className="mobile-create-group__input"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Введите название"
            maxLength={80}
          />

          {selectedUsers.length > 0 ? (
            <>
              <div className="mobile-create-group__label">Выбранные участники</div>
              <div className="mobile-create-group__chips">
                {selectedUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="mobile-create-group__chip"
                    onClick={() => toggleUser(user)}
                  >
                    <span>{getDisplayName(user)}</span>
                    <span className="mobile-create-group__chip-remove" aria-hidden>
                      ×
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <label className="mobile-create-group__label" htmlFor="group-member-search">
            Добавить участников
          </label>
          <input
            id="group-member-search"
            className="mobile-create-group__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или @handle"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        <div className="mobile-create-group__results-card">
          {searchLoading && query.trim() ? (
            <div className="mobile-create-group__center">
              <div className="mobile-auth__spinner" role="status" />
            </div>
          ) : visibleResults.length === 0 ? (
            <div className="mobile-create-group__empty">
              <div className="mobile-create-group__empty-title">
                {query.trim() ? 'Никого не нашли' : 'Найдите людей для группы'}
              </div>
              <div className="mobile-create-group__empty-subtitle">
                {query.trim()
                  ? 'Попробуйте другое имя или handle.'
                  : 'Начните вводить имя, чтобы выбрать участников группового чата.'}
              </div>
            </div>
          ) : (
            visibleResults.map((user) => {
              const displayName = getDisplayName(user);
              const isSelected = selectedUserIds.has(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`mobile-create-group__row${isSelected ? ' mobile-create-group__row--selected' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => toggleUser(user)}
                >
                  <MemberAvatar user={user} />
                  <div className="mobile-create-group__row-body">
                    <div className="mobile-create-group__row-title">{displayName}</div>
                    <div className="mobile-create-group__row-subtitle">
                      {user.handle ? `@${user.handle}` : user.username || 'Пользователь'}
                    </div>
                  </div>
                  <span
                    className={`mobile-create-group__checkbox${isSelected ? ' mobile-create-group__checkbox--checked' : ''}`}
                    aria-hidden
                  />
                </button>
              );
            })
          )}
        </div>

        {error ? (
          <p className="mobile-create-group__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mobile-create-group__footer">
          <button
            type="button"
            className="mobile-create-group__submit"
            disabled={createGroup.isPending}
            onClick={handleCreate}
          >
            {createGroup.isPending ? (
              <span className="mobile-auth__spinner" role="status" />
            ) : (
              'Создать групповой чат'
            )}
          </button>
        </div>
      </div>
    </SettingsSubpageLayout>
  );
}
