import { useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import {
  useChannelFeedQuery,
  useMockCheckoutChannelMutation,
  usePublishChannelPostMutation,
  useSubscribeChannelMutation,
  useToggleChannelReactionMutation,
} from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { uploadFile } from '@/services/mediaService';
import { MobilePillHeaderTitle } from '../components/MobilePillHeaderTitle';
import { MobileChannelPostCard } from '../components/MobileChannelPostCard';
import { isChannelPreviewRequired } from '../utils/channelUtils';

interface MobileChannelFeedScreenProps {
  channelId: string;
}

export function MobileChannelFeedScreen({ channelId }: MobileChannelFeedScreenProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: feedData, isLoading, isError, error, refetch } = useChannelFeedQuery(channelId);
  const subscribe = useSubscribeChannelMutation();
  const checkout = useMockCheckoutChannelMutation();
  const publishPost = usePublishChannelPostMutation();
  const toggleReaction = useToggleChannelReactionMutation();

  const [draft, setDraft] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const channel = feedData?.channel;
  const posts = useMemo(
    () => [...(feedData?.posts ?? [])].sort((a, b) => a.created_at - b.created_at),
    [feedData?.posts],
  );

  const needsSubscribe = channel
    ? !feedData?.can_view_full_feed && isChannelPreviewRequired(channel, me?.id ?? null)
    : false;
  const isPaid = channel?.access_type === 'paid';
  const canPost = feedData?.can_post ?? false;
  const canReact = feedData?.can_react ?? false;
  const canComment = feedData?.can_comment ?? false;
  const title = channel ? getChatDisplayName(channel) : 'Канал';

  const handleSubscribe = () => {
    if (!channel) return;
    setSubscribeError(null);
    if (isPaid) {
      checkout.mutate(channelId, {
        onError: (err) =>
          setSubscribeError(err instanceof Error ? err.message : 'Не удалось оформить доступ'),
      });
      return;
    }
    subscribe.mutate(
      { channelId, inviteToken: channel.invite_token ?? undefined },
      {
        onError: (err) =>
          setSubscribeError(err instanceof Error ? err.message : 'Не удалось подписаться'),
      },
    );
  };

  const handlePublish = () => {
    const text = draft.trim();
    if (!text || publishPost.isPending) return;
    setPublishError(null);
    publishPost.mutate(
      { channelId, content: text },
      {
        onSuccess: () => setDraft(''),
        onError: (err) =>
          setPublishError(err instanceof Error ? err.message : 'Не удалось опубликовать'),
      },
    );
  };

  const handleAttach = async (file: File) => {
    if (!canPost || attachBusy) return;
    setAttachBusy(true);
    setPublishError(null);
    try {
      const uploaded = await uploadFile(file);
      const isImage = file.type.startsWith('image/');
      publishPost.mutate(
        {
          channelId,
          content: draft.trim() || undefined,
          msgType: isImage ? 'image' : 'file',
          media: {
            media_type: isImage ? 'image' : 'file',
            url: uploaded.url,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
          },
        },
        {
          onSuccess: () => setDraft(''),
          onError: (err) =>
            setPublishError(err instanceof Error ? err.message : 'Не удалось опубликовать'),
        },
      );
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    } finally {
      setAttachBusy(false);
    }
  };

  if (isLoading) {
    return <div className="mobile-channel-feed__loading">Загрузка…</div>;
  }

  if (isError && !feedData) {
    return (
      <div className="mobile-channel-feed">
        <header className="mobile-chat__header mobile-chat__header--pill">
          <button
            type="button"
            className="mobile-chat__back-pill"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-channel-feed__error">
            {error instanceof Error ? error.message : 'Не удалось загрузить канал'}
          </span>
        </header>
      </div>
    );
  }

  return (
    <div
      className={`mobile-channel-feed${canPost ? ' mobile-channel-feed--with-composer' : ''}`}
      style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
    >
      <header className="mobile-chat__header mobile-chat__header--pill">
        <div className="mobile-chat__header-slot mobile-chat__header-slot--left">
          <button
            type="button"
            className="mobile-chat__back-pill"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад к списку чатов"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="mobile-chat__header-slot mobile-chat__header-slot--center">
          <MobilePillHeaderTitle
            title={title}
            subtitle={
              channel?.subscriber_count != null
                ? `${channel.subscriber_count} подписчиков`
                : 'канал'
            }
            avatarUrl={channel?.avatar_url}
            onClick={() =>
              navigate({ to: '/channel/$channelId/profile', params: { channelId } })
            }
          />
        </div>
        <div className="mobile-chat__header-slot mobile-chat__header-slot--right" aria-hidden />
      </header>

      {needsSubscribe ? (
        <div className="mobile-channel-feed__gate">
          {posts.length > 0 ? (
            <div className="mobile-channel-feed__posts mobile-channel-feed__posts--preview">
              {posts.map((post) => (
                <MobileChannelPostCard
                  key={post.id}
                  post={post}
                  canReact={false}
                  canComment={false}
                  onReaction={() => {}}
                />
              ))}
            </div>
          ) : null}
          <p className="mobile-channel-feed__gate-text">
            {isPaid
              ? 'Это платный канал. Оформите подписку, чтобы читать публикации.'
              : 'Подпишитесь на канал, чтобы читать публикации.'}
          </p>
          <button
            type="button"
            className="mobile-channel-feed__subscribe-btn"
            disabled={subscribe.isPending || checkout.isPending}
            onClick={handleSubscribe}
          >
            {isPaid ? 'Оформить доступ' : 'Подписаться'}
          </button>
          {subscribeError ? (
            <p className="mobile-channel-feed__publish-error" role="alert">
              {subscribeError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mobile-channel-feed__posts">
          {posts.length === 0 ? (
            <p className="mobile-channel-feed__empty">
              {canPost ? 'Пока нет публикаций — напишите первый пост' : 'Пока нет публикаций'}
            </p>
          ) : (
            posts.map((post) => (
              <MobileChannelPostCard
                key={post.id}
                post={post}
                canReact={canReact}
                canComment={canComment}
                onReaction={(emoji) =>
                  toggleReaction.mutate({ channelId, postId: post.id, emoji })
                }
                onOpenDiscussion={() =>
                  navigate({
                    to: '/channel/$channelId/discussion/$postId',
                    params: { channelId, postId: post.id },
                  })
                }
              />
            ))
          )}
        </div>
      )}

      {canPost && !needsSubscribe ? (
        <footer className="mobile-channel-feed__composer">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            className="mobile-channel-feed__file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAttach(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="mobile-channel-feed__attach"
            disabled={attachBusy}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Прикрепить файл"
          >
            📎
          </button>
          <textarea
            className="mobile-channel-feed__input"
            placeholder="Новая публикация"
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlePublish();
              }
            }}
          />
          <button
            type="button"
            className="mobile-channel-feed__send"
            disabled={!draft.trim() || publishPost.isPending || attachBusy}
            onClick={handlePublish}
            aria-label="Опубликовать"
          >
            ➤
          </button>
        </footer>
      ) : null}

      {publishError ? (
        <p className="mobile-channel-feed__publish-error" role="alert">
          {publishError}
        </p>
      ) : null}

      <button
        type="button"
        className="mobile-channel-feed__refresh"
        onClick={() => void refetch()}
        aria-label="Обновить ленту"
      >
        ↻
      </button>
    </div>
  );
}
