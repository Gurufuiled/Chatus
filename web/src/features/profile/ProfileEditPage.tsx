import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { IconButton } from '@/components/buttons/IconButton';
import { Avatar } from '@/components/avatar/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMeQuery, useUpdateProfileMutation } from '@/queries/profile.queries';
import { resolveMediaUrl, uploadFile } from '@/services/mediaService';
import { getDisplayName, birthdayMsToInputValue } from './profileFormatters';
import {
  ProfileForm,
  userToFormValues,
  validateProfileForm,
} from './ProfileForm';
import type { ProfileFormValues } from '@/types/profile';
import './profile.css';

export function ProfileEditPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: me, isLoading, isError, error } = useMeQuery();
  const updateMutation = useUpdateProfileMutation();

  const [values, setValues] = useState<ProfileFormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    if (me && !values) {
      setValues(userToFormValues(me));
    }
  }, [me, values]);

  const buildPayload = () => {
    if (!me || !values) return null;
    return {
      display_name: values.firstName.trim(),
      last_name: values.lastName.trim() || null,
      bio: values.bio.trim() || null,
      birthday: values.birthday || null,
      handle: values.username.trim() || null,
      ...(pendingAvatarUrl ? { avatar_url: pendingAvatarUrl } : {}),
    };
  };

  const isDirty = () => {
    const payload = buildPayload();
    if (!me || !payload) return false;
    return !(
      payload.display_name === (me.display_name ?? '') &&
      (payload.last_name ?? '') === (me.last_name ?? '') &&
      (payload.bio ?? '') === (me.bio ?? '') &&
      (payload.birthday ?? '') === (birthdayMsToInputValue(me.birthday) || '') &&
      (payload.handle ?? '') === (me.handle ?? '') &&
      !pendingAvatarUrl
    );
  };

  const goBack = () => {
    void navigate({ to: '/settings/profile' });
  };

  const saveProfile = async () => {
    if (!me || !values) return;

    const validationError = validateProfileForm(values);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = buildPayload();
    if (!payload) return;

    if (!isDirty()) {
      void navigate({ to: '/settings/profile' });
      return;
    }

    try {
      await updateMutation.mutateAsync(payload);
      void navigate({ to: '/settings/profile' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось сохранить профиль');
    }
  };

  const onAvatarPick = async (file: File | null) => {
    if (!file) return;
    setFormError(null);
    setIsUploadingAvatar(true);
    try {
      const upload = await uploadFile(file);
      setPendingAvatarUrl(upload.url);
      setAvatarPreview(resolveMediaUrl(upload.url));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  if (isLoading || !values) {
    return (
      <div className="profile-page">
        <Spinner label="Loading profile" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="profile-page">
        <EmptyState
          title="Не удалось загрузить профиль"
          description={error instanceof Error ? error.message : 'Unknown error'}
        />
      </div>
    );
  }

  const displayName = getDisplayName({
    display_name: values.firstName,
    last_name: values.lastName,
    username: me.username,
    handle: values.username || me.handle,
  });
  const avatarUrl =
    avatarPreview ?? (me.avatar_url ? resolveMediaUrl(me.avatar_url) : null);

  return (
    <div className="profile-page">
      <header className="profile-page__header">
        <IconButton label="Назад" onClick={goBack} disabled={updateMutation.isPending}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M12 4L6 10l6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
        <h1 className="profile-page__title">Изменить профиль</h1>
        <IconButton
          label="Сохранить"
          onClick={() => void saveProfile()}
          disabled={updateMutation.isPending || isUploadingAvatar}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M5 10l3.5 3.5L15 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
      </header>

      <div className="profile-page__scroll">
        <div className="profile-edit-hero">
          <div className="profile-edit-avatar">
            <Avatar name={displayName} imageUrl={avatarUrl} size={96} />
            <input
              ref={fileInputRef}
              className="profile-edit-avatar__input"
              type="file"
              accept="image/*"
              onChange={(e) => void onAvatarPick(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="profile-edit-avatar__btn"
              aria-label="Сменить фото"
              disabled={isUploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploadingAvatar ? (
                <span style={{ fontSize: 12 }}>…</span>
              ) : (
                <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path
                    d="M4 8l2.5-2.5a2 2 0 012.8 0L14 10M4 16h12a2 2 0 002-2V7l-4-4H4a2 2 0 00-2 2v9a2 2 0 002 2z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <path d="M12 10h2M11 9v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <ProfileForm
          values={values}
          onChange={(next) => {
            setValues(next);
            setFormError(null);
          }}
          error={formError ?? (updateMutation.isError ? updateMutation.error.message : null)}
        />
      </div>
    </div>
  );
}
