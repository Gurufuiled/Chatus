import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useComposerStore } from '@/stores/composerStore';
import { isChatusStickerMessage, tryDecodeStickerPayload } from '@/utils/stickerPayload';
import { resolveMediaUrl } from '@/services/mediaService';
import { getStickerImageUrl } from '@/data/stickerCatalog';
import type { MappedMessage } from '@/types/message';

interface MobileComposerReplyPreviewProps {
  chatId: string;
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
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
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

export function MobileComposerReplyPreview({ chatId }: MobileComposerReplyPreviewProps) {
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
      ? 'Сообщение удалено'
      : summarizeReply(target.content, target.msg_type)
    : 'Сообщение';
  const senderName = isOwnMessage ? 'Вы' : target?.sender_name?.trim() || 'Сообщение';
  const replyThumbnailUrl = target && !target.is_deleted ? getReplyThumbnailUrl(target) : null;

  return (
    <div className="mobile-composer-reply">
      <div className="mobile-composer-reply__accent" aria-hidden />
      {replyThumbnailUrl ? (
        <img src={replyThumbnailUrl} alt="" className="mobile-composer-reply__thumb" />
      ) : null}
      <div className="mobile-composer-reply__body">
        <span className="mobile-composer-reply__author">{senderName}</span>
        <span className="mobile-composer-reply__text">{preview}</span>
      </div>
      <button
        type="button"
        className="mobile-composer-reply__close"
        aria-label="Отменить ответ"
        onClick={clearReply}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
