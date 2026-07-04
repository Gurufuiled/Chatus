import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { GroupCallParticipant } from '../../contexts/GroupCallContext';
import { ParticipantTile, TILE_ASPECT_RATIO } from './ParticipantTile';

const STAGE_PADDING_H = 16;
const SCROLL_EDGE_PADDING = 14;
const TILE_GAP = 10;

type ParticipantStageProps = {
  participants: GroupCallParticipant[];
};

type StageLayout = {
  columns: number;
  tileWidth: number;
  scrollable: boolean;
  centerStage: boolean;
};

function computeLayout(count: number, screenWidth: number): StageLayout {
  const innerWidth = screenWidth - STAGE_PADDING_H * 2;

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

export function ParticipantStage({ participants }: ParticipantStageProps) {
  const { width: screenWidth } = useWindowDimensions();
  const layout = useMemo(
    () => computeLayout(participants.length, screenWidth),
    [participants.length, screenWidth],
  );
  const rows = useMemo(
    () => chunkRows(participants, layout.columns),
    [layout.columns, participants],
  );
  const speakingCount = useMemo(
    () => participants.filter((p) => p.isSpeaking).length,
    [participants],
  );
  const tileHeight = layout.tileWidth / TILE_ASPECT_RATIO;

  const grid = (
    <View
      style={[
        styles.grid,
        layout.centerStage ? styles.gridCentered : null,
        layout.scrollable ? styles.gridScrollable : styles.gridFlexGrow,
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
                { width: layout.tileWidth, height: tileHeight },
                colIndex > 0 ? { marginLeft: TILE_GAP } : null,
              ]}
            >
              <ParticipantTile
                participant={participant}
                width={layout.tileWidth}
                isDominantSpeaker={participant.isSpeaking && speakingCount === 1}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  if (layout.scrollable) {
    return (
      <ScrollView
        style={styles.stage}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {grid}
      </ScrollView>
    );
  }

  return <View style={[styles.stage, styles.stageFlex]}>{grid}</View>;
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    width: '100%',
    overflow: 'visible',
  },
  stageFlex: {
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: STAGE_PADDING_H,
    paddingVertical: 12 + SCROLL_EDGE_PADDING,
    flexGrow: 1,
    justifyContent: 'center',
  },
  grid: {
    paddingHorizontal: STAGE_PADDING_H,
    paddingVertical: 12,
    overflow: 'visible',
  },
  tileSlot: {
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridScrollable: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  gridCentered: {
    alignItems: 'center',
  },
  gridFlexGrow: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    overflow: 'visible',
  },
  rowCentered: {
    justifyContent: 'center',
  },
});
