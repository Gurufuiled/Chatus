import { useMessagesQuery } from '@/queries/messages.queries';
import { useComposerStore } from '@/stores/composerStore';
import { isChatusStickerMessage } from '@/utils/stickerPayload';
import { IconButton } from '@/components/buttons/IconButton';

interface ComposerReplyPreviewProps {
  chatId: string;
}

function summarizeReply(content: string | null, msgType: string): string {
  if (msgType === 'voice') return 'Voice message';
  if (msgType === 'image') return 'Photo';
  if (msgType === 'video') return 'Video';
  if (msgType === 'file') return 'File';
  if (content && isChatusStickerMessage(content)) return 'Sticker';
  const text = content?.trim();
  if (!text) return 'Message';
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function ComposerReplyPreview({ chatId }: ComposerReplyPreviewProps) {
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const clearReply = useComposerStore((s) => s.clearReply);
  const { data: messages } = useMessagesQuery(chatId);

  if (!replyToMessageId) return null;

  const target = messages?.find((m) => m.id === replyToMessageId);
  const preview = target
    ? summarizeReply(target.content, target.msg_type)
    : 'Message';

  return (
    <div className="composer-reply-preview">
      <div className="composer-reply-preview__bar" aria-hidden />
      <div className="composer-reply-preview__body">
        <span className="composer-reply-preview__label">Reply</span>
        <span className="composer-reply-preview__text">{preview}</span>
      </div>
      <IconButton
        label="Cancel reply"
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
