import type { GroupCallParticipant } from '@/contexts/GroupCallContext';

export const TILE_ASPECT_RATIO = 4 / 5;

type ParticipantTileProps = {
  participant: GroupCallParticipant;
  width: number;
  isDominantSpeaker?: boolean;
  videoSlot?: React.ReactNode;
};

function buildInitial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

export function ParticipantTile({
  participant,
  width,
  isDominantSpeaker = false,
  videoSlot,
}: ParticipantTileProps) {
  const height = width / TILE_ASPECT_RATIO;
  const isSpeaking = participant.isSpeaking;
  const isHighlighted = isSpeaking || isDominantSpeaker;
  const displayName = participant.isLocal ? 'Вы' : participant.displayName;

  return (
    <div
      className={`group-call-tile${isHighlighted ? ' group-call-tile--speaking' : ''}${isDominantSpeaker ? ' group-call-tile--dominant' : ''}`}
      style={{ width, height }}
      aria-label={
        participant.isMuted
          ? `${displayName}, микрофон выключен`
          : isHighlighted
            ? `${displayName}, говорит`
            : displayName
      }
    >
      <div className="group-call-tile__inner">
        {videoSlot ?? (
          <div className="group-call-tile__avatar-slot">
            {participant.avatarUrl ? (
              <img src={participant.avatarUrl} alt="" className="group-call-tile__avatar" />
            ) : (
              <div className="group-call-tile__initial">{buildInitial(participant.displayName)}</div>
            )}
          </div>
        )}
        <div className="group-call-tile__name-gradient" aria-hidden />
        <div className="group-call-tile__name">{displayName}</div>
        {participant.isMuted ? (
          <span className="group-call-tile__mute-badge" aria-hidden title="Микрофон выключен">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
        ) : null}
      </div>
    </div>
  );
}
