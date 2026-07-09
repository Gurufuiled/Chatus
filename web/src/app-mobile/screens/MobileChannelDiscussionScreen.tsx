import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import {
  useDiscussionThreadQuery,
  useSendDiscussionMessageMutation,
  useToggleChannelReactionMutation,
} from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { formatMessageTime } from '@/features/conversation/messageFormatters';
import { MobileChannelPostCard } from '../components/MobileChannelPostCard';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';

interface MobileChannelDiscussionScreenProps {
  channelId: string;
  postId: string;
}

function getSenderName(message: { sender_name?: string | null }, fallback = 'Участник') {
  return message.sender_name?.trim() || fallback;
}

export function MobileChannelDiscussionScreen({
  channelId,
  postId,
}: MobileChannelDiscussionScreenProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: thread, isLoading, isError } = useDiscussionThreadQuery(channelId, postId);
  const sendMessage = useSendDiscussionMessageMutation();
  const toggleReaction = useToggleChannelReactionMutation();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  const messages = useMemo(
    () => [...(thread?.messages ?? [])].sort((a, b) => a.created_at - b.created_at),
    [thread?.messages],
  );

  const canComment = thread?.can_comment ?? false;
  const post = thread?.post;

  const handleSend = () => {
    const text = draft.trim();
    if (!text || sendMessage.isPending) return;
    setSendError(null);
    sendMessage.mutate(
      { channelId, postId, content: text },
      {
        onSuccess: () => setDraft(''),
        onError: (err) =>
          setSendError(err instanceof Error ? err.message : 'Не удалось отправить'),
      },
    );
  };

  if (isLoading) {
    return <div className="mobile-channel-discussion__loading">Загрузка…</div>;
  }

  if (isError || !thread) {
    return (
      <div className="mobile-channel-discussion">
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
          <span className="mobile-chat-profile__toolbar-title">Обсуждение</span>
        </header>
        <p className="mobile-chat-profile__empty">Не удалось загрузить обсуждение</p>
      </div>
    );
  }

  return (
    <div
      className={`mobile-channel-discussion${canComment ? ' mobile-channel-discussion--with-composer' : ''}`}
      style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
    >
      <header className="mobile-chat-profile__toolbar mobile-channel-discussion__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={() => navigate({ to: '/channel/$channelId', params: { channelId } })}
          aria-label="Назад к каналу"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">Обсуждение</span>
      </header>

      <div className="mobile-channel-discussion__scroll">
        {post ? (
          <div className="mobile-channel-discussion__post">
            <MobileChannelPostCard
              post={post}
              canReact={thread.channel.allow_reactions !== false}
              canComment={false}
              onReaction={(emoji) =>
                toggleReaction.mutate({ channelId, postId, emoji })
              }
            />
          </div>
        ) : null}

        <div className="mobile-channel-discussion__comments">
          {messages.length === 0 ? (
            <p className="mobile-channel-discussion__empty">Пока нет комментариев</p>
          ) : (
            messages.map((message) => {
              const isOutgoing = !!me?.id && message.sender_id === me.id;
              const name = getSenderName(message);
              const avatar = resolveAvatarSrc(message.sender_avatar_url);

              return (
                <div
                  key={message.id}
                  className={`mobile-channel-discussion__row mobile-channel-discussion__row--${isOutgoing ? 'out' : 'in'}`}
                >
                  {!isOutgoing ? (
                    avatar ? (
                      <img className="mobile-channel-discussion__avatar" src={avatar} alt="" />
                    ) : (
                      <div
                        className="mobile-channel-discussion__avatar-fallback"
                        style={{ backgroundColor: getAvatarColor(name) }}
                      >
                        {(name.trim()[0] || '?').toUpperCase()}
                      </div>
                    )
                  ) : null}
                  <div
                    className={`mobile-channel-discussion__bubble mobile-channel-discussion__bubble--${isOutgoing ? 'out' : 'in'}`}
                  >
                    {!isOutgoing ? (
                      <span className="mobile-channel-discussion__author">{name}</span>
                    ) : null}
                    <p className="mobile-channel-discussion__text">
                      {message.is_deleted ? 'Сообщение удалено' : message.content}
                    </p>
                    <time className="mobile-channel-discussion__time">
                      {formatMessageTime(message.created_at)}
                    </time>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {canComment ? (
        <footer className="mobile-channel-discussion__composer">
          <textarea
            className="mobile-channel-discussion__input"
            placeholder="Комментарий"
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            className="mobile-channel-discussion__send"
            disabled={!draft.trim() || sendMessage.isPending}
            onClick={handleSend}
            aria-label="Отправить"
          >
            ➤
          </button>
        </footer>
      ) : (
        <p className="mobile-channel-discussion__readonly">Комментарии отключены</p>
      )}

      {sendError ? (
        <p className="mobile-channel-discussion__error" role="alert">
          {sendError}
        </p>
      ) : null}
    </div>
  );
}
