import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChannelDetailQuery,
  useUpdateChannelMutation,
} from '@/queries/channel.queries';
import { ApiError } from '@/services/apiClient';
import { resolveAvatarSrc, getAvatarColor } from '../utils/avatar';
import { uploadFile } from '@/services/mediaService';

interface MobileChannelEditScreenProps {
  channelId: string;
}

export function MobileChannelEditScreen({ channelId }: MobileChannelEditScreenProps) {
  const navigate = useNavigate();
  const { data: detail, isLoading, isError, error } = useChannelDetailQuery(channelId);
  const updateChannel = useUpdateChannelMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const permissions = detail?.channel_permissions;
  const canEditAvatar =
    permissions?.can_edit_channel_avatar === true || permissions?.can_edit_channel === true;
  const canEditName =
    permissions?.can_edit_channel_name === true || permissions?.can_edit_channel === true;
  const canEditDescription =
    permissions?.can_edit_channel_description === true || permissions?.can_edit_channel === true;
  const canEditAnything = canEditAvatar || canEditName || canEditDescription;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!detail?.channel || hydratedRef.current) return;
    hydratedRef.current = true;
    setName(detail.channel.name ?? '');
    setDescription(detail.channel.description ?? '');
    setAvatarUrl(detail.channel.avatar_url ?? null);
  }, [detail]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 1800);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  const avatarSrc = resolveAvatarSrc(avatarUrl);
  const initial = (name.trim()[0] || 'К').toUpperCase();

  const loadErrorMessage = useMemo(() => {
    if (!isError) return null;
    if (error instanceof ApiError && error.status === 403) {
      return 'Нет доступа к каналу';
    }
    return error instanceof Error ? error.message : 'Канал не найден';
  }, [error, isError]);

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file) return;
    if (!canEditAvatar) {
      setSnackbar('Недостаточно прав для изменения аватара канала');
      return;
    }
    setUploading(true);
    setSaveError(null);
    try {
      const uploaded = await uploadFile(file);
      setAvatarUrl(uploaded.url);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!canEditAnything) {
      setSnackbar('Недостаточно прав для изменения канала');
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError('Введите название канала.');
      return;
    }

    const currentName = (detail?.channel.name ?? '').trim();
    const currentDescription = (detail?.channel.description ?? '').trim();
    const currentAvatar = detail?.channel.avatar_url ?? null;
    const nextDescription = description.trim();

    if (trimmed !== currentName && !canEditName) {
      setSnackbar('Недостаточно прав для изменения названия канала');
      return;
    }
    if (nextDescription !== currentDescription && !canEditDescription) {
      setSnackbar('Недостаточно прав для изменения описания канала');
      return;
    }
    if ((avatarUrl ?? null) !== currentAvatar && !canEditAvatar) {
      setSnackbar('Недостаточно прав для изменения аватара канала');
      return;
    }

    const payload: { name?: string; description?: string; avatar_url?: string } = {};
    if (canEditName) payload.name = trimmed;
    if (canEditDescription) payload.description = nextDescription;
    if (canEditAvatar) payload.avatar_url = avatarUrl ?? undefined;

    setSaveError(null);
    updateChannel.mutate(
      { channelId, payload },
      {
        onSuccess: () =>
          navigate({ to: '/channel/$channelId/profile', params: { channelId } }),
        onError: (err) =>
          setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить'),
      },
    );
  };

  if (isLoading && !detail) {
    return <div className="mobile-chat-profile__loading">Загрузка…</div>;
  }

  if ((isError || !detail?.channel) && !detail) {
    return (
      <div className="mobile-channel-edit">
        <header className="mobile-chat-profile__toolbar">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() =>
              navigate({ to: '/channel/$channelId/profile', params: { channelId } })
            }
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Изменить канал</span>
        </header>
        <p className="mobile-chat-profile__empty">{loadErrorMessage ?? 'Канал не найден'}</p>
      </div>
    );
  }

  return (
    <div className="mobile-channel-edit">
      <header className="mobile-chat-profile__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={() =>
            navigate({ to: '/channel/$channelId/profile', params: { channelId } })
          }
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">Изменить канал</span>
      </header>

      <div className="mobile-channel-edit__scroll">
        {!canEditAnything ? (
          <div className="mobile-channel-edit__no-rights" role="status">
            Недостаточно прав для редактирования канала.
          </div>
        ) : null}

        <button
          type="button"
          className="mobile-channel-edit__avatar-btn"
          disabled={!canEditAvatar || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {avatarSrc ? (
            <img className="mobile-channel-edit__avatar" src={avatarSrc} alt="" />
          ) : (
            <div
              className="mobile-channel-edit__avatar-fallback"
              style={{ backgroundColor: getAvatarColor(name || 'К') }}
            >
              {uploading ? '…' : initial}
            </div>
          )}
          <span
            className={`mobile-channel-edit__avatar-hint${!canEditAvatar ? ' mobile-channel-edit__avatar-hint--disabled' : ''}`}
          >
            {avatarUrl ? 'Изменить фото' : 'Поставить фото'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void handleAvatarPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <label className="mobile-channel-edit__label" htmlFor="channel-edit-name">
          Название
        </label>
        <input
          id="channel-edit-name"
          className="mobile-channel-edit__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название канала"
          disabled={!canEditName}
        />

        <label className="mobile-channel-edit__label" htmlFor="channel-edit-description">
          Описание
        </label>
        <textarea
          id="channel-edit-description"
          className="mobile-channel-edit__input mobile-channel-edit__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание"
          disabled={!canEditDescription}
          rows={5}
        />

        {saveError ? (
          <p className="mobile-channel-edit__error" role="alert">
            {saveError}
          </p>
        ) : null}

        <button
          type="button"
          className="mobile-channel-edit__save"
          disabled={!canEditAnything || updateChannel.isPending || uploading}
          onClick={handleSave}
        >
          {updateChannel.isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>

      {snackbar ? (
        <div className="mobile-channel-edit__snackbar" role="status">
          {snackbar}
        </div>
      ) : null}
    </div>
  );
}
