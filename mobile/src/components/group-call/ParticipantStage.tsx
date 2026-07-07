import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { GroupCallParticipant } from '../../contexts/GroupCallContext';
import { ParticipantTile, TILE_ASPECT_RATIO } from './ParticipantTile';

const STAGE_PADDING_H = 16;
const STAGE_PADDING_V = 12;
const TILE_GAP = 10;
const SINGLE_TILE_MAX_WIDTH = 320;

type ParticipantStageProps = {
  participants: GroupCallParticipant[];
  renderVideoSlot?: (participant: GroupCallParticipant) => React.ReactNode;
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
    const tileWidth = Math.min(innerWidth * 0.55, SINGLE_TILE_MAX_WIDTH);
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
    layout.tileWidth = Math.min(layout.tileWidth, SINGLE_TILE_MAX_WIDTH);
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

export function ParticipantStage({ participants, renderVideoSlot }: ParticipantStageProps) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const onStageLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

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
    return <View style={styles.stage} onLayout={onStageLayout} />;
  }

  return (
    <View style={styles.stage} onLayout={onStageLayout}>
      <View
        style={[
          styles.grid,
          layout.centerStage ? styles.gridCentered : null,
        ]}
      >
        {rows.map((row, rowIndex) => (
          <View
            key={`row-${rowIndex}`}
            style={[
              styles.row,
              row.length < layout.columns ? styles.rowCentered : null,
              rowIndex > 0 ? { marginTop: TILE_GAP } : null,
            ]}
          >
            {row.map((participant, colIndex) => (
              <View
                key={participant.userId}
                style={[
                  styles.tileSlot,
                  { width: layout.tileWidth, height: layout.tileHeight },
                  colIndex > 0 ? { marginLeft: TILE_GAP } : null,
                ]}
              >
                <ParticipantTile
                  participant={participant}
                  width={layout.tileWidth}
                  height={layout.tileHeight}
                  isDominantSpeaker={participant.isSpeaking && speakingCount === 1}
                  videoSlot={renderVideoSlot?.(participant)}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  grid: {
    paddingHorizontal: STAGE_PADDING_H,
    paddingVertical: STAGE_PADDING_V,
  },
  tileSlot: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCentered: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  rowCentered: {
    justifyContent: 'center',
  },
});
