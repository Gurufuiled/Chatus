import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import wallpaperUrl from '@/assets/wallpapers/chat-wallpaper.png';
import {
  useDiscussionThreadQuery,
  useToggleChannelReactionMutation,
} from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useComposerStore } from '@/stores/composerStore';
import { formatMessageTime } from '@/features/conversation/messageFormatters';
import { VoiceMessagePlayer } from '@/features/conversation/VoiceMessagePlayer';
import {
  ImageMessageContent,
  VideoMessageContent,
} from '@/features/conversation/MediaMessageContent';
import { resolveMediaUrl } from '@/services/mediaService';
import { isAlbumCaption } from '@/utils/albumCaption';
import { MobileChannelPostCard } from '../components/MobileChannelPostCard';
import { MobileDiscussionComposer } from '../components/MobileDiscussionComposer';
import { MobileDiscussionReplyQuote } from '../components/MobileDiscussionReplyQuote';
import { MobileDiscussionContextMenu } from '../components/MobileDiscussionContextMenu';
import { MobileSwipeReplyRow } from '../components/MobileSwipeReplyRow';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { getDiscussionComposerId } from '../utils/discussionComposer';
import { useMobileComposerKeyboard } from '../utils/useMobileComposerKeyboard';
import type { MappedMessage } from '@/types/message';

interface MobileChannelDiscussionScreenProps {
  channelId: string;
  postId: string;
}

const LONG_PRESS_MS = 450;

function getSenderName(message: { sender_name?: string | null }, fallback = 'Участник') {
  return message.sender_name?.trim() || fallback;
}

function canSwipeReplyMessage(message: MappedMessage): boolean {
  if (message.is_deleted) return false;
  return (
    message.msg_type === 'text' ||
    message.msg_type === 'voice' ||
    message.msg_type === 'video_note' ||
    message.msg_type === 'image' ||
    message.msg_type === 'video' ||
    message.msg_type === 'file'
  );
}

function DiscussionCommentBody({
  message,
  isOutgoing,
}: {
  message: MappedMessage;
  isOutgoing: boolean;
}) {
  if (message.is_deleted) {
    return <p className="mobile-channel-discussion__text">Сообщение удалено</p>;
  }

  const media = message.media?.[0];
  const mediaUrl = media?.remote_url ? resolveMediaUrl(media.remote_url) : null;
  const caption =
    message.content && isAlbumCaption(message.content) ? message.content.trim() : null;

  if (message.msg_type === 'image' && media?.remote_url) {
    return (
      <div className="mobile-channel-discussion__media">
        <ImageMessageContent url={media.remote_url} />
        {caption ? <p className="mobile-channel-discussion__text">{caption}</p> : null}
      </div>
    );
  }

  if ((message.msg_type === 'video' || message.msg_type === 'video_note') && media?.remote_url) {
    return (
      <div className="mobile-channel-discussion__media">
        <VideoMessageContent
          url={media.remote_url}
          poster={media.thumbnail_url}
          round={message.msg_type === 'video_note' || Boolean(media.is_round)}
        />
        {caption ? <p className="mobile-channel-discussion__text">{caption}</p> : null}
      </div>
    );
  }

  if (message.msg_type === 'voice' && mediaUrl) {
    return (
      <div className="mobile-channel-discussion__media mobile-channel-discussion__media--voice">
        <VoiceMessagePlayer
          src={mediaUrl}
          durationMs={media?.duration_ms ?? 0}
          waveformBase64={media?.waveform}
          isOutgoing={isOutgoing}
        />
      </div>
    );
  }

  if (message.msg_type === 'file') {
    return (
      <p className="mobile-channel-discussion__text">
        {media?.file_name?.trim() || message.content?.trim() || 'Файл'}
      </p>
    );
  }

  if (message.content?.trim()) {
    return <p className="mobile-channel-discussion__text">{message.content}</p>;
  }

  return null;
}

