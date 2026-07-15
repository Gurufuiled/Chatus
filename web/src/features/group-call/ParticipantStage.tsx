import { useEffect, useMemo, useRef, useState } from 'react';
import type { GroupCallParticipant } from '@/contexts/GroupCallContext';
import { ParticipantTile, TILE_ASPECT_RATIO } from './ParticipantTile';

const STAGE_PADDING_H = 16;
const STAGE_PADDING_V = 12;
const TILE_GAP = 10;
const SINGLE_TILE_MAX_WIDTH = 560;
const SINGLE_TILE_WIDTH_RATIO = 0.7;

type ParticipantStageProps = {
  participants: GroupCallParticipant[];
  renderVideoSlot?: (participant: GroupCallParticipant) => React.ReactNode;
  volumeUserId?: string | null;
  getParticipantVolume?: (userId: string) => number;
  onParticipantVolumeChange?: (userId: string, volume: number) => void;
  onVolumeUserIdChange?: (userId: string | null) => void;
  isParticipantScreenSharing?: (participant: GroupCallParticipant) => boolean;
  onFullscreenToggle?: (userId: string) => void;
};

type StageLayout = {
  columns: number;
  tileWidth: number;
  tileHeight: number;
  centerStage: boolean;
};

function computeLayout(
  count: number,
  containerWidth: number,
  containerHeight: number,
): StageLayout {
  const innerWidth = Math.max(0, containerWidth - STAGE_PADDING_H * 2);
  const innerHeight = Math.max(0, containerHeight - STAGE_PADDING_V * 2);

  if (count <= 0) {
    const tileWidth = Math.min(innerWidth * SINGLE_TILE_WIDTH_RATIO, SINGLE_TILE_MAX_WIDTH);
    return {
      columns: 1,
      tileWidth,
      tileHeight: tileWidth / TILE_ASPECT_RATIO,
      centerStage: true,
    };
  }

  const maxColumns = count >= 7 ? 3 : count >= 2 ? 2 : 1;
  let best: StageLayout | null = null;
  let bestArea = -1;

  for (let columns = 1; columns <= Math.min(count, maxColumns); columns += 1) {
    const rows = Math.ceil(count / columns);
    const maxTileWidth = (innerWidth - TILE_GAP * (columns - 1)) / columns;
    const maxTileHeight = (innerHeight - TILE_GAP * (rows - 1)) / rows;
    if (maxTileWidth <= 0 || maxTileHeight <= 0) continue;

    let tileWidth = maxTileWidth;
    let tileHeight = tileWidth / TILE_ASPECT_RATIO;
    if (tileHeight > maxTileHeight) {
      tileHeight = maxTileHeight;
      tileWidth = tileHeight * TILE_ASPECT_RATIO;
    }

    const area = tileWidth * tileHeight;
    if (area > bestArea) {
      bestArea = area;
      best = {
        columns,
        tileWidth,
        tileHeight,
        centerStage: count === 1,
      };
    }
  }

  const layout = best ?? {
    columns: 1,
    tileWidth: Math.min(innerWidth, 200),
    tileHeight: Math.min(innerWidth, 200) / TILE_ASPECT_RATIO,
    centerStage: true,
  };

  if (!best) {
    if (layout.tileHeight > innerHeight && innerHeight > 0) {
      layout.tileHeight = innerHeight;
      layout.tileWidth = layout.tileHeight * TILE_ASPECT_RATIO;
    }
  }

  if (count === 1) {
    layout.tileWidth = Math.min(
      layout.tileWidth,
      innerWidth * SINGLE_TILE_WIDTH_RATIO,
      SINGLE_TILE_MAX_WIDTH,
    );
    layout.tileHeight = layout.tileWidth / TILE_ASPECT_RATIO;
    if (layout.tileHeight > innerHeight) {
      layout.tileHeight = innerHeight;
      layout.tileWidth = layout.tileHeight * TILE_ASPECT_RATIO;
    }
  }

  return layout;
}

function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function ParticipantStage({
  participants,
  renderVideoSlot,
  volumeUserId = null,
  getParticipantVolume,
  onParticipantVolumeChange,
  onVolumeUserIdChange,
  isParticipantScreenSharing,
  onFullscreenToggle,
}: ParticipantStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const updateSize = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setContainerSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () => computeLayout(participants.length, containerSize.width, containerSize.height),
    [participants.length, containerSize.height, containerSize.width],
  );
  const rows = useMemo(
    () => chunkRows(participants, layout.columns),
    [layout.columns, participants],
  );
  const speakingCount = useMemo(
    () => participants.filter((p) => p.isSpeaking).length,
    [participants],
  );

  if (containerSize.width <= 0 || containerSize.height <= 0) {
    return <div ref={stageRef} className="group-call-stage" />;
  }

  return (
    <div ref={stageRef} className="group-call-stage">
      <div
        className={`group-call-stage__grid${layout.centerStage ? ' group-call-stage__grid--centered' : ''}`}
      >
        {rows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className={`group-call-stage__row${row.length < layout.columns ? ' group-call-stage__row--centered' : ''}`}
          >
            {row.map((participant) => (
              <ParticipantTile
                key={participant.userId}
                participant={participant}
                width={layout.tileWidth}
                height={layout.tileHeight}
                isDominantSpeaker={participant.isSpeaking && speakingCount === 1}
                videoSlot={renderVideoSlot?.(participant)}
                volume={getParticipantVolume?.(participant.userId)}
                showVolumePopover={
                  !participant.isLocal &&
                  volumeUserId === participant.userId &&
                  Boolean(onParticipantVolumeChange)
                }
                onVolumeChange={
                  onParticipantVolumeChange
                    ? (volume) => onParticipantVolumeChange(participant.userId, volume)
                    : undefined
                }
                onVolumeToggle={
                  participant.isLocal || !onVolumeUserIdChange
                    ? undefined
                    : () =>
                        onVolumeUserIdChange(
                          volumeUserId === participant.userId ? null : participant.userId,
                        )
                }
                isScreenShare={isParticipantScreenSharing?.(participant) ?? false}
                onFullscreenToggle={
                  onFullscreenToggle ? () => onFullscreenToggle(participant.userId) : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export { TILE_ASPECT_RATIO };
