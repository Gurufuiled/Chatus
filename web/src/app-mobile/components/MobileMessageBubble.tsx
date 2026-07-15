import { formatMessageTime } from '@/features/conversation/messageFormatters';
import { ChatStatusChecks } from '@/features/chat-list/ChatStatusChecks';
import { VoiceMessagePlayer } from '@/features/conversation/VoiceMessagePlayer';
import {
  ImageMessageContent,
  VideoMessageContent,
} from '@/features/conversation/MediaMessageContent';
import { PollMessageContent } from '@/features/conversation/PollMessageContent';
import { resolveMediaUrl } from '@/services/mediaService';
import { parseGroupCallSystemContent } from '@/utils/groupCallSystemMessage';
import { isChatusStickerMessage, tryDecodeStickerPayload } from '@/utils/stickerPayload';
import { getStickerImageUrl } from '@/data/stickerCatalog';
import { isAlbumCaption } from '@/utils/albumCaption';
import { isPollMessage } from '@/utils/pollPayload';
import { canSaveOrForwardContent } from '@/utils/chatPermissions';
import { useChatsQuery } from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';
import type { MappedMessage } from '@/types/message';

interface MobileMessageBubbleProps {
  message: MappedMessage;
  isOutgoing: boolean;
  showSenderName?: boolean;
  chatId?: string;
}

function ForwardLabel({ message }: { message: MappedMessage }) {
  const name = message.forwarded_from_name?.trim();
  if (!name) return null;
  return (
    <div className="message-forward-header">
      <span className="message-forward-header__label">Переслано от</span>{' '}
      <span className="message-forward-header__name">{name}</span>
    </div>
  );
}

function BubbleMeta({
  message,
  isOutgoing,
  overlay = false,
}: {
  message: MappedMessage;
  isOutgoing: boolean;
  overlay?: boolean;
}) {
  const showChecks = isOutgoing && message.status !== 'error' && message.status !== 'sending';

  return (
    <span
      className={`mobile-bubble__meta${overlay ? ' mobile-bubble__meta--overlay' : ''}${isOutgoing ? ' mobile-bubble__meta--out' : ''}`}
    >
      {message.status === 'error' ? (
        <span className="mobile-bubble__error" title="Не отправлено">
          !
        </span>
      ) : null}
      {message.status === 'sending' ? (
        <span className="mobile-bubble__sending" aria-hidden>
          ◷
        </span>
      ) : null}
      <time className="mobile-bubble__time" dateTime={new Date(message.created_at).toISOString()}>
        {formatMessageTime(message.created_at)}
      </time>
      {showChecks ? <ChatStatusChecks status={message.status} /> : null}
    </span>
  );
}

function mediaLabel(msgType: string, content: string | null): string {
  switch (msgType) {
    case 'image':
      return 'Фото';
    case 'voice':
      return 'Голосовое сообщение';
    case 'video':
      return 'Видео';
    case 'video_note':
      return 'Видеосообщение';
    case 'file':
      return content?.trim() || 'Файл';
    case 'sticker':
      return 'Стикер';
    default:
      return 'Медиа';
  }
}

function SenderName({
  message,
  show,
}: {
  message: MappedMessage;
  show: boolean;
}) {
  if (!show || !message.sender_name?.trim()) return null;
  return <span className="mobile-bubble__sender">{message.sender_name}</span>;
}