export function MobileChannelDiscussionScreen({
  channelId,
  postId,
}: MobileChannelDiscussionScreenProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const composerId = getDiscussionComposerId(channelId, postId);
  const { data: thread, isLoading, isError } = useDiscussionThreadQuery(channelId, postId);
  const toggleReaction = useToggleChannelReactionMutation();
  const setReply = useComposerStore((s) => s.setReply);
  const requestComposerFocus = useComposerStore((s) => s.requestComposerFocus);
  const clearReply = useComposerStore((s) => s.clearReply);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === composerId ? s.replyToMessageId : null,
  );
  const hasReply = !!replyToMessageId;
  const { keyboardLift, composerPaddingBottom } = useMobileComposerKeyboard();

  const [menuMessage, setMenuMessage] = useState<MappedMessage | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [pressedMessageId, setPressedMessageId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPointRef = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const messages = useMemo(
    () => [...(thread?.messages ?? [])].sort((a, b) => a.created_at - b.created_at),
    [thread?.messages],
  );
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  const canComment = thread?.can_comment ?? false;
  const disableVoiceComments = Boolean(thread?.channel.disable_voice_comments);
  const disableMediaComments = Boolean(thread?.channel.disable_media_comments);
  const post = thread?.post;

  useEffect(() => {
    if (!replyToMessageId) return;
    if (messageById.has(replyToMessageId)) return;
    clearReply();
  }, [clearReply, messageById, replyToMessageId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSendSuccessScroll = useCallback(() => {
    shouldStickToBottomRef.current = true;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const handleDiscussionScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressPointRef.current = null;
    setPressedMessageId(null);
  }, []);

  const handleSwipeReply = useCallback(
    (messageId: string) => {
      setReply(composerId, messageId);
      requestComposerFocus();
    },
    [composerId, requestComposerFocus, setReply],
  );

  const handlePointerDown = useCallback(
    (message: MappedMessage, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || message.is_deleted) return;
      clearLongPress();
      const rect = e.currentTarget.getBoundingClientRect();
      longPressPointRef.current = { x: e.clientX, y: e.clientY };
      setPressedMessageId(message.id);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        setMenuMessage(message);
        setMenuAnchor({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        setPressedMessageId(null);
      }, LONG_PRESS_MS);
    },
    [clearLongPress],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressTimerRef.current || !longPressPointRef.current) return;
      const point = longPressPointRef.current;
      if (Math.abs(e.clientX - point.x) > 10 || Math.abs(e.clientY - point.y) > 10) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.alert('Не удалось скопировать');
    }
  }, []);

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
      className={`mobile-channel-discussion${canComment ? ' mobile-channel-discussion--with-composer' : ''}${hasReply ? ' mobile-channel-discussion--reply-open' : ''}`}
      style={{ '--mobile-chat-wallpaper': `url(${wallpaperUrl})` } as React.CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
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

      <div
        ref={scrollRef}
        className="mobile-channel-discussion__scroll"
        onScroll={handleDiscussionScroll}
      >
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
              const replyMessage = message.reply_to_id
                ? messageById.get(message.reply_to_id) ?? null
                : null;

              return (
                <MobileSwipeReplyRow
                  key={message.id}
                  enabled={canComment && canSwipeReplyMessage(message)}
                  onReply={() => handleSwipeReply(message.id)}
                >
                  <div
                    className={`mobile-channel-discussion__row mobile-channel-discussion__row--${isOutgoing ? 'out' : 'in'}${
                      pressedMessageId === message.id ? ' mobile-channel-discussion__row--pressed' : ''
                    }`}
                    onPointerDown={(e) => handlePointerDown(message, e)}
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
                      <MobileDiscussionReplyQuote
                        message={message}
                        replyMessage={replyMessage}
                        isOutgoing={isOutgoing}
                      />
                      <DiscussionCommentBody message={message} isOutgoing={isOutgoing} />
                      <time className="mobile-channel-discussion__time">
                        {formatMessageTime(message.created_at)}
                      </time>
                    </div>
                  </div>
                </MobileSwipeReplyRow>
              );
            })
          )}
        </div>
      </div>

      {canComment ? (
        <MobileDiscussionComposer
          channelId={channelId}
          postId={postId}
          composerId={composerId}
          messages={messages}
          disableVoice={disableVoiceComments}
          disableMedia={disableMediaComments}
          keyboardLift={keyboardLift}
          composerPaddingBottom={composerPaddingBottom}
          onMessageSent={handleSendSuccessScroll}
        />
      ) : (
        <p className="mobile-channel-discussion__readonly">Комментарии отключены</p>
      )}

      <MobileDiscussionContextMenu
        message={menuMessage}
        anchor={menuAnchor}
        onClose={() => {
          setMenuMessage(null);
          setMenuAnchor(null);
        }}
        onReply={(messageId) => {
          if (!canComment) return;
          setReply(composerId, messageId);
          requestComposerFocus();
        }}
        onCopy={handleCopy}
      />
    </div>
  );
}
