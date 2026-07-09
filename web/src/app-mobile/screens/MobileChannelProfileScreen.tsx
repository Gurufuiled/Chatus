import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChannelDetailQuery,
  useUnsubscribeChannelMutation,
} from '@/queries/channel.queries';
import { useMuteChatMutation } from '@/queries/chats.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { resolveMediaUrl } from '@/services/mediaService';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { formatSubscriberCount } from '../utils/channelUtils';

interface MobileChannelProfileScreenProps {
  channelId: string;
}

export function MobileChannelProfileScreen({ channelId }: MobileChannelProfileScreenProps) {
  const navigate = useNavigate();
  const { data: detail, isLoading, isError } = useChannelDetailQuery(channelId);
  const unsubscribe = useUnsubscribeChannelMutation();
  const muteChat = useMuteChatMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const channel = detail?.channel;
  const displayName = channel ? getChatDisplayName(channel) : 'Канал';
  const avatarSrc = resolveAvatarSrc(channel?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();

  const mediaItems = useMemo(() => {
    return (detail?.preview_posts ?? [])
      .filter((m) => !m.is_deleted && (m.msg_type === 'image' || m.msg_type === 'video'))
      .flatMap((m) => {
        const media = m.media?.[0];
        if (!media?.remote_url && !media?.thumbnail_url) return [];
        const thumb = resolveMediaUrl(media.thumbnail_url ?? media.remote_url ?? '');
        return [{ id: m.id, thumb }];
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

  const openComingSoon = (title: string) => {
    navigate({ to: '/settings/coming-soon', search: { title } });
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
          <span className="mobile-chat-profile__toolbar-title">Канал</span>
        </header>
        <p className="mobile-chat-profile__empty">Канал не найден</p>
      </div>
    );
  }

  const subscriberCount = channel.subscriber_count ?? 0;

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
      </header>

      <div className="mobile-chat-profile__scroll">
        <div className="mobile-chat-profile__hero">
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

        {channel.description?.trim() ? (
          <section className="mobile-chat-profile__section">
            <div className="mobile-chat-profile__row">
              <span className="mobile-chat-profile__row-label">описание</span>
              <span className="mobile-chat-profile__row-value">{channel.description}</span>
            </div>
          </section>
        ) : null}

        <section className="mobile-chat-profile__section">
          <button
            type="button"
            className="mobile-group-profile__settings-row"
            onClick={() => muteChat.mutate({ chatId: channelId, muted: !channel.is_muted })}
          >
            <span>Уведомления</span>
            <span>{channel.is_muted ? 'выкл.' : 'вкл.'}</span>
          </button>
          <div className="mobile-chat-profile__row">
            <span className="mobile-chat-profile__row-label">комментарии</span>
            <span className="mobile-chat-profile__row-value">
              {channel.allow_comments === false ? 'выкл.' : 'вкл.'}
            </span>
          </div>
          <div className="mobile-chat-profile__row">
            <span className="mobile-chat-profile__row-label">реакции</span>
            <span className="mobile-chat-profile__row-value">
              {channel.allow_reactions === false ? 'выкл.' : 'вкл.'}
            </span>
          </div>
        </section>

        {detail?.can_post ? (
          <section className="mobile-chat-profile__section">
            <button
              type="button"
              className="mobile-group-profile__action-row"
              onClick={() => openComingSoon('Управление каналом')}
            >
              Управление каналом
            </button>
            <button
              type="button"
              className="mobile-group-profile__action-row"
              onClick={() => openComingSoon('Администраторы')}
            >
              Администраторы
            </button>
            <button
              type="button"
              className="mobile-group-profile__action-row"
              onClick={() => openComingSoon('Пригласительные ссылки')}
            >
              Пригласительные ссылки
            </button>
          </section>
        ) : null}

        {mediaItems.length > 0 ? (
          <section className="mobile-chat-profile__section">
            <h2 className="mobile-chat-profile__section-title">Медиа</h2>
            <div className="mobile-chat-profile__media-grid">
              {mediaItems.map((item) => (
                <div key={item.id} className="mobile-chat-profile__media-tile">
                  <img src={item.thumb} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {detail?.is_subscribed && !detail.can_post ? (
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