export function MobileMessageBubble({
  message,
  isOutgoing,
  showSenderName = false,
  chatId,
}: MobileMessageBubbleProps) {
  const { data: chats } = useChatsQuery();
  const { data: me } = useMeQuery();
  const chat = chatId ? chats?.find((c) => c.id === chatId) : undefined;
  const allowSave = canSaveOrForwardContent(chat, me);

  if (message.is_deleted) {
    return null;
  }

  const groupCallPayload =
    message.msg_type === 'system' ? parseGroupCallSystemContent(message.content) : null;

  if (groupCallPayload || message.msg_type === 'system') {
    const text =
      groupCallPayload?.action === 'started'
        ? 'Начат групповой звонок'
        : groupCallPayload?.action === 'ended'
          ? 'Групповой звонок завершён'
          : message.content?.trim() || 'Системное сообщение';
    return (
      <div className="mobile-bubble-row mobile-bubble-row--system">
        <div className="mobile-bubble mobile-bubble--system">
          <p className="mobile-bubble__text">{text}</p>
        </div>
      </div>
    );
  }

  const firstMedia = message.media?.[0];
  const mediaUrl = firstMedia?.remote_url ? resolveMediaUrl(firstMedia.remote_url) : null;
  const isSticker =
    message.msg_type === 'text' && isChatusStickerMessage(message.content);
  const stickerRef = isSticker ? tryDecodeStickerPayload(message.content) : null;
  const stickerUrl = stickerRef ? getStickerImageUrl(stickerRef) : null;
  const caption =
    message.content && isAlbumCaption(message.content) ? message.content.trim() : null;
  const isRoundVideo =
    message.msg_type === 'video_note' || Boolean(firstMedia?.is_round);

  const bubbleClass = `mobile-bubble mobile-bubble--${isOutgoing ? 'out' : 'in'}${
    message.status === 'sending' ? ' mobile-bubble--sending' : ''
  }${message.status === 'error' ? ' mobile-bubble--error' : ''}`;

  if (stickerUrl) {
    return (
      <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
        <div className={`${bubbleClass} mobile-bubble--sticker`}>
          <ForwardLabel message={message} />
          <img className="mobile-bubble__sticker" src={stickerUrl} alt="Стикер" />
          <BubbleMeta message={message} isOutgoing={isOutgoing} />
        </div>
      </div>
    );
  }

  if (isPollMessage(message) && chatId) {
    return (
      <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
        <SenderName message={message} show={showSenderName} />
        <div className={bubbleClass}>
          <ForwardLabel message={message} />
          <PollMessageContent chatId={chatId} message={message} />
          <BubbleMeta message={message} isOutgoing={isOutgoing} />
        </div>
      </div>
    );
  }

  if (message.msg_type === 'image' && mediaUrl) {
    return (
      <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
        <div className={`${bubbleClass} mobile-bubble--media`}>
          <div className="mobile-bubble__media">
            <ImageMessageContent url={firstMedia!.remote_url!} allowDownload={allowSave} />
            {!caption ? (
              <div className="mobile-bubble__media-overlay">
                <BubbleMeta message={message} isOutgoing={isOutgoing} overlay />
              </div>
            ) : null}
          </div>
          {caption ? (
            <div className="mobile-bubble__text-row">
              <p className="mobile-bubble__text">{caption}</p>
              <BubbleMeta message={message} isOutgoing={isOutgoing} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if ((message.msg_type === 'video' || message.msg_type === 'video_note') && mediaUrl) {
    return (
      <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
        <div
          className={`${bubbleClass} mobile-bubble--media${isRoundVideo ? ' mobile-bubble--video-note' : ''}`}
        >
          <div className="mobile-bubble__media">
            <VideoMessageContent
              url={firstMedia!.remote_url!}
              poster={firstMedia?.thumbnail_url}
              round={isRoundVideo}
              messageId={message.id}
              authorLabel={message.sender_name}
              durationMs={firstMedia?.duration_ms ?? 0}
              registerPlayback={isRoundVideo}
              controlsDownload={allowSave}
            />
            {!caption ? (
              <div className="mobile-bubble__media-overlay">
                <BubbleMeta message={message} isOutgoing={isOutgoing} overlay />
              </div>
            ) : null}
          </div>
          {caption ? (
            <div className="mobile-bubble__text-row">
              <p className="mobile-bubble__text">{caption}</p>
              <BubbleMeta message={message} isOutgoing={isOutgoing} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (message.msg_type === 'voice' && mediaUrl) {
    return (
      <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
        <div className={`${bubbleClass} mobile-bubble--voice`}>
          <div className="mobile-bubble__voice">
            <VoiceMessagePlayer
              src={mediaUrl}
              durationMs={firstMedia?.duration_ms ?? 0}
              waveformBase64={firstMedia?.waveform}
              isOutgoing={isOutgoing}
              authorLabel={message.sender_name}
              meta={<BubbleMeta message={message} isOutgoing={isOutgoing} />}
            />
          </div>
        </div>
      </div>
    );
  }

  const text =
    message.msg_type === 'text' && message.content && !isSticker ? message.content : null;

  return (
    <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
      <SenderName message={message} show={showSenderName} />
      <div className={bubbleClass}>
        <ForwardLabel message={message} />
        {text ? (
          <div className="mobile-bubble__text-row">
            <p className="mobile-bubble__text">{text}</p>
            <BubbleMeta message={message} isOutgoing={isOutgoing} />
          </div>
        ) : isSticker ? (
          <div className="mobile-bubble__text-row">
            <p className="mobile-bubble__media-label">Стикер</p>
            <BubbleMeta message={message} isOutgoing={isOutgoing} />
          </div>
        ) : (
          <div className="mobile-bubble__text-row">
            <p className="mobile-bubble__media-label">
              {mediaLabel(message.msg_type, message.content)}
            </p>
            <BubbleMeta message={message} isOutgoing={isOutgoing} />
          </div>
        )}
      </div>
    </div>
  );
}
