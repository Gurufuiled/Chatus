import type { KeyboardEvent, ReactNode } from 'react';
import type { GroupCallParticipant } from '@/contexts/GroupCallContext';
import { IconFullscreenEnter } from './callIcons';

export const TILE_ASPECT_RATIO = 16 / 9;

type ParticipantTileProps = {
  participant: GroupCallParticipant;
  width: number;
  height?: number;
  isDominantSpeaker?: boolean;
  videoSlot?: ReactNode;
  volume?: number;
  showVolumePopover?: boolean;
  onVolumeChange?: (volume: number) => void;
  onVolumeToggle?: () => void;
  /** True when this tile's video is a screen-share track — enables the fullscreen toggle. */
  isScreenShare?: boolean;
  onFullscreenToggle?: () => void;
};

function buildInitial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

function ParticipantVolumePopover({
  displayName,
  volume,
  onChange,
}: {
  displayName: string;
  volume: number;
  onChange: (volume: number) => void;
}) {
  const percent = Math.round(volume * 100);

  return (
    <div
      className="group-call-tile-volume"
      role="dialog"
      aria-label={`Громкость: ${displayName}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="group-call-tile-volume__label">
        Громкость · {percent}%
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        className="group-call-tile-volume__slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </div>
  );
}

export function ParticipantTile({
  participant,
  width,
  height: heightProp,
  isDominantSpeaker = false,
  videoSlot,
  volume = 1,
  showVolumePopover = false,
  onVolumeChange,
  onVolumeToggle,
  isScreenShare = false,
  onFullscreenToggle,
}: ParticipantTileProps) {
  const height = heightProp ?? width / TILE_ASPECT_RATIO;
  const isSpeaking = participant.isSpeaking;
  const isHighlighted = isSpeaking || isDominantSpeaker;
  const displayName = participant.isLocal ? 'Вы' : participant.displayName;
  const canAdjustVolume = !participant.isLocal && Boolean(onVolumeToggle && onVolumeChange);
  const volumePercent = Math.round(volume * 100);
  const volumeAdjusted = canAdjustVolume && volumePercent !== 100;

  const handleTileClick = () => {
    if (!canAdjustVolume) return;
    onVolumeToggle?.();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!canAdjustVolume) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onVolumeToggle?.();
    }
  };

  return (
    <div
      className={`group-call-tile${isHighlighted ? ' group-call-tile--speaking' : ''}${isDominantSpeaker ? ' group-call-tile--dominant' : ''}${canAdjustVolume ? ' group-call-tile--clickable' : ''}`}
      style={{ width, height }}
      data-participant-id={participant.userId}
      role={canAdjustVolume ? 'group' : undefined}
      tabIndex={canAdjustVolume && !showVolumePopover ? 0 : undefined}
      onClick={canAdjustVolume && !showVolumePopover ? handleTileClick : undefined}
      onKeyDown={canAdjustVolume && !showVolumePopover ? handleKeyDown : undefined}
      aria-label={
        participant.isMuted
          ? `${displayName}, микрофон выключен`
          : isHighlighted
            ? `${displayName}, говорит`
            : canAdjustVolume
              ? `${displayName}, нажмите для настройки громкости`
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
        {showVolumePopover && onVolumeChange ? (
          <ParticipantVolumePopover
            displayName={displayName}
            volume={volume}
            onChange={onVolumeChange}
          />
        ) : null}
        <div className="group-call-tile__name-gradient" aria-hidden />
        <div className="group-call-tile__name">{displayName}</div>
        {volumeAdjusted ? (
          <span className="group-call-tile__volume-badge" aria-hidden title={`Громкость ${volumePercent}%`}>
            {volumePercent}%
          </span>
        ) : null}
        {participant.isMuted ? (
          <span className="group-call-tile__mute-badge" aria-hidden title="Микрофон выключен">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
        ) : null}
        {isScreenShare && onFullscreenToggle ? (
          <button
            type="button"
            className="group-call-tile__fullscreen-btn"
            aria-label="Полноэкранная демонстрация экрана"
            title="Развернуть на весь экран"
            onClick={(e) => {
              e.stopPropagation();
              onFullscreenToggle();
            }}
          >
            <IconFullscreenEnter size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
