import { useMeQuery } from '@/queries/auth.queries';
import { isChatusStickerMessage, tryDecodeStickerPayload } from '@/utils/stickerPayload';
import { resolveMediaUrl } from '@/services/mediaService';
import { getStickerImageUrl } from '@/data/stickerCatalog';
import type { MappedMessage } from '@/types/message';

interface MobileDiscussionReplyQuoteProps {
  message: MappedMessage;
  replyMessage?: MappedMessage | null;
  isOutgoing: boolean;
}

function summarizeReply(content: string | null, msgType: string): string {
  if (msgType === 'voice') return 'Голосовое сообщение';
  if (msgType === 'image') return 'Фото';
  if (msgType === 'video') return 'Видео';
  if (msgType === 'video_note') return 'Видеосообщение';
  if (msgType === 'file') return 'Файл';
  if (content && isChatusStickerMessage(content)) return 'Стикер';
  const text = content?.trim();
  if (!text) return 'Сообщение';
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function getReplyThumbnailUrl(replyMessage: MappedMessage): string | null {
  if (replyMessage.msg_type === 'image') {
    const media = replyMessage.media?.[0];
    return media?.remote_url ? resolveMediaUrl(media.remote_url) : null;
  }
  if (replyMessage.msg_type === 'video' || replyMessage.msg_type === 'video_note') {
    const media = replyMessage.media?.[0];
    return media?.thumbnail_url ? resolveMediaUrl(media.thumbnail_url) : null;
  }
  if (replyMessage.msg_type === 'text' && isChatusStickerMessage(replyMessage.content)) {
    const stickerRef = tryDecodeStickerPayload(replyMessage.content);
    return stickerRef ? getStickerImageUrl(stickerRef) : null;
  }
  return null;
}

export function MobileDiscussionReplyQuote({
  message,
  replyMessage,
  isOutgoing,
}: MobileDiscussionReplyQuoteProps) {
  const { data: me } = useMeQuery();
  if (!message.reply_to_id) return null;

  const replySenderName =
    replyMessage?.sender_id === me?.id
      ? 'Вы'
      : replyMessage?.sender_name?.trim() || 'Участник';
  const replyPreview = replyMessage
    ? replyMessage.is_deleted
      ? 'Сообщение удалено'
      : summarizeReply(replyMessage.content, replyMessage.msg_type)
    : 'Сообщение';
  const replyThumbnailUrl =
    replyMessage && !replyMessage.is_deleted ? getReplyThumbnailUrl(replyMessage) : null;

  return (
    <div
      className={`mobile-discussion-reply-quote${isOutgoing ? ' mobile-discussion-reply-quote--out' : ''}`}
    >
      <div className="mobile-discussion-reply-quote__bar" aria-hidden />
      {replyThumbnailUrl ? (
        <img src={replyThumbnailUrl} alt="" className="mobile-discussion-reply-quote__thumb" />
      ) : null}
      <div className="mobile-discussion-reply-quote__body">
        <span className="mobile-discussion-reply-quote__author">{replySenderName}</span>
        <span className="mobile-discussion-reply-quote__text">{replyPreview}</span>
      </div>
    </div>
  );
}
