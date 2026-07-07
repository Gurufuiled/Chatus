import { Link } from '@tanstack/react-router';
import { formatChatTime, getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { ChatStatusChecks } from '@/features/chat-list/ChatStatusChecks';
import type { ChatSummary } from '@/types/chat';
import { useMeQuery } from '@/queries/auth.queries';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { buildDialogPreviewForChat } from '../utils/dialogPreview';

interface MobileChatListRowProps {
  chat: ChatSummary;
}

export function MobileChatListRow({ chat }: MobileChatListRowProps) {
  const { data: me } = useMeQuery();
  const displayName = getChatDisplayName(chat);
  const preview = buildDialogPreviewForChat(chat);
  const time = formatChatTime(chat.last_message_at);
  const avatarSrc = resolveAvatarSrc(chat.avatar_url);
  const isOutgoingLast =
    !!me?.id && !!chat.last_message && chat.last_message.sender_id === me.id;
  const unread = chat.unread_count ?? 0;
  const showPreview = preview.text.length > 0 || preview.thumbnailUrls.length > 0;

  return (
    <Link
      to="/chat/$chatId"
      params={{ chatId: chat.id }}
      className="mobile-dialog-row"
    >
      {avatarSrc ? (
        <img className="mobile-dialog-row__avatar" src={avatarSrc} alt="" />
      ) : (
        <div
          className="mobile-dialog-row__avatar-fallback"
          style={{ backgroundColor: getAvatarColor(displayName) }}
        >
          {(displayName.trim()[0] || '?').toUpperCase()}
        </div>
      )}
      <div className="mobile-dialog-row__body">
        <div className="mobile-dialog-row__top">
          <span className="mobile-dialog-row__title">
            {chat.is_pinned ? '📌 ' : ''}
            {chat.is_muted ? '🔇 ' : ''}
            {displayName}
          </span>
          {time ? <time className="mobile-dialog-row__time">{time}</time> : null}
        </div>
        <div className="mobile-dialog-row__bottom">
          {showPreview ? (
            <div className="mobile-dialog-row__preview-wrap">
              {preview.thumbnailUrls.length > 0 ? (
                <span className="mobile-dialog-row__thumbs" aria-hidden>
                  {preview.thumbnailUrls.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      className="mobile-dialog-row__thumb"
                      src={url}
                      alt=""
                    />
                  ))}
                </span>
              ) : null}
              {preview.text ? (
                <span
                  className={`mobile-dialog-row__preview${preview.accentLabel ? ' mobile-dialog-row__preview--accent' : ''}`}
                >
                  {preview.text}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="mobile-dialog-row__preview mobile-dialog-row__preview--empty" />
          )}
          <div className="mobile-dialog-row__trailing">
            {isOutgoingLast ? (
              <span className="mobile-dialog-row__status">
                <ChatStatusChecks status={chat.last_message?.status} />
              </span>
            ) : null}
            {unread > 0 ? (
              <span
                className={`mobile-dialog-row__badge${chat.is_muted ? ' mobile-dialog-row__badge--muted' : ''}`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
