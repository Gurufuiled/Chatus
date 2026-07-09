import { useMemo } from 'react';
import { formatMessageTime } from '@/features/conversation/messageFormatters';
import { VoiceMessagePlayer } from '@/features/conversation/VoiceMessagePlayer';
import { resolveMediaUrl } from '@/services/mediaService';
import type { MappedMessage } from '@/types/message';
import { ChannelPostVisualMedia } from './ChannelPostVisualMedia';
import {
  canCommentOnPost,
  formatViewCount,
  type ChannelCommentSettings,
} from '../utils/channelUtils';

interface MobileChannelPostCardProps {
  post: MappedMessage;
  channel?: ChannelCommentSettings | null;
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
        <ChannelPostVisualMedia
          msgType="image"
          url={url}
          width={media.width}
          height={media.height}
        />
      </div>
    );
  }

  if (post.msg_type === 'video' || post.msg_type === 'video_note') {
    return (
      <div className="mobile-channel-post__media">
        <ChannelPostVisualMedia
          msgType={post.msg_type === 'video_note' ? 'video_note' : 'video'}
          url={url}
          poster={media.thumbnail_url}
          round={post.msg_type === 'video_note' || media.is_round}
          width={media.width}
          height={media.height}
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
  channel,
  canReact,
  canComment,
  onOpenDiscussion,
  onReaction,
}: MobileChannelPostCardProps) {
  const reactions = post.reactions ?? [];
  const text = post.content?.trim() ?? '';
  const viewCount = post.view_count ?? 0;
  const commentCount = post.comment_count ?? 0;
  const isVisualMedia = post.msg_type === 'image' || post.msg_type === 'video';
  const isVoice = post.msg_type === 'voice';

  const reactionSummary = useMemo(
    () => reactions.filter((r) => r.count > 0),
    [reactions],
  );

  const itemCanComment = canCommentOnPost(post, channel, canComment);
  const showActionsRow = itemCanComment || reactionSummary.length > 0;

  const discussionLabel = `${commentCount} комментариев`;

  return (
    <article className="mobile-channel-post">
      <div
        className={[
          'mobile-channel-post__bubble',
          isVisualMedia ? 'mobile-channel-post__bubble--visual' : '',
          isVoice ? 'mobile-channel-post__bubble--voice' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {text && !isVisualMedia ? (
          <p className="mobile-channel-post__text">{text}</p>
        ) : null}
        <PostMedia post={post} />
        {text && isVisualMedia ? (
          <div className="mobile-channel-post__caption">
            <p className="mobile-channel-post__text">{text}</p>
          </div>
        ) : null}
        <footer className="mobile-channel-post__meta">
          {viewCount > 0 ? (
            <span className="mobile-channel-post__views">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {formatViewCount(viewCount)}
            </span>
          ) : null}
          <time dateTime={new Date(post.created_at).toISOString()}>
            {formatMessageTime(post.created_at)}
          </time>
        </footer>

        {showActionsRow ? (
          <div
            className={[
              'mobile-channel-post__actions-row',
              isVisualMedia ? 'mobile-channel-post__actions-row--visual' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {itemCanComment && onOpenDiscussion ? (
              <button
                type="button"
                className="mobile-channel-post__discussion"
                onClick={onOpenDiscussion}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                </svg>
                <span className="mobile-channel-post__discussion-link">{discussionLabel}</span>
              </button>
            ) : null}
            {reactionSummary.length > 0 ? (
              <div className="mobile-channel-post__reactions-summary">
                {reactionSummary.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    className={`mobile-channel-post__reaction-summary${r.reacted_by_me ? ' mobile-channel-post__reaction-summary--mine' : ''}`}
                    disabled={!canReact}
                    onClick={() => onReaction(r.emoji)}
                  >
                    {r.emoji} {r.count}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
