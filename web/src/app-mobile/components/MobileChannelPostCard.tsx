import { useMemo } from 'react';
import { formatMessageTime } from '@/features/conversation/messageFormatters';
import {
  ImageMessageContent,
  VideoMessageContent,
} from '@/features/conversation/MediaMessageContent';
import { VoiceMessagePlayer } from '@/features/conversation/VoiceMessagePlayer';
import { resolveMediaUrl } from '@/services/mediaService';
import type { MappedMessage } from '@/types/message';
import { formatViewCount, QUICK_CHANNEL_REACTIONS } from '../utils/channelUtils';

interface MobileChannelPostCardProps {
  post: MappedMessage;
  canReact: boolean;
  canComment: boolean;
  onOpenDiscussion?: () => void;
  onReaction: (emoji: string) => void;
}

function PostMedia({ post }: { post: MappedMessage }) {
  const media = post.media?.[0];
  if (!media?.remote_url) return null;

  const url = resolveMediaUrl(media.remote_url);

  if (post.msg_type === 'image') {
    return (
      <div className="mobile-channel-post__media">
        <ImageMessageContent url={url} alt="" />
      </div>
    );
  }

  if (post.msg_type === 'video' || post.msg_type === 'video_note') {
    return (
      <div className="mobile-channel-post__media">
        <VideoMessageContent
          url={url}
          poster={media.thumbnail_url ? resolveMediaUrl(media.thumbnail_url) : undefined}
          round={post.msg_type === 'video_note' || media.is_round}
        />
      </div>
    );
  }

  if (post.msg_type === 'voice' && url) {
    return (
      <div className="mobile-channel-post__media mobile-channel-post__media--voice">
        <VoiceMessagePlayer
          src={url}
          durationMs={media.duration_ms ?? 0}
          waveformBase64={media.waveform}
          isOutgoing={false}
        />
      </div>
    );
  }

  if (post.msg_type === 'file') {
    return (
      <div className="mobile-channel-post__file">
        <span className="mobile-channel-post__file-icon" aria-hidden>
          📎
        </span>
        <span>{media.file_name?.trim() || post.content?.trim() || 'Файл'}</span>
      </div>
    );
  }

  return null;
}

export function MobileChannelPostCard({
  post,
  canReact,
  canComment,
  onOpenDiscussion,
  onReaction,
}: MobileChannelPostCardProps) {
  const reactions = post.reactions ?? [];
  const text = post.content?.trim() ?? '';
  const viewCount = post.view_count ?? 0;
  const commentCount = post.comment_count ?? 0;

  const reactionSummary = useMemo(
    () => reactions.filter((r) => r.count > 0),
    [reactions],
  );

  return (
    <article className="mobile-channel-post">
      <div className="mobile-channel-post__bubble">
        {text ? <p className="mobile-channel-post__text">{text}</p> : null}
        <PostMedia post={post} />
        <footer className="mobile-channel-post__meta">
          <time dateTime={new Date(post.created_at).toISOString()}>
            {formatMessageTime(post.created_at)}
          </time>
          {viewCount > 0 ? (
            <span className="mobile-channel-post__views">{formatViewCount(viewCount)} просм.</span>
          ) : null}
        </footer>
      </div>

      {reactionSummary.length > 0 ? (
        <div className="mobile-channel-post__reactions">
          {reactionSummary.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={`mobile-channel-post__reaction-pill${r.reacted_by_me ? ' mobile-channel-post__reaction-pill--mine' : ''}`}
              disabled={!canReact}
              onClick={() => onReaction(r.emoji)}
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mobile-channel-post__actions">
        {canReact ? (
          <div className="mobile-channel-post__quick-reactions">
            {QUICK_CHANNEL_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="mobile-channel-post__quick-reaction"
                onClick={() => onReaction(emoji)}
                aria-label={`Реакция ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {canComment && onOpenDiscussion ? (
          <button
            type="button"
            className="mobile-channel-post__comments-btn"
            onClick={onOpenDiscussion}
          >
            💬 {commentCount > 0 ? commentCount : 'Комментарии'}
          </button>
        ) : null}
      </div>
    </article>
  );
}
