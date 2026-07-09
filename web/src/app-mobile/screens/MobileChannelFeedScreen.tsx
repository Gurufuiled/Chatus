import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import {
  useChannelFeedQuery,
  useMockCheckoutChannelMutation,
  useSubscribeChannelMutation,
  useToggleChannelReactionMutation,
} from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { MobilePillHeaderTitle } from '../components/MobilePillHeaderTitle';
import { MobileChannelPostCard } from '../components/MobileChannelPostCard';
import { MobileChannelPostComposer } from '../components/MobileChannelPostComposer';
import { isChannelPreviewRequired } from '../utils/channelUtils';
import { useMobileComposerKeyboard } from '../utils/useMobileComposerKeyboard';

interface MobileChannelFeedScreenProps {
  channelId: string;
}

export function MobileChannelFeedScreen({ channelId }: MobileChannelFeedScreenProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: feedData, isLoading, isError, error, refetch } = useChannelFeedQuery(channelId);
  const subscribe = useSubscribeChannelMutation();
  const checkout = useMockCheckoutChannelMutation();
  const toggleReaction = useToggleChannelReactionMutation();
  const { keyboardLift, composerPaddingBottom } = useMobileComposerKeyboard();

  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const channel = feedData?.channel;
  const posts = useMemo(
    () =>
      [...(feedData?.posts ?? [])].sort((a, b) => {
        if (a.created_at !== b.created_at) return a.created_at - b.created_at;
        if (a.updated_at !== b.updated_at) return a.updated_at - b.updated_at;
        return String(a.id).localeCompare(String(b.id));
      }),
    [feedData?.posts],
  );

  const needsSubscribe = channel
    ? !feedData?.can_view_full_feed && isChannelPreviewRequired(channel, me?.id ?? null)
    : false;
  const isPaid = channel?.access_type === 'paid';
  const canPost = feedData?.can_post ?? channel?.can_post ?? false;
  const canReact = feedData?.can_react ?? channel?.can_react ?? false;
  const canComment = feedData?.can_comment ?? channel?.can_comment ?? false;
  const canEditSettings = channel?.channel_permissions?.can_edit_channel === true;
  const title = channel ? getChatDisplayName(channel) : 'Канал';
  const showComposer = canPost && !needsSubscribe;

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
      className={`mobile-channel-feed${showComposer ? ' mobile-channel-feed--with-composer' : ''}`}
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
        <div className="mobile-chat__header-slot mobile-chat__header-slot--right">
          {canEditSettings ? (
            <button
              type="button"
              className="mobile-channel-feed__settings-btn"
              onClick={() =>
                navigate({ to: '/channel/$channelId/settings', params: { channelId } })
              }
              aria-label="Настройки канала"
            >
              ⚙
            </button>
          ) : null}
        </div>
      </header>

      {needsSubscribe ? (
        <div className="mobile-channel-feed__gate">
          {posts.length > 0 ? (
            <div className="mobile-channel-feed__posts mobile-channel-feed__posts--preview">
              {posts.map((post) => (
                <MobileChannelPostCard
                  key={post.id}
                  post={post}
                  channel={channel}
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
        <div
          className="mobile-channel-feed__posts"
          style={{
            paddingBottom:
              keyboardLift > 0
                ? `calc(${keyboardLift + 8}px + var(--m-safe-bottom))`
                : undefined,
          }}
        >
          {posts.length === 0 ? (
            <p className="mobile-channel-feed__empty">
              {canPost ? 'Пока нет публикаций — напишите первый пост' : 'Пока нет публикаций'}
            </p>
          ) : (
            posts.map((post) => (
              <MobileChannelPostCard
                key={post.id}
                post={post}
                channel={channel}
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

      {showComposer ? (
        <MobileChannelPostComposer
          channelId={channelId}
          keyboardLift={keyboardLift}
          composerPaddingBottom={composerPaddingBottom}
        />
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
