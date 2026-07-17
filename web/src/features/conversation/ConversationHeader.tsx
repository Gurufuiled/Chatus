import { Avatar } from '@/components/avatar/Avatar';
import type { ChatSummary } from '@/types/chat';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { useMeQuery } from '@/queries/auth.queries';
import { usePeerContactsMap } from '@/queries/peerContacts.queries';
import {
  formatPeerLocalDisplayName,
  getPrivateChatPeerUserId,
} from '@/features/contacts/peerContactDisplay';
import { TYPING_TTL_MS, useTypingStore } from '@/stores/typingStore';
import { useMemo } from 'react';
import { TypingStatus } from './TypingStatus';

interface ConversationHeaderProps {
  chat: ChatSummary;
  onClick?: () => void;
  onGroupCallPress?: () => void;
  isUserInGroupCall?: boolean;
}

export function ConversationHeader({
  chat,
  onClick,
  onGroupCallPress,
  isUserInGroupCall = false,
}: ConversationHeaderProps) {
  const { data: me } = useMeQuery();
  const peerContacts = usePeerContactsMap();
  const peerId = getPrivateChatPeerUserId(chat, me?.id);
  const localName = peerId ? formatPeerLocalDisplayName(peerContacts.get(peerId)) : null;
  const title = getChatDisplayName(chat, localName);
  const typingEntries = useTypingStore((s) => s.typingUsersByChatId[chat.id]);

  const typingUserIds = useMemo(() => {
    const now = Date.now();
    return (typingEntries ?? [])
      .filter((e) => now - e.at < TYPING_TTL_MS)
      .map((e) => e.userId);
  }, [typingEntries]);

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

  const showTyping = typingUserIds.length > 0;

  return (
    <header className="conversation-header" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      <Avatar name={title} imageUrl={chat.avatar_url} size={40} />
      <div className="conversation-header__info">
        <h1 className="conversation-header__title">{title}</h1>
        {showTyping ? (
          <TypingStatus chat={chat} userIds={typingUserIds} />
        ) : (
          <span className="conversation-header__status">{userStatus}</span>
        )}
      </div>
      {onGroupCallPress ? (
        <button
          type="button"
          className="conversation-header__call-btn"
          aria-label={isUserInGroupCall ? 'Открыть голосовой чат' : 'Начать голосовой чат'}
          onClick={(e) => {
            e.stopPropagation();
            onGroupCallPress();
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
          </svg>
        </button>
      ) : null}
    </header>
  );
}
