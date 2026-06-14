import { Avatar } from '@/components/avatar/Avatar';
import type { ChatSummary } from '@/types/chat';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';

interface ConversationHeaderProps {
  chat: ChatSummary;
}

export function ConversationHeader({ chat }: ConversationHeaderProps) {
  const title = getChatDisplayName(chat);

  return (
    <header className="conversation-header">
      <Avatar name={title} imageUrl={chat.avatar_url} size={40} />
      <div className="conversation-header__info">
        <h1 className="conversation-header__title">{title}</h1>
        {chat.chat_type === 'private' ? (
          <span className="conversation-header__status">last seen recently</span>
        ) : null}
      </div>
    </header>
  );
}
