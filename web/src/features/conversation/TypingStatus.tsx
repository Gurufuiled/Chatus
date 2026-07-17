import { Avatar } from '@/components/avatar/Avatar';
import type { ChatSummary } from '@/types/chat';
import {
  formatTypingLabel,
  MAX_TYPING_AVATARS,
  resolveTypingPeople,
} from './typingFormatters';

interface TypingStatusProps {
  chat: ChatSummary;
  userIds: string[];
}

/** Header subtitle: group typing with stacked avatars; private = plain text. */
export function TypingStatus({ chat, userIds }: TypingStatusProps) {
  const isGroupChat = chat.chat_type === 'group';
  const people = resolveTypingPeople(chat, userIds);
  const label = formatTypingLabel(people, isGroupChat);
  if (!label) return null;

  if (!isGroupChat) {
    return (
      <span
        className="conversation-header__status conversation-header__status--typing"
        aria-live="polite"
      >
        {label}
      </span>
    );
  }

  const avatars = people.slice(0, MAX_TYPING_AVATARS);

  return (
    <span className="conversation-header__typing" aria-live="polite">
      <span className="conversation-header__typing-avatars" aria-hidden>
        {avatars.map((person) => (
          <span key={person.userId} className="conversation-header__typing-avatar">
            <Avatar name={person.displayName} imageUrl={person.avatarUrl} size={16} />
          </span>
        ))}
      </span>
      <span className="conversation-header__status conversation-header__status--typing">
        {label}
      </span>
    </span>
  );
}
