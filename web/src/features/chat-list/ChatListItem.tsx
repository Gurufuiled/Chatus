import { Link } from '@tanstack/react-router';
import { Avatar } from '@/components/avatar/Avatar';
import { ChatUnreadBadge } from './ChatUnreadBadge';
import { ChatStatusChecks } from './ChatStatusChecks';
import {
  formatChatTime,
  formatMessagePreview,
  getChatDisplayName,
} from './chatListFormatters';
import type { ChatSummary } from '@/types/chat';
import { useMeQuery } from '@/queries/auth.queries';
import { useMenuStore } from '@/stores/menuStore';

interface ChatListItemProps {
  chat: ChatSummary;
  active?: boolean;
}

export function ChatListItem({ chat, active = false }: ChatListItemProps) {
  const { data: me } = useMeQuery();
  const displayName = getChatDisplayName(chat);
  const preview = formatMessagePreview(chat.last_message_preview, chat.last_message);
  const time = formatChatTime(chat.last_message_at);
  const isOutgoingLast =
    !!me?.id && !!chat.last_message && chat.last_message.sender_id === me.id;

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useMenuStore.getState().openChatMenu(chat.id, { x: e.clientX, y: e.clientY });
  };

  return (
    <Link
      to="/chat/$chatId"
      params={{ chatId: chat.id }}
      className={`chat-list-item${active ? ' chat-list-item--active' : ''}`}
      onContextMenu={openMenu}
    >
      <Avatar name={displayName} imageUrl={chat.avatar_url} size={52} />
      <div className="chat-list-item__body">
        <div className="chat-list-item__top">
          <span className="chat-list-item__name">
            {chat.is_pinned ? <span className="chat-list-item__pin" aria-hidden>📌</span> : null}
            {chat.is_muted ? <span className="chat-list-item__mute" aria-hidden>🔇</span> : null}
            {displayName}
          </span>
          <span className="chat-list-item__meta">
            {isOutgoingLast ? <ChatStatusChecks status={chat.last_message?.status} /> : null}
            {time ? <time className="chat-list-item__time">{time}</time> : null}
          </span>
        </div>
        <div className="chat-list-item__bottom">
          <span className="chat-list-item__preview">{preview}</span>
          <ChatUnreadBadge count={chat.unread_count} muted={chat.is_muted} />
        </div>
      </div>
    </Link>
  );
}
