import { ChatStatusChecks } from '@/features/chat-list/ChatStatusChecks';
import type { GroupCallSystemPayload } from '@/utils/groupCallSystemMessage';
import { formatMessageTime } from '@/features/conversation/messageFormatters';

type GroupCallSystemMessageProps = {
  payload: GroupCallSystemPayload;
  canJoin: boolean;
  onJoin?: () => void;
  createdAt: number;
  status: string;
};

export function GroupCallSystemMessage({
  payload,
  canJoin,
  onJoin,
  createdAt,
  status,
}: GroupCallSystemMessageProps) {
  const durationLine =
    payload.action === 'ended' && payload.duration_minutes
      ? `Длительность: ${payload.duration_minutes} мин`
      : null;
  const time = formatMessageTime(createdAt);

  return (
    <div className="group-call-system-message">
      <div className="group-call-system-message__card">
        <div className="group-call-system-message__row">
          <span className="group-call-system-message__icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
            </svg>
          </span>
          <div className="group-call-system-message__text-col">
            <p className="group-call-system-message__text">{payload.display}</p>
            {durationLine ? (
              <p className="group-call-system-message__duration">{durationLine}</p>
            ) : null}
          </div>
        </div>
        {payload.action === 'started' && canJoin && onJoin ? (
          <button type="button" className="group-call-system-message__join" onClick={onJoin}>
            Присоединиться
          </button>
        ) : null}
        <div className="group-call-system-message__meta">
          <time dateTime={new Date(createdAt).toISOString()}>{time}</time>
          <ChatStatusChecks status={status} />
        </div>
      </div>
    </div>
  );
}
