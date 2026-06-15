import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { useComposerStore } from '@/stores/composerStore';
import { isChatusStickerMessage } from '@/utils/stickerPayload';
import { IconButton } from '@/components/buttons/IconButton';

interface ComposerReplyPreviewProps {
  chatId: string;
}

function summarizeReply(content: string | null, msgType: string): string {
  if (msgType === 'voice') return 'Голосовое сообщение';
  if (msgType === 'image') return 'Фото';
  if (msgType === 'video') return 'Видео';
  if (msgType === 'file') return 'Файл';
  if (content && isChatusStickerMessage(content)) return 'Стикер';
  const text = content?.trim();
  if (!text) return 'Сообщение';
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
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
    ? summarizeReply(target.content, target.msg_type)
    : 'Сообщение';
  const senderName = isOwnMessage ? 'Вы' : target?.sender_name?.trim() || 'Сообщение';

  return (
    <div
      className={`composer-reply-preview${isOwnMessage ? ' composer-reply-preview--own' : ''}`}
    >
      <div className="composer-reply-preview__bar" aria-hidden />
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
