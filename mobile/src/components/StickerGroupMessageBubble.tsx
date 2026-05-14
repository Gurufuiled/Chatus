import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { Message } from '../stores/types';
import { resolveStickerImageOrPlaceholder, soloChatusStickerDisplayDp, tryDecodeStickerPayload } from '../stickers/chatusStickerCatalog';
import { MessageTimeStatus } from './MessageTimeStatus';

const SOLO_BASE = soloChatusStickerDisplayDp();
const MAX_STICKERS_PER_ROW = 4;
const ROW_MAX_WIDTH = 272;

function cellSizeForCount(n: number): number {
  if (n >= 4) return Math.round(SOLO_BASE * 0.42);
  if (n === 3) return Math.round(SOLO_BASE * 0.5);
  if (n === 2) return Math.round(SOLO_BASE * 0.62);
  return SOLO_BASE;
}

function chunkMessages<T>(arr: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    out.push(arr.slice(i, i + chunkSize));
  }
  return out;
}

function cellSizeForRow(rowLen: number): number {
  const base = cellSizeForCount(rowLen);
  const gaps = Math.max(0, rowLen - 1) * 6;
  const cap = Math.floor((ROW_MAX_WIDTH - gaps) / Math.max(1, rowLen));
  return Math.max(28, Math.min(base, cap));
}

export type StickerGroupMessageBubbleProps = {
  /** От нового к старому (как в `messages` чата). */
  messages: Message[];
  isMe: boolean;
  time: string;
  status: string;
  timeColor: string;
  iconColor: string;
  topHeader: React.ReactNode;
  replySnippet: React.ReactNode;
  reactions: React.ReactNode | null;
};

/**
 * Несколько подряд отправленных стикеров — до 4 в ряд, перенос на следующую строку + одна мета времени.
 */
export function StickerGroupMessageBubble({
  messages,
  isMe,
  time,
  status,
  timeColor,
  iconColor,
  topHeader,
  replySnippet,
  reactions,
}: StickerGroupMessageBubbleProps) {
  const rows = chunkMessages(messages, MAX_STICKERS_PER_ROW);

  return (
    <View style={[styles.root, isMe ? styles.rootMe : styles.rootOther]}>
      {topHeader}
      {replySnippet}
      <View style={styles.rowsColumn}>
        {rows.map((rowMsgs, rowIdx) => {
          const k = rowMsgs.length;
          const cell = cellSizeForRow(k);
          const inner = Math.max(20, cell - 8);
          return (
            <View
              key={`row-${rowIdx}`}
              style={[styles.row, isMe ? styles.rowMe : styles.rowOther, { maxWidth: ROW_MAX_WIDTH }]}
            >
              {rowMsgs.map((m) => {
                const ref = tryDecodeStickerPayload(m.content ?? '');
                const src = ref ? resolveStickerImageOrPlaceholder(ref) : null;
                if (!src) {
                  return <View key={m.id} style={[styles.cell, { width: cell, height: cell }]} />;
                }
                return (
                  <View key={m.id} style={[styles.cell, { width: cell, height: cell }]}>
                    <Image
                      source={src}
                      style={{ width: inner, height: inner }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      recyclingKey={m.id}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
      <View style={[styles.metaRow, isMe ? styles.metaRowMe : styles.metaRowOther]}>
        <MessageTimeStatus
          time={time}
          status={status}
          isMe={isMe}
          compact
          timeColor={timeColor}
          iconColor={iconColor}
        />
      </View>
      {reactions}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    maxWidth: 280,
    marginVertical: 2,
  },
  rootMe: { alignSelf: 'flex-end' },
  rootOther: { alignSelf: 'flex-start' },
  rowsColumn: {
    flexDirection: 'column',
    gap: 6,
    alignItems: 'stretch',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-end',
    gap: 6,
  },
  rowMe: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
  rowOther: { justifyContent: 'flex-start', alignSelf: 'flex-start' },
  cell: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  metaRowMe: { justifyContent: 'flex-end' },
  metaRowOther: { justifyContent: 'flex-start' },
});
