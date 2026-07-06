import { Link } from '@tanstack/react-router';
import {
  formatChatTime,
  formatMessagePreview,
  getChatDisplayName,
} from '@/features/chat-list/chatListFormatters';
import type { ChatSummary } from '@/types/chat';
import { useMeQuery } from '@/queries/auth.queries';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';

interface MobileChatListRowProps {
  chat: ChatSummary;
}

function StatusChecks({ status }: { status?: string }) {
  if (!status || status === 'sending') return <span className="mobile-bubble__checks">◷</span>;
  if (status === 'failed' || status === 'error') return <span className="mobile-bubble__checks">!</span>;
  if (status === 'read') return <span className="mobile-bubble__checks">✓✓</span>;
  if (status === 'delivered') return <span className="mobile-bubble__checks">✓✓</span>;
  return <span className="mobile-bubble__checks">✓</span>;
}

export function MobileChatListRow({ chat }: MobileChatListRowProps) {
  const { data: me } = useMeQuery();
  const displayName = getChatDisplayName(chat);
  const preview = formatMessagePreview(chat.last_message_preview, chat.last_message);
  const time = formatChatTime(chat.last_message_at);
  const avatarSrc = resolveAvatarSrc(chat.avatar_url);
  const isOutgoingLast =
    !!me?.id && !!chat.last_message && chat.last_message.sender_id === me.id;
  const unread = chat.unread_count ?? 0;

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
          <span className="mobile-dialog-row__preview">
            {isOutgoingLast ? (
              <>
                <StatusChecks status={chat.last_message?.status} /> {preview}
              </>
            ) : (
              preview
            )}
          </span>
          {unread > 0 ? (
            <span
              className={`mobile-dialog-row__badge${chat.is_muted ? ' mobile-dialog-row__badge--muted' : ''}`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
