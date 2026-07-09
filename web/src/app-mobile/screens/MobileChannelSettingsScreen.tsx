import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChannelDetailQuery,
  useUpdateChannelMutation,
} from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { ApiError } from '@/services/apiClient';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { formatSubscriberCount } from '../utils/channelUtils';

interface MobileChannelSettingsScreenProps {
  channelId: string;
}

type SettingsRowProps = {
  icon: string;
  iconBg: string;
  title: string;
  value?: string;
  disabled?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

function SettingsRow({
  icon,
  iconBg,
  title,
  value,
  disabled,
  onPress,
  trailing,
}: SettingsRowProps) {
  const interactive = !!onPress && !disabled;

  if (interactive) {
    return (
      <button
        type="button"
        className="mobile-channel-settings__row"
        disabled={disabled}
        onClick={onPress}
      >
        <span className="mobile-channel-settings__row-icon" style={{ backgroundColor: iconBg }}>
          {icon}
        </span>
        <span className="mobile-channel-settings__row-title">{title}</span>
        {value ? <span className="mobile-channel-settings__row-value">{value}</span> : null}
        {trailing ?? (
          <svg
            className="mobile-channel-settings__row-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div className={`mobile-channel-settings__row${disabled ? ' mobile-channel-settings__row--disabled' : ''}`}>
      <span className="mobile-channel-settings__row-icon" style={{ backgroundColor: iconBg }}>
        {icon}
      </span>
      <span className="mobile-channel-settings__row-title">{title}</span>
      {value ? <span className="mobile-channel-settings__row-value">{value}</span> : null}
      {trailing}
    </div>
  );
}

export function MobileChannelSettingsScreen({ channelId }: MobileChannelSettingsScreenProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: detail, isLoading, isError, error } = useChannelDetailQuery(channelId);
  const updateChannel = useUpdateChannelMutation();
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [allowReactions, setAllowReactions] = useState(true);

  const channel = detail?.channel;
  const displayName = channel ? getChatDisplayName(channel) : 'Канал';
  const avatarSrc = resolveAvatarSrc(channel?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();

  const isOwner = useMemo(() => {
    if (!channel || !me?.id) return false;
    const membership = channel.members?.find((m) => m.user_id === me.id);
    return membership?.role === 'owner';
  }, [channel, me?.id]);

  const permissions = detail?.channel_permissions;
  const canEdit = permissions?.can_edit_channel === true;
  const canAdminOps =
    permissions?.can_add_admins === true ||
    permissions?.can_remove_admins === true ||
    permissions?.can_edit_admin_permissions === true ||
    permissions?.can_manage_admins === true;
  const canModerate = permissions?.can_moderate_subscribers === true;

  useEffect(() => {
    if (channel) {
      setAllowReactions(channel.allow_reactions !== false);
    }
  }, [channel?.allow_reactions, channel]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 1800);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  const openComingSoon = (title: string) => {
    navigate({ to: '/settings/coming-soon', search: { title } });
  };

  const showPermissionHint =
    !isOwner && (!canEdit || !canAdminOps || !canModerate);

  const loadErrorMessage = useMemo(() => {
    if (!isError) return null;
    if (error instanceof ApiError && error.status === 403) {
      return 'Нет доступа к каналу';
    }
    return error instanceof Error ? error.message : 'Канал не найден';
  }, [error, isError]);

  const handleToggleReactions = (next: boolean) => {
    if (!canEdit) {
      setSnackbar('Недостаточно прав');
      return;
    }
    setAllowReactions(next);
    updateChannel.mutate(
      { channelId, payload: { allow_reactions: next } },
      {
        onError: () => {
          setAllowReactions(!next);
          setSnackbar('Не удалось сохранить');
        },
      },
    );
  };

  if (isLoading) {
    return <div className="mobile-chat-profile__loading">Загрузка…</div>;
  }

  if (isError || !channel) {
    return (
      <div className="mobile-chat-profile">
        <header className="mobile-chat-profile__toolbar">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Настройки канала</span>
        </header>
        <p className="mobile-chat-profile__empty">{loadErrorMessage ?? 'Канал не найден'}</p>
      </div>
    );
  }

  const adminCount = (channel.members ?? []).filter(
    (m) => m.role === 'owner' || m.role === 'admin',
  ).length;
  const subscriberCount = channel.subscriber_count ?? 0;
  const visibilityLabel = channel.visibility === 'private' ? 'Частный' : 'Публичный';
  const hasAnyAdminAccess = isOwner || canEdit || canAdminOps || canModerate;

  if (!hasAnyAdminAccess) {
    return (
      <div className="mobile-chat-profile">
        <header className="mobile-chat-profile__toolbar">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() => navigate({ to: '/channel/$channelId', params: { channelId } })}
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Настройки канала</span>
        </header>
        <p className="mobile-chat-profile__empty">Нет доступа к настройкам канала</p>
      </div>
    );
  }

  return (
    <div className="mobile-channel-settings">
      <header className="mobile-chat-profile__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={() => navigate({ to: '/channel/$channelId', params: { channelId } })}
          aria-label="Назад к ленте"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">Настройки канала</span>
      </header>

      <div className="mobile-channel-settings__scroll">
        <div className="mobile-channel-settings__channel-card">
          {avatarSrc ? (
            <img className="mobile-channel-settings__avatar" src={avatarSrc} alt="" />
          ) : (
            <div
              className="mobile-channel-settings__avatar-fallback"
              style={{ backgroundColor: getAvatarColor(displayName) }}
            >
              {initial}
            </div>
          )}
          <div className="mobile-channel-settings__channel-info">
            <h1 className="mobile-channel-settings__channel-name">{displayName}</h1>
            <p className="mobile-channel-settings__channel-sub">
              {formatSubscriberCount(subscriberCount)}
            </p>
          </div>
        </div>

        <section className="mobile-channel-settings__card">
          <SettingsRow
            icon="🌐"
            iconBg="#007AFF"
            title="Тип канала"
            value={visibilityLabel}
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return setSnackbar('Недостаточно прав для настроек канала');
              openComingSoon('Тип канала');
            }}
          />
          <div className="mobile-channel-settings__divider" />
          <SettingsRow
            icon="🔗"
            iconBg="#FF9500"
            title="Пригласительные ссылки"
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return setSnackbar('Недостаточно прав для настроек канала');
              openComingSoon('Пригласительные ссылки');
            }}
          />
          <div className="mobile-channel-settings__divider" />
          <SettingsRow
            icon="💬"
            iconBg="#34C759"
            title="Обсуждение"
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return setSnackbar('Недостаточно прав для настроек канала');
              openComingSoon('Обсуждение');
            }}
          />
          <div className="mobile-channel-settings__divider" />
          <SettingsRow
            icon="❤️"
            iconBg="#FF3B30"
            title="Реакции"
            disabled={!canEdit}
            trailing={
              <label className="mobile-channel-settings__switch">
                <input
                  type="checkbox"
                  checked={allowReactions}
                  disabled={!canEdit || updateChannel.isPending}
                  onChange={(e) => handleToggleReactions(e.target.checked)}
                />
                <span className="mobile-channel-settings__switch-slider" />
              </label>
            }
          />
        </section>

        {isOwner ? (
          <>
            <section className="mobile-channel-settings__card">
              <SettingsRow
                icon="📈"
                iconBg="#16A34A"
                title="Монетизация"
                value="Демо"
                onPress={() => openComingSoon('Монетизация')}
              />
            </section>
            <p className="mobile-channel-settings__caption">
              Платные подписки, статистика и выплаты. Доступно только владельцу канала.
            </p>
          </>
        ) : null}

        <section className="mobile-channel-settings__card">
          <SettingsRow
            icon="🛡"
            iconBg="#5856D6"
            title="Администраторы"
            value={String(adminCount)}
            disabled={!canAdminOps}
            onPress={() => {
              if (!canAdminOps) {
                return setSnackbar('Недостаточно прав для управления администраторами');
              }
              openComingSoon('Администраторы');
            }}
          />
          <div className="mobile-channel-settings__divider" />
          <SettingsRow
            icon="👥"
            iconBg="#007AFF"
            title="Подписчики"
            value={String(subscriberCount)}
            disabled={!canModerate && !canAdminOps}
            onPress={() => {
              if (!canModerate && !canAdminOps) {
                return setSnackbar('Недостаточно прав для просмотра подписчиков');
              }
              openComingSoon('Подписчики');
            }}
          />
          <div className="mobile-channel-settings__divider" />
          <SettingsRow
            icon="⛔"
            iconBg="#FF9500"
            title="Чёрный список"
            disabled={!canModerate && !canAdminOps}
            onPress={() => {
              if (!canModerate && !canAdminOps) return setSnackbar('Недостаточно прав');
              openComingSoon('Чёрный список');
            }}
          />
        </section>

        {showPermissionHint ? (
          <div className="mobile-channel-settings__banner" role="status">
            <span aria-hidden>🔒</span>
            <span>
              Некоторые разделы доступны в зависимости от ваших прав администратора.
            </span>
          </div>
        ) : null}
      </div>

      {snackbar ? (
        <div className="mobile-channel-settings__snackbar" role="status">
          {snackbar}
        </div>
      ) : null}
    </div>
  );
}
