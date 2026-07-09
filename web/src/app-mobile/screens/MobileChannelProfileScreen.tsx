import { useMemo, useState } from 'react';
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

  const handleUnsubscribe = () => {
    if (!window.confirm('Отписаться от канала?')) return;
    setActionError(null);
    unsubscribe.mutate(channelId, {
      onSuccess: () => navigate({ to: '/' }),
      onError: (err) =>
        setActionError(err instanceof Error ? err.message : 'Не удалось отписаться'),
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
  const isOwner = channel.members?.some((m) => m.user_id === me?.id && m.role === 'owner');

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
        {canEditSettings ? (
          <button
            type="button"
            className="mobile-channel-profile__settings-btn"
            onClick={() =>
              navigate({ to: '/channel/$channelId/settings', params: { channelId } })
            }
            aria-label="Настройки канала"
          >
            ⚙
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

        <section className="mobile-channel-settings__card mobile-channel-profile__menu">
          <button
            type="button"
            className="mobile-group-profile__settings-row"
            onClick={() => muteChat.mutate({ chatId: channelId, muted: !channel.is_muted })}
          >
            <span>Уведомления</span>
            <span>{channel.is_muted ? 'выкл.' : 'вкл.'}</span>
          </button>
        </section>

        {detail?.can_post ? (
          <section className="mobile-channel-settings__card mobile-channel-profile__menu">
            <button
              type="button"
              className="mobile-channel-settings__row mobile-channel-settings__row--plain"
              onClick={() => {
                if (!canAdminOps) return;
                navigate({ to: '/settings/coming-soon', search: { title: 'Администраторы' } });
              }}
              disabled={!canAdminOps}
            >
              <span className="mobile-channel-settings__row-icon" style={{ backgroundColor: '#1E88E5' }}>
                🛡
              </span>
              <span className="mobile-channel-settings__row-title">Администраторы</span>
              <span className="mobile-channel-settings__row-value">{adminCount}</span>
            </button>
            <div className="mobile-channel-settings__divider" />
            <button
              type="button"
              className="mobile-channel-settings__row mobile-channel-settings__row--plain"
              onClick={() => {
                if (!canModerate && !canAdminOps) return;
                navigate({ to: '/settings/coming-soon', search: { title: 'Подписчики' } });
              }}
              disabled={!canModerate && !canAdminOps}
            >
              <span className="mobile-channel-settings__row-icon" style={{ backgroundColor: '#34C759' }}>
                👥
              </span>
              <span className="mobile-channel-settings__row-title">Подписчики</span>
              <span className="mobile-channel-settings__row-value">{subscriberCount}</span>
            </button>
            <div className="mobile-channel-settings__divider" />
            <button
              type="button"
              className="mobile-channel-settings__row mobile-channel-settings__row--plain"
              onClick={() => {
                if (!canEditSettings) return;
                navigate({ to: '/channel/$channelId/settings', params: { channelId } });
              }}
              disabled={!canEditSettings}
            >
              <span className="mobile-channel-settings__row-icon" style={{ backgroundColor: '#F2994A' }}>
                ⚙
              </span>
              <span className="mobile-channel-settings__row-title">Настройки канала</span>
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

        {detail?.is_subscribed && !detail.can_post && !isOwner ? (
          <section className="mobile-group-profile__danger">
            <button
              type="button"
              className="mobile-group-profile__danger-btn"
              onClick={handleUnsubscribe}
            >
              Отписаться
            </button>
          </section>
        ) : null}

        {actionError ? (
          <p className="mobile-group-profile__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
