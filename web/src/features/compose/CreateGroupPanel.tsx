import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Avatar } from '@/components/avatar/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getDisplayName } from '@/features/profile/profileFormatters';
import { useMeQuery } from '@/queries/auth.queries';
import {
  useChatsQuery,
  useCreateGroupChatMutation,
  useUpdateGroupChatMutation,
} from '@/queries/chats.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import { resolveMediaUrl, uploadFile } from '@/services/mediaService';
import type { AuthUser } from '@/types/auth';
import { formatMemberCount } from '@/app-mobile/utils/channelUtils';
import {
  filterGroupMemberPickerUsers,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '@/app-mobile/utils/groupMemberPicker';
import './compose.css';

const MAX_GROUP_MEMBERS = 100;
const SEARCH_DEBOUNCE_MS = 300;

type Step = 'members' | 'details';

function userSubtitle(user: AuthUser): string {
  if (user.handle?.trim()) return `@${user.handle.replace(/^@+/, '')}`;
  if (user.username?.trim()) return user.username;
  return 'пользователь';
}

export function CreateGroupPanel() {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const createGroup = useCreateGroupChatMutation();
  const updateGroup = useUpdateGroupChatMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarPreviewRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);

  const [step, setStep] = useState<Step>('members');
  const [query, setQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<AuthUser[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const revokeAvatarPreview = useCallback(() => {
    if (avatarPreviewRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreviewRef.current);
    }
    avatarPreviewRef.current = null;
  }, []);

  useEffect(() => () => revokeAvatarPreview(), [revokeAvatarPreview]);

  const toggleUser = useCallback(
    (user: AuthUser) => {
      const exists = selectedUsers.some((item) => item.id === user.id);
      if (exists) {
        setSelectedUsers((prev) => prev.filter((item) => item.id !== user.id));
        setError(null);
        return;
      }
      if (selectedUsers.length >= MAX_GROUP_MEMBERS) {
        setError(`Можно добавить не более ${MAX_GROUP_MEMBERS} участников`);
        return;
      }
      setError(null);
      setSelectedUsers((prev) => [...prev, user]);
    },
    [selectedUsers],
  );

  const goBack = () => {
    if (step === 'details') {
      setStep('members');
      setError(null);
      return;
    }
    void navigate({ to: '/compose' });
  };

  const goNext = () => {
    if (selectedUsers.length === 0) {
      setError('Выберите хотя бы одного участника');
      return;
    }
    if (selectedUsers.length > MAX_GROUP_MEMBERS) {
      setError(`Можно добавить не более ${MAX_GROUP_MEMBERS} участников`);
      return;
    }
    setError(null);
    setStep('details');
  };

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    revokeAvatarPreview();
    const localPreview = URL.createObjectURL(file);
    avatarPreviewRef.current = localPreview;
    setAvatarPreview(localPreview);
    try {
      const uploaded = await uploadFile(file);
      setAvatarUrl(uploaded.url);
      const remotePreview = resolveMediaUrl(uploaded.url);
      revokeAvatarPreview();
      setAvatarPreview(remotePreview);
    } catch (err) {
      revokeAvatarPreview();
      setAvatarPreview(null);
      setAvatarUrl(null);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreate = async () => {
    if (submitLockRef.current || submitting || createGroup.isPending) return;
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setError('Введите название группы');
      return;
    }
    if (selectedUsers.length === 0) {
      setError('Выберите хотя бы одного участника');
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const chat = await createGroup.mutateAsync({
        name: trimmedName,
        memberIds: selectedUsers.map((user) => user.id),
      });
      let avatarFailed = false;
      if (avatarUrl) {
        try {
          await updateGroup.mutateAsync({ chatId: chat.id, avatar_url: avatarUrl });
        } catch {
          avatarFailed = true;
        }
      }
      if (avatarFailed) {
        window.alert('Группа создана, но фото не удалось сохранить');
      }
      void navigate({ to: '/chat/$chatId', params: { chatId: chat.id } });
    } catch (err) {
      submitLockRef.current = false;
      setError(err instanceof Error ? err.message : 'Не удалось создать группу');
    } finally {
      setSubmitting(false);
    }
  };

  const memberCountLabel = formatMemberCount(selectedUsers.length);

  const resolvedAvatar =
    avatarPreview ?? (avatarUrl ? resolveMediaUrl(avatarUrl) : null);

  if (step === 'details') {
    return (
      <div className="compose-panel">
        <header className="compose-panel__header compose-panel__header--action">
          <button type="button" className="compose-panel__back" aria-label="Назад" onClick={goBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="compose-panel__title">Новая группа</h1>
          <button
            type="button"
            className="compose-panel__header-action"
            disabled={submitting || uploadingAvatar || !groupName.trim()}
            onClick={() => void handleCreate()}
          >
            {submitting ? '…' : 'Создать'}
          </button>
        </header>

        <div className="compose-panel__scroll">
          <div className="compose-group-details">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void handleAvatarPick(e.target.files?.[0])}
            />
            <button
              type="button"
              className="compose-group-details__avatar-btn"
              aria-label="Выбрать фото группы"
              disabled={uploadingAvatar || submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              {resolvedAvatar ? (
                <img className="compose-group-details__avatar-img" src={resolvedAvatar} alt="" />
              ) : (
                <span className="compose-group-details__avatar-fallback" aria-hidden>
                  {uploadingAvatar ? (
                    <Spinner label="Uploading avatar" />
                  ) : (
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" />
                      <path d="M9 4l1.2-1.6A1.5 1.5 0 0111.4 2h1.2a1.5 1.5 0 011.2.4L15 4h3a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3zm3 12.5A4.5 4.5 0 1012 7a4.5 4.5 0 000 9.5z" />
                    </svg>
                  )}
                </span>
              )}
            </button>

            <div className="compose-group-details__name-field">
              <label htmlFor="desktop-group-name">Название группы</label>
              <input
                id="desktop-group-name"
                value={groupName}
                onChange={(e) => {
                  setGroupName(e.target.value);
                  setError(null);
                }}
                placeholder="Название группы"
                maxLength={80}
                autoFocus
                disabled={submitting}
              />
            </div>

            <p className="compose-group-details__hint">{memberCountLabel}</p>

            {error ? (
              <p className="compose-panel__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="compose-panel">
      <header className="compose-panel__header compose-panel__header--action">
        <button type="button" className="compose-panel__back" aria-label="Назад" onClick={goBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="compose-panel__title">Добавить участников</h1>
        <button
          type="button"
          className="compose-panel__header-action"
          disabled={selectedUsers.length === 0}
          onClick={goNext}
        >
          Далее
        </button>
      </header>

      <div className="compose-panel__scroll">
        {selectedUsers.length > 0 ? (
          <div className="compose-panel__chips" aria-label="Выбранные участники">
            {selectedUsers.map((user) => {
              const name = getDisplayName(user);
              const url = user.avatar_url ? resolveMediaUrl(user.avatar_url) : null;
              return (
                <button
                  key={user.id}
                  type="button"
                  className="compose-panel__chip"
                  onClick={() => toggleUser(user)}
                  aria-label={`Убрать ${name}`}
                >
                  <span className="compose-panel__chip-avatar-wrap">
                    <Avatar name={name} imageUrl={url} size={48} />
                    <span className="compose-panel__chip-remove" aria-hidden>
                      ×
                    </span>
                  </span>
                  <span className="compose-panel__chip-name">{name}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <label className="compose-panel__search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Кого добавить?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск участников"
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

        {visibleResults.length === 0 ? (
          <p className="compose-panel__empty">
            {query.trim()
              ? 'Никого не нашли'
              : 'Найдите людей для группы — начните вводить имя или @username'}
          </p>
        ) : (
          visibleResults.map((user) => {
            const displayName = getDisplayName(user);
            const avatarUrlResolved = user.avatar_url ? resolveMediaUrl(user.avatar_url) : null;
            const isSelected = selectedUserIds.has(user.id);
            return (
              <button
                key={user.id}
                type="button"
                className={`compose-panel__row${isSelected ? ' compose-panel__row--selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => toggleUser(user)}
              >
                <Avatar name={displayName} imageUrl={avatarUrlResolved} size={48} />
                <span className="compose-panel__row-body">
                  <span className="compose-panel__row-title">{displayName}</span>
                  <span className="compose-panel__row-subtitle">{userSubtitle(user)}</span>
                </span>
                <span
                  className={`compose-panel__check${isSelected ? ' compose-panel__check--on' : ''}`}
                  aria-hidden
                >
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
