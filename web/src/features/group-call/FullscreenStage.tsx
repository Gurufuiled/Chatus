import type { ReactNode } from 'react';
import type { GroupCallParticipant } from '@/contexts/GroupCallContext';
import { ParticipantTile } from './ParticipantTile';
import { IconFullscreenExit, IconScreenShare } from './callIcons';

const THUMB_WIDTH = 116;

type FullscreenStageProps = {
  participants: GroupCallParticipant[];
  fullscreenUserId: string;
  renderVideoSlot: (participant: GroupCallParticipant) => ReactNode;
  onExitFullscreen: () => void;
};

/**
 * Zoom/Meet-style "presentation" layout: the shared screen fills the main
 * area, other participants (and a small preview of the sharer) sit in a
 * horizontally scrollable strip below.
 *
 * Local presenters never see their own live screen-share video — that creates
 * a recursive "hall of mirrors" when the ChatUs window is on the shared display.
 */
export function FullscreenStage({
  participants,
  fullscreenUserId,
  renderVideoSlot,
  onExitFullscreen,
}: FullscreenStageProps) {
  const mainParticipant = participants.find((p) => p.userId === fullscreenUserId);
  if (!mainParticipant) return null;
  const displayName = mainParticipant.isLocal ? 'Вы' : mainParticipant.displayName;
  const mainVideo = mainParticipant.isLocal ? null : renderVideoSlot(mainParticipant);

  return (
    <div className="group-call-fullscreen">
      <div className="group-call-fullscreen__main">
        <div className="group-call-fullscreen__main-inner">
          {mainParticipant.isLocal ? (
            <div className="group-call-fullscreen__self-share">
              <IconScreenShare />
              <p className="group-call-fullscreen__self-share-title">Вы демонстрируете экран</p>
              <p className="group-call-fullscreen__self-share-hint">
                Участники видят ваш экран. Превью отключено, чтобы не было зеркала.
              </p>
            </div>
          ) : (
            mainVideo ?? (
              <div className="group-call-fullscreen__placeholder">
                Демонстрация экрана завершена
              </div>
            )
          )}
        </div>
        <button
          type="button"
          className="group-call-fullscreen__exit"
          aria-label="Свернуть демонстрацию экрана"
          title="Свернуть"
          onClick={onExitFullscreen}
        >
          <IconFullscreenExit />
        </button>
        <span className="group-call-fullscreen__label">
          {displayName} · Демонстрация экрана
        </span>
      </div>
      <div className="group-call-fullscreen__strip">
        {participants.map((participant) => (
          <ParticipantTile
            key={participant.userId}
            participant={participant}
            width={THUMB_WIDTH}
            videoSlot={renderVideoSlot(participant)}
          />
        ))}
      </div>
    </div>
  );
}
