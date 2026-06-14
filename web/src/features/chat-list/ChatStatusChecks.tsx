import type { MessageStatus } from '@/types/message';

interface ChatStatusChecksProps {
  status?: MessageStatus;
}

export function ChatStatusChecks({ status }: ChatStatusChecksProps) {
  if (!status || status === 'sending' || status === 'error') return null;

  const isRead = status === 'read';
  const label = isRead ? 'Read' : 'Sent';

  return (
    <span className="chat-status-checks" aria-label={label} title={label}>
      <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden>
        <path
          d="M1 5.5L4.5 9L9 1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {isRead ? (
          <path
            d="M5 5.5L8.5 9L15 1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </span>
  );
}
