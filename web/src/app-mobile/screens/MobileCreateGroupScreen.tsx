import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChatsQuery,
  useCreateGroupChatMutation,
  useUpdateGroupChatMutation,
} from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useUserSearchQuery } from '@/queries/users.queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getDisplayName } from '@/features/profile/profileFormatters';
import { uploadFile } from '@/services/mediaService';
import type { AuthUser } from '@/types/auth';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { formatMemberCount } from '../utils/channelUtils';
import {
  filterGroupMemberPickerUsers,
  getGroupMemberPickerContacts,
  mergeGroupMemberPickerUsers,
} from '../utils/groupMemberPicker';
import { SettingsSubpageLayout } from '../components/settings/SettingsSubpageLayout';

const MAX_GROUP_MEMBERS = 100;
const SEARCH_DEBOUNCE_MS = 300;

type Step = 'members' | 'details';

function MemberAvatar({ user, size = 44 }: { user: AuthUser; size?: number }) {
  const name = getDisplayName(user);
  const src = resolveAvatarSrc(user.avatar_url);
  if (src) {
    return (
      <img
        className="mobile-create-group__avatar"
        src={src}
        alt=""
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <div
      className="mobile-create-group__avatar-fallback"
      style={{
        backgroundColor: getAvatarColor(name),
        width: size,
        height: size,
        borderRadius: size / 2,
      }}
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden>
      <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" />
      <path d="M9 4l1.2-1.6A1.5 1.5 0 0111.4 2h1.2a1.5 1.5 0 011.2.4L15 4h3a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3zm3 12.5A4.5 4.5 0 1012 7a4.5 4.5 0 000 9.5z" />
    </svg>
  );
}

export function MobileCreateGroupScreen() {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: chats } = useChatsQuery();
  const createGroup = useCreateGroupChatMutation();
  const updateGroup = useUpdateGroupChatMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarPreviewRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);

  const [step, setStep] = useState<Step>('members');
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
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
      const remotePreview = resolveAvatarSrc(uploaded.url);
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
      navigate({ to: '/chat/$chatId', params: { chatId: chat.id } });
    } catch (err) {
      submitLockRef.current = false;
      setError(err instanceof Error ? err.message : 'Не удалось создать группу');
    } finally {
      setSubmitting(false);
    }
  };

  const memberCountLabel = formatMemberCount(selectedUsers.length);

  const resolvedAvatar = avatarPreview ?? resolveAvatarSrc(avatarUrl);

  if (step === 'details') {
    return (
      <SettingsSubpageLayout
        title="Новая группа"
        onBack={() => {
          setStep('members');
          setError(null);
        }}
        headerRight={
          <button
            type="button"
            className="mobile-create-group__header-action"
            disabled={submitting || uploadingAvatar || !groupName.trim()}
            onClick={() => void handleCreate()}
            aria-label="Создать группу"
          >
            {submitting ? (
              <span className="mobile-auth__spinner" role="status" />
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        }
      >
        <div className="mobile-create-group mobile-create-group--details">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void handleAvatarPick(e.target.files?.[0])}
          />

          <div className="mobile-create-group__details-card">
            <button
              type="button"
              className="mobile-create-group__photo-btn"
              aria-label="Выбрать фото группы"
              disabled={uploadingAvatar || submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              {resolvedAvatar ? (
                <img className="mobile-create-group__photo-img" src={resolvedAvatar} alt="" />
              ) : uploadingAvatar ? (
                <span className="mobile-auth__spinner" role="status" />
              ) : (
                <CameraIcon />
              )}
            </button>

            <label className="mobile-create-group__name-wrap" htmlFor="group-name">
              <span className="mobile-create-group__name-label">Название группы</span>
              <input
                id="group-name"
                className="mobile-create-group__name-input"
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
            </label>
          </div>

          <p className="mobile-create-group__members-hint">{memberCountLabel}</p>

          {error ? (
            <p className="mobile-create-group__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </SettingsSubpageLayout>
    );
  }

  return (
    <SettingsSubpageLayout title="Добавить участников" backTo="/compose">
      <div className="mobile-create-group mobile-create-group--members">
        {selectedUsers.length > 0 ? (
          <div className="mobile-create-group__selected-scroll" aria-label="Выбранные участники">
            {selectedUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                className="mobile-create-group__selected-chip"
                onClick={() => toggleUser(user)}
                aria-label={`Убрать ${getDisplayName(user)}`}
              >
                <span className="mobile-create-group__selected-avatar-wrap">
                  <MemberAvatar user={user} size={52} />
                  <span className="mobile-create-group__selected-remove" aria-hidden>
                    ×
                  </span>
                </span>
                <span className="mobile-create-group__selected-name">{getDisplayName(user)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <label className="mobile-create-group__search" htmlFor="group-member-search">
          <span className="mobile-create-group__search-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" strokeLinecap="round" />
            </svg>
          </span>
          <input
            id="group-member-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Кого добавить?"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>

        <div className="mobile-create-group__results-card mobile-create-group__results-card--flush">
          {searchLoading && query.trim() ? (
            <div className="mobile-create-group__center">
              <div className="mobile-auth__spinner" role="status" />
            </div>
          ) : visibleResults.length === 0 ? (
            <div className="mobile-create-group__empty">
              <div className="mobile-create-group__empty-title">
                {query.trim() ? 'Никого не нашли' : 'Добавьте участников'}
              </div>
              <div className="mobile-create-group__empty-subtitle">
                {query.trim()
                  ? 'Попробуйте другое имя или @username.'
                  : 'Выберите людей из контактов или найдите по имени.'}
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
                      {user.handle
                        ? `@${user.handle.replace(/^@+/, '')}`
                        : user.username || 'пользователь'}
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

        <button
          type="button"
          className="mobile-create-group__fab"
          disabled={selectedUsers.length === 0}
          onClick={goNext}
          aria-label="Далее"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </SettingsSubpageLayout>
  );
}
