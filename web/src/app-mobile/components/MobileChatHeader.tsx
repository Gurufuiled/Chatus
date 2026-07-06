import { useNavigate } from '@tanstack/react-router';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import type { ChatSummary } from '@/types/chat';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';

interface MobileChatHeaderProps {
  chat: ChatSummary;
}

export function MobileChatHeader({ chat }: MobileChatHeaderProps) {
  const navigate = useNavigate();
  const title = getChatDisplayName(chat);
  const avatarSrc = resolveAvatarSrc(chat.avatar_url);
  const subtitle =
    chat.chat_type === 'group'
      ? `${chat.members?.length ?? 0} участников`
      : chat.members?.find((m) => m.user)?.user?.is_online
        ? 'в сети'
        : '';

  return (
    <header className="mobile-chat__header">
      <button
        type="button"
        className="mobile-chat__back"
        onClick={() => navigate({ to: '/' })}
        aria-label="Назад к списку чатов"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <div className="mobile-chat__title-wrap">
        {avatarSrc ? (
          <img className="mobile-chat__title-avatar" src={avatarSrc} alt="" />
        ) : (
          <div
            className="mobile-chat__title-avatar-fallback"
            style={{ backgroundColor: getAvatarColor(title) }}
          >
            {(title.trim()[0] || '?').toUpperCase()}
          </div>
        )}
        <div className="mobile-chat__title-text">
          <div className="mobile-chat__title">{title}</div>
          {subtitle ? <div className="mobile-chat__subtitle">{subtitle}</div> : null}
        </div>
      </div>
    </header>
  );
}
