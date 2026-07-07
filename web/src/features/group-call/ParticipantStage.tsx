import { useEffect, useMemo, useState } from 'react';
import type { GroupCallParticipant } from '@/contexts/GroupCallContext';
import { ParticipantTile, TILE_ASPECT_RATIO } from './ParticipantTile';

const STAGE_PADDING_H = 16;
const TILE_GAP = 10;

type ParticipantStageProps = {
  participants: GroupCallParticipant[];
  renderVideoSlot?: (participant: GroupCallParticipant) => React.ReactNode;
};

type StageLayout = {
  columns: number;
  tileWidth: number;
  scrollable: boolean;
  centerStage: boolean;
};

function computeLayout(count: number, containerWidth: number): StageLayout {
  const innerWidth = containerWidth - STAGE_PADDING_H * 2;

  if (count <= 0) {
    return { columns: 1, tileWidth: innerWidth * 0.55, scrollable: false, centerStage: true };
  }
  if (count === 1) {
    return {
      columns: 1,
      tileWidth: Math.min(innerWidth * 0.58, 280),
      scrollable: false,
      centerStage: true,
    };
  }
  if (count === 2) {
    const tileWidth = (innerWidth - TILE_GAP) / 2;
    return { columns: 2, tileWidth, scrollable: false, centerStage: false };
  }
  if (count <= 4) {
    const tileWidth = (innerWidth - TILE_GAP) / 2;
    return { columns: 2, tileWidth, scrollable: false, centerStage: false };
  }
  const columns = count >= 7 ? 3 : 2;
  const tileWidth = (innerWidth - TILE_GAP * (columns - 1)) / columns;
  return { columns, tileWidth, scrollable: true, centerStage: false };
}

function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function ParticipantStage({ participants, renderVideoSlot }: ParticipantStageProps) {
  const [containerWidth, setContainerWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 360,
  );

  useEffect(() => {
    const onResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const layout = useMemo(
    () => computeLayout(participants.length, containerWidth),
    [participants.length, containerWidth],
  );
  const rows = useMemo(
    () => chunkRows(participants, layout.columns),
    [layout.columns, participants],
  );
  const speakingCount = useMemo(
    () => participants.filter((p) => p.isSpeaking).length,
    [participants],
  );

  const grid = (
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
              isDominantSpeaker={participant.isSpeaking && speakingCount === 1}
              videoSlot={renderVideoSlot?.(participant)}
            />
          ))}
        </div>
      ))}
    </div>
  );

  if (layout.scrollable) {
    return <div className="group-call-stage group-call-stage--scroll">{grid}</div>;
  }

  return <div className="group-call-stage">{grid}</div>;
}

export { TILE_ASPECT_RATIO };
