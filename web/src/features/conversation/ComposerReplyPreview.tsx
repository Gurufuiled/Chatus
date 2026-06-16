import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useComposerStore } from '@/stores/composerStore';
import { isChatusStickerMessage, tryDecodeStickerPayload } from '@/utils/stickerPayload';
import { IconButton } from '@/components/buttons/IconButton';
import { resolveMediaUrl } from '@/services/mediaService';
import { getStickerImageUrl } from '@/data/stickerCatalog';
import type { MappedMessage } from '@/types/message';

interface ComposerReplyPreviewProps {
  chatId: string;
}

function summarizeReply(content: string | null, msgType: string): string {
  if (msgType === 'voice') return 'Голосовое сообщение';
  if (msgType === 'image') return 'Фотография';
  if (msgType === 'video') return 'Видео';
  if (msgType === 'video_note') return 'Видеосообщение';
  if (msgType === 'file') return 'Файл';
  if (content && isChatusStickerMessage(content)) return 'Стикер';
  const text = content?.trim();
  if (!text) return 'Сообщение';
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function ReplyIcon() {
  return (
    <div className="composer-reply-preview__icon">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
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

export function ComposerReplyPreview({ chatId }: ComposerReplyPreviewProps) {
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const clearReply = useComposerStore((s) => s.clearReply);
  const { data: messages } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();

  if (!replyToMessageId) return null;

  const target = messages?.find((m) => m.id === replyToMessageId);
  const isOwnMessage = !!me?.id && target?.sender_id === me.id;
  const preview = target
    ? target.is_deleted
      ? 'Удалённое сообщение'
      : summarizeReply(target.content, target.msg_type)
    : 'Сообщение';
  const senderName = isOwnMessage ? 'Вы' : target?.sender_name?.trim() || 'Сообщение';

  const replyThumbnailUrl = target && !target.is_deleted ? getReplyThumbnailUrl(target) : null;

  return (
    <div
      className={`composer-reply-preview${isOwnMessage ? ' composer-reply-preview--own' : ''}`}
    >
      <ReplyIcon />
      <div className="composer-reply-preview__bar" aria-hidden />
      {replyThumbnailUrl ? (
        <img src={replyThumbnailUrl} alt="" className="composer-reply-preview__thumbnail" />
      ) : null}
      <div className="composer-reply-preview__body">
        <span className="composer-reply-preview__label">{senderName}</span>
        <span className="composer-reply-preview__text">{preview}</span>
      </div>
      <IconButton
        label="Отменить ответ"
        className="composer-reply-preview__close"
        onClick={clearReply}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </IconButton>
    </div>
  );
}
