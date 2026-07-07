import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useUserDetailQuery } from '@/queries/users.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { resolveMediaUrl } from '@/services/mediaService';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';

interface MobileChatProfileScreenProps {
  chatId: string;
}

function formatPresence(isOnline?: boolean, lastSeen?: number | null): string {
  if (isOnline) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';

  const date = new Date(lastSeen);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMins < 1) return 'был(а) только что';
  if (diffMins < 60) return `был(а) ${diffMins} мин. назад`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return `был(а) сегодня в ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return `был(а) ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

export function MobileChatProfileScreen({ chatId }: MobileChatProfileScreenProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading } = useChatsQuery();
  const { data: messages } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const chat = chats?.find((c) => c.id === chatId);

  const peer = useMemo(() => {
    if (!chat || chat.chat_type !== 'private') return null;
    return chat.members?.find((m) => m.user_id !== me?.id) ?? null;
  }, [chat, me?.id]);

  const { data: peerDetail } = useUserDetailQuery(peer?.user_id);

  const displayName = chat ? getChatDisplayName(chat) : 'Профиль';
  const avatarSrc = resolveAvatarSrc(chat?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();

  const subtitle = useMemo(() => {
    if (!chat) return '';
    if (chat.chat_type === 'group') {
      return `${chat.members?.length ?? 0} участников`;
    }
    const user = peerDetail ?? peer?.user;
    return formatPresence(user?.is_online, user?.last_seen ?? null);
  }, [chat, peer, peerDetail]);

  const phone = peerDetail?.phone || peer?.user?.phone || '';
  const handle = peerDetail?.handle || peer?.user?.handle || '';

  const mediaItems = useMemo(() => {
    return (messages ?? [])
      .filter((m) => !m.is_deleted && (m.msg_type === 'image' || m.msg_type === 'video'))
      .flatMap((m) => {
        const media = m.media?.[0];
        if (!media?.remote_url) return [];
        const url = resolveMediaUrl(media.remote_url);
        const thumb = media.thumbnail_url ? resolveMediaUrl(media.thumbnail_url) : url;
        return [{ id: m.id, url, thumb, kind: m.msg_type as 'image' | 'video' }];
      })
      .slice(0, 12);
  }, [messages]);

  if (isLoading) {
    return <div className="mobile-chat-profile__loading">Загрузка…</div>;
  }

  if (!chat) {
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
          <span className="mobile-chat-profile__toolbar-title">Профиль</span>
        </header>
        <p className="mobile-chat-profile__empty">Чат не найден</p>
      </div>
    );
  }

  return (
    <div className="mobile-chat-profile">
      <header className="mobile-chat-profile__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={() => navigate({ to: '/chat/$chatId', params: { chatId } })}
          aria-label="Назад к чату"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">Профиль</span>
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
          <p className="mobile-chat-profile__status">{subtitle}</p>
        </div>

        <section className="mobile-chat-profile__section">
          {phone ? (
            <div className="mobile-chat-profile__row">
              <span className="mobile-chat-profile__row-label">телефон</span>
              <span className="mobile-chat-profile__row-value">{phone}</span>
            </div>
          ) : null}
          {handle ? (
            <div className="mobile-chat-profile__row">
              <span className="mobile-chat-profile__row-label">имя пользователя</span>
              <span className="mobile-chat-profile__row-value">@{handle}</span>
            </div>
          ) : null}
          <div className="mobile-chat-profile__row">
            <span className="mobile-chat-profile__row-label">уведомления</span>
            <span className="mobile-chat-profile__row-value">
              {chat.is_muted ? 'выключены' : 'включены'}
            </span>
          </div>
        </section>

        {mediaItems.length > 0 ? (
          <section className="mobile-chat-profile__section">
            <h2 className="mobile-chat-profile__section-title">Медиа</h2>
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
          </section>
        ) : null}
      </div>
    </div>
  );
}
