import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChannelDetailQuery } from '@/queries/channel.queries';
import { ApiError } from '@/services/apiClient';
import { buildChannelInviteDeepLink } from '../utils/channelLinks';

interface MobileChannelInviteLinksScreenProps {
  channelId: string;
}

export function MobileChannelInviteLinksScreen({
  channelId,
}: MobileChannelInviteLinksScreenProps) {
  const navigate = useNavigate();
  const { data: detail, isLoading, isError, error } = useChannelDetailQuery(channelId);
  const channel = detail?.channel;
  const canEdit = detail?.channel_permissions?.can_edit_channel === true;
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const inviteToken = channel?.invite_token?.trim();
  const linkText = inviteToken ? buildChannelInviteDeepLink(inviteToken) : '';

  useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 2000);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  const goBack = useCallback(() => {
    navigate({ to: '/channel/$channelId/settings', params: { channelId } });
  }, [channelId, navigate]);

  const handleCopy = useCallback(async () => {
    if (!linkText) return;
    try {
      await navigator.clipboard.writeText(linkText);
      setSnackbar('Ссылка скопирована');
    } catch {
      setSnackbar('Не удалось скопировать');
    }
  }, [linkText]);

  const handleShare = useCallback(async () => {
    if (!linkText) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: linkText });
        return;
      }
      await navigator.clipboard.writeText(linkText);
      setSnackbar('Ссылка скопирована');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setSnackbar('Не удалось поделиться');
    }
  }, [linkText]);

  if (isLoading) {
    return <div className="mobile-chat-profile__loading">Загрузка…</div>;
  }

  if (isError || !channel) {
    const message =
      error instanceof ApiError && error.status === 403
        ? 'Нет доступа к каналу'
        : error instanceof Error
          ? error.message
          : 'Канал не найден';
    return (
      <div className="mobile-channel-invite">
        <header className="mobile-chat-profile__toolbar">
          <button type="button" className="mobile-chat__back" onClick={goBack} aria-label="Назад">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Пригласительные ссылки</span>
        </header>
        <p className="mobile-chat-profile__empty">{message}</p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="mobile-channel-invite">
        <header className="mobile-chat-profile__toolbar">
          <button type="button" className="mobile-chat__back" onClick={goBack} aria-label="Назад">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Пригласительные ссылки</span>
        </header>
        <p className="mobile-chat-profile__empty">Недостаточно прав</p>
      </div>
    );
  }

  return (
    <div className="mobile-channel-invite">
      <header className="mobile-chat-profile__toolbar">
        <button type="button" className="mobile-chat__back" onClick={goBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">Пригласительные ссылки</span>
      </header>

      <div className="mobile-channel-invite__scroll">
        <p className="mobile-channel-invite__intro">
          Любой пользователь сможет подписаться на канал при помощи этой ссылки.
        </p>

        <p className="mobile-channel-type__section-label">ССЫЛКА-ПРИГЛАШЕНИЕ</p>
        <section className="mobile-channel-type__card mobile-channel-type__invite-card">
          <p className="mobile-channel-type__invite-pill">{linkText || 'Ссылка недоступна'}</p>

          <div className="mobile-channel-invite__actions">
            <button
              type="button"
              className="mobile-channel-invite__btn"
              disabled={!linkText}
              onClick={() => void handleCopy()}
            >
              Копировать
            </button>
            <button
              type="button"
              className="mobile-channel-invite__btn"
              disabled={!linkText}
              onClick={() => void handleShare()}
            >
              Поделиться
            </button>
          </div>
        </section>

        <p className="mobile-channel-type__hint">
          По этой ссылке можно подписаться на канал. Вы можете сбросить её в любой момент (скоро).
        </p>
      </div>

      {snackbar ? (
        <div className="mobile-channel-settings__snackbar" role="status">
          {snackbar}
        </div>
      ) : null}
    </div>
  );
}
