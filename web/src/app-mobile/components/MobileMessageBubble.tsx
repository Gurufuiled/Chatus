import { formatMessageTime } from '@/features/conversation/messageFormatters';
import { resolveMediaUrl } from '@/services/mediaService';
import { parseGroupCallSystemContent } from '@/utils/groupCallSystemMessage';
import { isChatusStickerMessage } from '@/utils/stickerPayload';
import type { MappedMessage } from '@/types/message';

interface MobileMessageBubbleProps {
  message: MappedMessage;
  isOutgoing: boolean;
}

function StatusChecks({ status }: { status: string }) {
  const className = 'mobile-bubble__checks';
  if (status === 'sending') return <span className={className}>◷</span>;
  if (status === 'failed' || status === 'error') return <span className={className}>!</span>;
  if (status === 'read') return <span className={className}>✓✓</span>;
  if (status === 'delivered') return <span className={className}>✓✓</span>;
  return <span className={className}>✓</span>;
}

function mediaLabel(msgType: string, content: string | null): string {
  switch (msgType) {
    case 'image':
      return 'Фото';
    case 'voice':
      return 'Голосовое сообщение';
    case 'video':
    case 'video_note':
      return 'Видео';
    case 'file':
      return content?.trim() || 'Файл';
    case 'sticker':
      return 'Стикер';
    default:
      return 'Медиа';
  }
}

export function MobileMessageBubble({ message, isOutgoing }: MobileMessageBubbleProps) {
  if (message.is_deleted) {
    return (
      <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
        <div className={`mobile-bubble mobile-bubble--${isOutgoing ? 'out' : 'in'} mobile-bubble--deleted`}>
          <p className="mobile-bubble__text">Сообщение удалено</p>
        </div>
      </div>
    );
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
      <div className="mobile-bubble mobile-bubble--system">
        <p className="mobile-bubble__text">{text}</p>
      </div>
    );
  }

  const isText =
    message.msg_type === 'text' &&
    message.content &&
    !isChatusStickerMessage(message.content);

  const firstMedia = message.media?.[0];
  const imageUrl =
    message.msg_type === 'image' && firstMedia?.remote_url
      ? resolveMediaUrl(firstMedia.remote_url)
      : null;

  return (
    <div className={`mobile-bubble-row mobile-bubble-row--${isOutgoing ? 'out' : 'in'}`}>
      <div className={`mobile-bubble mobile-bubble--${isOutgoing ? 'out' : 'in'}`}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 4, display: 'block' }}
          />
        ) : null}
        {isText ? (
          <p className="mobile-bubble__text">{message.content}</p>
        ) : message.msg_type === 'text' && isChatusStickerMessage(message.content) ? (
          <p className="mobile-bubble__media-label">Стикер</p>
        ) : message.msg_type !== 'text' ? (
          <p className="mobile-bubble__media-label">
            {mediaLabel(message.msg_type, message.content)}
          </p>
        ) : null}
        <div className="mobile-bubble__meta">
          <time className="mobile-bubble__time">{formatMessageTime(message.created_at)}</time>
          {isOutgoing ? <StatusChecks status={message.status} /> : null}
        </div>
      </div>
    </div>
  );
}
