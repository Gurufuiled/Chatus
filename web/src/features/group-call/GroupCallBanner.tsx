import type { ApiGroupCallRoom } from '@/services/groupCallService';
import { formatParticipantCount } from '@/utils/groupCallSystemMessage';

type GroupCallBannerProps = {
  activeRoom: ApiGroupCallRoom | null | undefined;
  isUserInCall: boolean;
  participantPreview?: string;
  onJoin: () => void;
  onOpen: () => void;
};

export function GroupCallBanner({
  activeRoom,
  isUserInCall,
  participantPreview,
  onJoin,
  onOpen,
}: GroupCallBannerProps) {
  if (!activeRoom) return null;

  const count = activeRoom.participant_count || 0;
  const title =
    count > 0
      ? `Голосовой чат · ${formatParticipantCount(count)}`
      : 'Голосовой чат';
  const subtitle = participantPreview?.trim() || null;

  return (
    <div className="group-call-banner">
      <div className="group-call-banner__inner">
        <span className="group-call-banner__dot" aria-hidden />
        <div className="group-call-banner__text">
          <span className="group-call-banner__title">{title}</span>
          {subtitle ? <span className="group-call-banner__subtitle">{subtitle}</span> : null}
        </div>
        <button
          type="button"
          className="group-call-banner__cta"
          onClick={isUserInCall ? onOpen : onJoin}
        >
          {isUserInCall ? 'Открыть' : 'Присоединиться'}
        </button>
      </div>
    </div>
  );
}
