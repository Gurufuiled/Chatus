import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChannelDetailQuery,
  useUnsubscribeChannelMutation,
} from '@/queries/channel.queries';
import { useMuteChatMutation } from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { resolveMediaUrl } from '@/services/mediaService';
import { ApiError } from '@/services/apiClient';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { formatSubscriberCount } from '../utils/channelUtils';
import {
  buildChannelInviteDeepLink,
  buildChannelSlugDeepLink,
} from '../utils/channelLinks';
import { ChannelRowIcon, FeatherIcon } from '../icons/featherIcons';

interface MobileChannelProfileScreenProps {
  channelId: string;
}

export function MobileChannelProfileScreen({ channelId }: MobileChannelProfileScreenProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: detail, isLoading, isError, error } = useChannelDetailQuery(channelId);
  const unsubscribe = useUnsubscribeChannelMutation();
  const muteChat = useMuteChatMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const channel = detail?.channel;
  const displayName = channel ? getChatDisplayName(channel) : 'Канал';
  const avatarSrc = resolveAvatarSrc(channel?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();

  const permissions = detail?.channel_permissions;
  const canAdminOps =
    permissions?.can_add_admins === true ||
    permissions?.can_remove_admins === true ||
    permissions?.can_edit_admin_permissions === true ||
    permissions?.can_manage_admins === true;
  const canModerate = permissions?.can_moderate_subscribers === true;
  const canEditSettings = permissions?.can_edit_channel === true;
  const canOpenEdit =
    permissions?.can_edit_channel_avatar === true ||
    permissions?.can_edit_channel_name === true ||
    permissions?.can_edit_channel_description === true ||
    canEditSettings;
  const showManagementMenu = canAdminOps || canModerate || canEditSettings;

  const membership = channel?.members?.find((m) => m.user_id === me?.id);
  const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin';
  const showSubscriberToolbar =
    detail?.is_subscribed === true &&
    !canEditSettings &&
    !detail.can_post &&
    !isOwnerOrAdmin;

  const mediaItems = useMemo(() => {
    return (detail?.preview_posts ?? [])
      .filter((m) => !m.is_deleted && (m.msg_type === 'image' || m.msg_type === 'video'))
      .flatMap((m) => {
        const media = m.media?.[0];
        if (!media?.remote_url && !media?.thumbnail_url) return [];
        const thumb = resolveMediaUrl(media.thumbnail_url ?? media.remote_url ?? '');
        return [{ id: m.id, thumb, kind: m.msg_type as 'image' | 'video' }];
      })
      .slice(0, 12);
  }, [detail?.preview_posts]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 1800);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  const handleConfirmLeave = () => {
    setActionError(null);
    unsubscribe.mutate(channelId, {
      onSuccess: () => {
        setLeaveConfirmVisible(false);
        navigate({ to: '/' });
      },
      onError: (err) => {
        setLeaveConfirmVisible(false);
        setActionError(err instanceof Error ? err.message : 'Не удалось отписаться');
      },
    });
  };

  const loadErrorMessage = useMemo(() => {
    if (!isError) return null;
    if (error instanceof ApiError && error.status === 403) {
      return 'Нет доступа к каналу';
    }
    return error instanceof Error ? error.message : 'Канал не найден';
  }, [error, isError]);

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
          <span className="mobile-chat-profile__toolbar-title">Канал</span>
        </header>
        <p className="mobile-chat-profile__empty">{loadErrorMessage ?? 'Канал не найден'}</p>
      </div>
    );
  }

  const subscriberCount = channel.subscriber_count ?? 0;
  const adminCount = (channel.members ?? []).filter(
    (m) => m.role === 'owner' || m.role === 'admin',
  ).length;
  const publicDeepLink =
    channel.visibility === 'public' && channel.slug?.trim()
      ? buildChannelSlugDeepLink(channel.slug.trim())
      : null;
  const inviteDeepLink = channel.invite_token
    ? buildChannelInviteDeepLink(channel.invite_token)
    : null;
  const description = channel.description?.trim() || 'Описание не указано';

  return (
    <div className="mobile-chat-profile mobile-channel-profile">
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
        <span className="mobile-chat-profile__toolbar-title">Канал</span>
        {canOpenEdit ? (
          <button
            type="button"
            className="mobile-channel-profile__edit-pill"
            onClick={() =>
              navigate({ to: '/channel/$channelId/edit', params: { channelId } })
            }
          >
            <span className="mobile-channel-profile__edit-plus">+</span>
            <span>Изм.</span>
          </button>
        ) : null}
      </header>

      <div className="mobile-chat-profile__scroll">
        <div className="mobile-chat-profile__hero mobile-channel-profile__hero">
          {avatarSrc ? (
            <img className="mobile-chat-profile__avatar" src={avatarSrc} alt="" />
          ) : (
            <div
              className="mobile-chat-profile__avatar-fallback"
              style={{ backgroundColor: getAvatarColor(displayName) }}
            >
              {initial}
            </div>
          )}
          <h1 className="mobile-chat-profile__name">{displayName}</h1>
          <p className="mobile-chat-profile__status">
            {formatSubscriberCount(subscriberCount)}
          </p>
        </div>

        {showSubscriberToolbar ? (
          <section className="mobile-channel-profile__subscriber-toolbar">
            <button
              type="button"
              className="mobile-channel-profile__toolbar-pill"
              onClick={() => muteChat.mutate({ chatId: channelId, muted: !channel.is_muted })}
              disabled={muteChat.isPending}
            >
              <FeatherIcon name={channel.is_muted ? 'bell' : 'bell-off'} size={22} />
              <span>{channel.is_muted ? 'Звук' : 'Без звука'}</span>
            </button>
            <button
              type="button"
              className="mobile-channel-profile__toolbar-pill"
              onClick={() => setLeaveConfirmVisible(true)}
              disabled={unsubscribe.isPending}
            >
              <FeatherIcon name="log-out" size={22} />
              <span>Покинуть</span>
            </button>
          </section>
        ) : null}

        <section className="mobile-channel-profile__info-card">
          {publicDeepLink ? (
            <>
              <p className="mobile-channel-profile__info-label">ссылка</p>
              <p className="mobile-channel-profile__info-link">{publicDeepLink}</p>
              <div className="mobile-channel-profile__info-divider" />
            </>
          ) : null}
          {channel.visibility === 'private' && inviteDeepLink ? (
            <>
              <p className="mobile-channel-profile__info-label">приглашение</p>
              <p className="mobile-channel-profile__info-link">{inviteDeepLink}</p>
              <div className="mobile-channel-profile__info-divider" />
            </>
          ) : null}
          <p className="mobile-channel-profile__info-label">описание</p>
          <p className="mobile-channel-profile__info-text">{description}</p>
        </section>

        {showManagementMenu ? (
          <section className="mobile-channel-settings__card mobile-channel-profile__menu">
            <button
              type="button"
              className="mobile-channel-settings__row mobile-channel-settings__row--plain"
              onClick={() => {
                if (!canAdminOps) {
                  setSnackbar('Недостаточно прав для управления администраторами');
                  return;
                }
                navigate({ to: '/channel/$channelId/admins', params: { channelId } });
              }}
            >
              <ChannelRowIcon name="shield" bgColor="#1E88E5" />
              <span className="mobile-channel-settings__row-title">Администраторы</span>
              <span className="mobile-channel-settings__row-value">{adminCount}</span>
              <FeatherIcon
                name="chevron-right"
                size={18}
                className="mobile-channel-settings__row-chevron"
              />
            </button>
            <div className="mobile-channel-settings__divider" />
            <button
              type="button"
              className="mobile-channel-settings__row mobile-channel-settings__row--plain"
              onClick={() => {
                if (!canModerate && !canAdminOps) {
                  setSnackbar('Недостаточно прав для просмотра подписчиков');
                  return;
                }
                navigate({ to: '/channel/$channelId/subscribers', params: { channelId } });
              }}
            >
              <ChannelRowIcon name="users" bgColor="#34C759" />
              <span className="mobile-channel-settings__row-title">Подписчики</span>
              <span className="mobile-channel-settings__row-value">{subscriberCount}</span>
              <FeatherIcon
                name="chevron-right"
                size={18}
                className="mobile-channel-settings__row-chevron"
              />
            </button>
            <div className="mobile-channel-settings__divider" />
            <button
              type="button"
              className="mobile-channel-settings__row mobile-channel-settings__row--plain"
              onClick={() => {
                if (!canEditSettings) {
                  setSnackbar('Недостаточно прав для настроек канала');
                  return;
                }
                navigate({ to: '/channel/$channelId/settings', params: { channelId } });
              }}
            >
              <ChannelRowIcon name="sliders" bgColor="#F2994A" />
              <span className="mobile-channel-settings__row-title">Настройки канала</span>
              <FeatherIcon
                name="chevron-right"
                size={18}
                className="mobile-channel-settings__row-chevron"
              />
            </button>
          </section>
        ) : null}

        <section className="mobile-chat-profile__section mobile-channel-profile__media-section">
          <h2 className="mobile-chat-profile__section-title">Медиа</h2>
          {mediaItems.length > 0 ? (
            <div className="mobile-chat-profile__media-grid">
              {mediaItems.map((item) => (
                <div key={item.id} className="mobile-chat-profile__media-tile">
                  <img src={item.thumb} alt="" loading="lazy" />
                  {item.kind === 'video' ? (
                    <span className="mobile-chat-profile__media-badge" aria-hidden>
                      ▶
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mobile-channel-profile__media-empty">
              Фото и видео из публикаций канала появятся здесь.
            </p>
          )}
        </section>

        {actionError ? (
          <p className="mobile-group-profile__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      {leaveConfirmVisible ? (
        <div
          className="mobile-channel-profile__confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-leave-title"
        >
          <button
            type="button"
            className="mobile-channel-profile__confirm-backdrop"
            aria-label="Закрыть"
            disabled={unsubscribe.isPending}
            onClick={() => {
              if (!unsubscribe.isPending) setLeaveConfirmVisible(false);
            }}
          />
          <div className="mobile-channel-profile__confirm-card">
            <h2 id="channel-leave-title" className="mobile-channel-profile__confirm-title">
              Отписка от канала
            </h2>
            <p className="mobile-channel-profile__confirm-body">
              Вы точно хотите покинуть канал <strong>{displayName}</strong>?
            </p>
            <div className="mobile-channel-profile__confirm-actions">
              <button
                type="button"
                className="mobile-channel-profile__confirm-danger"
                disabled={unsubscribe.isPending}
                onClick={handleConfirmLeave}
              >
                {unsubscribe.isPending ? '…' : 'Покинуть'}
              </button>
              <button
                type="button"
                className="mobile-channel-profile__confirm-cancel"
                disabled={unsubscribe.isPending}
                onClick={() => setLeaveConfirmVisible(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {snackbar ? (
        <div className="mobile-channel-profile__snackbar" role="status">
          {snackbar}
        </div>
      ) : null}
    </div>
  );
}
