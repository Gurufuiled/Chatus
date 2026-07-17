import { useNavigate } from '@tanstack/react-router';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import {
  formatPeerLocalDisplayName,
  getPrivateChatPeerUserId,
} from '@/features/contacts/peerContactDisplay';
import { useMeQuery } from '@/queries/auth.queries';
import { usePeerContactsMap } from '@/queries/peerContacts.queries';
import type { ChatSummary } from '@/types/chat';
import { MobilePillHeaderTitle } from './MobilePillHeaderTitle';

interface MobileChatHeaderProps {
  chat: ChatSummary;
}

export function MobileChatHeader({ chat }: MobileChatHeaderProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const peerContacts = usePeerContactsMap();
  const peerId = getPrivateChatPeerUserId(chat, me?.id);
  const localName = peerId ? formatPeerLocalDisplayName(peerContacts.get(peerId)) : null;
  const title = getChatDisplayName(chat, localName);
  const subtitle =
    chat.chat_type === 'group'
      ? `${chat.members?.length ?? 0} участников`
      : chat.members?.find((m) => m.user)?.user?.is_online
        ? 'в сети'
        : '';

  const profilePath =
    chat.chat_type === 'group'
      ? '/chat/$chatId/group-profile'
      : '/chat/$chatId/profile';

  return (
    <header className="mobile-chat__header mobile-chat__header--pill">
      <div className="mobile-chat__header-slot mobile-chat__header-slot--left">
        <button
          type="button"
          className="mobile-chat__back-pill"
          onClick={() => navigate({ to: '/' })}
          aria-label="Назад к списку чатов"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <div className="mobile-chat__header-slot mobile-chat__header-slot--center">
        <MobilePillHeaderTitle
          title={title}
          subtitle={subtitle || undefined}
          avatarUrl={chat.avatar_url}
          onClick={() =>
            navigate({ to: profilePath, params: { chatId: chat.id } })
          }
        />
      </div>
      <div className="mobile-chat__header-slot mobile-chat__header-slot--right" aria-hidden />
    </header>
  );
}
