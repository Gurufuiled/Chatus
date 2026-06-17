import { Avatar } from '@/components/avatar/Avatar';
import type { ChatSummary } from '@/types/chat';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { useMeQuery } from '@/queries/auth.queries';
import { useMemo } from 'react';

interface ConversationHeaderProps {
  chat: ChatSummary;
  onClick?: () => void;
}

export function ConversationHeader({ chat, onClick }: ConversationHeaderProps) {
  const title = getChatDisplayName(chat);
  const { data: me } = useMeQuery();

  const peer = useMemo(() => {
    if (chat.chat_type !== 'private') return null;
    return chat.members?.find((m) => m.user_id !== me?.id) || null;
  }, [chat.chat_type, chat.members, me?.id]);

  const userStatus = useMemo(() => {
    if (chat.chat_type !== 'private') {
      return `${chat.members?.length ?? 0} участников`;
    }
    const targetUser = peer?.user;
    if (!targetUser) return 'был(а) недавно';
    if (targetUser.is_online) return 'в сети';

    const isDobry = title.toLowerCase().includes('добры') || (peer?.user_id && peer.user_id.includes('dmitry'));
    if (isDobry) return 'был(а) недавно';

    const lastSeen = targetUser.last_seen;
    if (!lastSeen) return 'был(а) недавно';

    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'был(а) только что';
    if (diffMins < 60) return `был(а) ${diffMins} мин. назад`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `был(а) сегодня в ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `был(а) ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} в ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [chat, peer, title]);

  return (
    <header className="conversation-header" onClick={onClick} style={{ cursor: 'pointer' }}>
      <Avatar name={title} imageUrl={chat.avatar_url} size={40} />
      <div className="conversation-header__info">
        <h1 className="conversation-header__title">{title}</h1>
        <span className="conversation-header__status">{userStatus}</span>
      </div>
    </header>
  );
}

