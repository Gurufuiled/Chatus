import { ChatStatusChecks } from '@/features/chat-list/ChatStatusChecks';
import { getStickerImageUrl } from '@/data/stickerCatalog';
import { resolveMediaUrl } from '@/services/mediaService';
import { formatMessageTime } from './messageFormatters';
import { isChatusStickerMessage, tryDecodeStickerPayload } from '@/utils/stickerPayload';
import type { MappedMessage } from '@/types/message';

interface MessageBubbleProps {
  message: MappedMessage;
  isOutgoing: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function MessageBubble({ message, isOutgoing, onContextMenu }: MessageBubbleProps) {
  if (message.is_deleted) {
    return (
      <div
        className={`message-bubble message-bubble--deleted${isOutgoing ? ' message-bubble--outgoing' : ' message-bubble--incoming'}`}
      >
        <span className="message-bubble__deleted-text">Deleted message</span>
      </div>
    );
  }

  const showChecks = isOutgoing && message.status !== 'error';
  const time = formatMessageTime(message.created_at);
  const stickerRef =
    message.msg_type === 'text' && isChatusStickerMessage(message.content)
      ? tryDecodeStickerPayload(message.content)
      : null;
  const stickerUrl = stickerRef ? getStickerImageUrl(stickerRef) : null;
  const media = message.media?.[0];
  const mediaUrl = media?.remote_url ? resolveMediaUrl(media.remote_url) : null;

  return (
    <div
      className={`message-bubble${isOutgoing ? ' message-bubble--outgoing' : ' message-bubble--incoming'}${message.status === 'sending' ? ' message-bubble--sending' : ''}${message.status === 'error' ? ' message-bubble--error' : ''}${stickerUrl ? ' message-bubble--sticker' : ''}`}
      onContextMenu={onContextMenu}
    >
      <div className="message-bubble__content">
        {stickerUrl ? (
          <img src={stickerUrl} alt="Sticker" className="message-bubble__sticker" />
        ) : message.msg_type === 'image' && mediaUrl ? (
          <img src={mediaUrl} alt="" className="message-bubble__image" />
        ) : message.msg_type === 'voice' ? (
          <div className="message-bubble__voice">
            <span className="message-bubble__voice-icon" aria-hidden>
              🎤
            </span>
            <span className="message-bubble__voice-label">Voice message</span>
            {media?.duration_ms ? (
              <span className="message-bubble__voice-duration">
                {Math.max(1, Math.round(media.duration_ms / 1000))}s
              </span>
            ) : null}
          </div>
        ) : message.msg_type === 'text' ? (
          isChatusStickerMessage(message.content) ? (
            <p className="message-bubble__text message-bubble__text--placeholder">Sticker</p>
          ) : (
            <p className="message-bubble__text">{message.content}</p>
          )
        ) : (
          <p className="message-bubble__text message-bubble__text--placeholder">
            {message.content ?? `[${message.msg_type}]`}
          </p>
        )}
        <span className="message-bubble__meta">
          {message.status === 'error' ? (
            <span className="message-bubble__error-label" title="Failed to send">
              !
            </span>
          ) : null}
          <time className="message-bubble__time" dateTime={new Date(message.created_at).toISOString()}>
            {time}
          </time>
          {showChecks ? <ChatStatusChecks status={message.status} /> : null}
        </span>
      </div>
    </div>
  );
}
