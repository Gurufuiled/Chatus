import type { TelegramAlbumMediaItem, TelegramMessageRow } from './types';

export function getTdMediaAlbumId(raw: Record<string, unknown>): number | undefined {
  const id = raw.media_album_id;
  if (typeof id === 'number' && Number.isFinite(id) && id !== 0) {
    return id;
  }
  if (typeof id === 'string' && id.trim() !== '') {
    const parsed = Number(id);
    if (Number.isFinite(parsed) && parsed !== 0) {
      return parsed;
    }
  }
  return undefined;
}

function isAlbumPartRow(row: TelegramMessageRow): boolean {
  return (
    (row.kind === 'image' || row.kind === 'video') &&
    row.mediaAlbumId != null &&
    row.mediaAlbumId !== 0
  );
}

function rowToAlbumItem(row: TelegramMessageRow): TelegramAlbumMediaItem | null {
  if (row.kind !== 'image' && row.kind !== 'video') return null;
  return {
    messageId: row.messageId,
    kind: row.kind,
    mediaUri: row.mediaUri,
    mediaFullFileId: row.mediaFullFileId,
    thumbnailUri: row.thumbnailUri,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
  };
}

function buildAlbumRow(parts: TelegramMessageRow[]): TelegramMessageRow | null {
  if (parts.length < 2) return null;

  const sorted = [...parts].sort((a, b) => a.messageId - b.messageId);
  const items = sorted
    .map(rowToAlbumItem)
    .filter((item): item is TelegramAlbumMediaItem => item != null);
  if (items.length < 2) return null;

  const anchor = sorted[sorted.length - 1]!;
  const captionRow =
    [...sorted].reverse().find((row) => (row.text ?? '').trim().length > 0) ?? anchor;
  const albumMessageIds = sorted.map((row) => row.messageId);
  const mediaAlbumId = anchor.mediaAlbumId ?? sorted[0]?.mediaAlbumId;

  return {
    ...anchor,
    id: mediaAlbumId != null ? `album-${mediaAlbumId}` : `album-${anchor.messageId}`,
    messageId: anchor.messageId,
    kind: 'album',
    text: captionRow.text ?? '',
    albumMedia: items,
    albumMessageIds,
    mediaAlbumId,
    mediaUri: undefined,
    thumbnailUri: undefined,
    width: undefined,
    height: undefined,
    durationMs: undefined,
  };
}

/**
 * Merges TDLib photo/video messages that share `media_album_id` into one `kind: 'album'` row.
 * Input should be sorted newest-first (`messageId` desc).
 */
export function collapseTelegramAlbumRows(rows: TelegramMessageRow[]): TelegramMessageRow[] {
  if (rows.length === 0) return rows;

  const regroupAlbumIds = new Set<number>();
  for (const row of rows) {
    if (isAlbumPartRow(row) && row.mediaAlbumId != null) {
      regroupAlbumIds.add(row.mediaAlbumId);
    }
  }
  const filteredRows = rows.filter(
    (row) =>
      !(
        row.kind === 'album' &&
        row.mediaAlbumId != null &&
        regroupAlbumIds.has(row.mediaAlbumId)
      ),
  );

  const albumGroups = new Map<number, TelegramMessageRow[]>();
  const standalone: TelegramMessageRow[] = [];

  for (const row of filteredRows) {
    if (!isAlbumPartRow(row) || row.mediaAlbumId == null) {
      standalone.push(row);
      continue;
    }
    const bucket = albumGroups.get(row.mediaAlbumId) ?? [];
    bucket.push(row);
    albumGroups.set(row.mediaAlbumId, bucket);
  }

  const collapsedAlbums: TelegramMessageRow[] = [];
  for (const group of albumGroups.values()) {
    const album = buildAlbumRow(group);
    if (album) {
      collapsedAlbums.push(album);
    } else {
      standalone.push(...group);
    }
  }

  return [...standalone, ...collapsedAlbums].sort((a, b) => b.messageId - a.messageId);
}

function dropConfirmedOutgoingSendingTwins(rows: TelegramMessageRow[]): TelegramMessageRow[] {
  const confirmedOutgoing = rows.filter(
    (row) =>
      row.outgoing &&
      row.messageId > 0 &&
      row.status !== 'sending' &&
      row.status !== 'failed',
  );
  if (confirmedOutgoing.length === 0) return rows;

  return rows.filter((item) => {
    if (!item.outgoing || item.status !== 'sending') return true;
    return !confirmedOutgoing.some((next) => {
      if (next.kind !== item.kind) return false;
      if (Math.abs(item.dateMs - next.dateMs) >= 120_000) return false;
      if (next.kind === 'text') {
        return (item.text ?? '').trim() === (next.text ?? '').trim();
      }
      return true;
    });
  });
}

export function normalizeTelegramFeedRows(rows: TelegramMessageRow[]): TelegramMessageRow[] {
  return collapseTelegramAlbumRows(
    dropConfirmedOutgoingSendingTwins([...rows].sort((a, b) => b.messageId - a.messageId)),
  );
}

/** Merge history/updates into feed: replace overlapping album parts and re-collapse. */
export function mergeTelegramFeedRows(
  prev: TelegramMessageRow[],
  incoming: TelegramMessageRow[],
): TelegramMessageRow[] {
  if (incoming.length === 0) return normalizeTelegramFeedRows(prev);

  const incomingIds = new Set(incoming.map((row) => row.id));
  const incomingMessageIds = new Set(incoming.map((row) => row.messageId));

  /** Replace by id/messageId only; album regrouping is done in normalizeTelegramFeedRows. */
  const merged = prev.filter((existing) => {
    if (incomingIds.has(existing.id) || incomingMessageIds.has(existing.messageId)) {
      return false;
    }
    return true;
  });

  merged.push(...incoming);
  return normalizeTelegramFeedRows(merged);
}

/** TDLib message ids represented by a feed row (single or album). */
export function getTelegramRowTdMessageIds(row: TelegramMessageRow): number[] {
  if (row.kind === 'album' && row.albumMessageIds && row.albumMessageIds.length > 0) {
    return row.albumMessageIds.filter((id) => id > 0);
  }
  return row.messageId > 0 ? [row.messageId] : [];
}

/** Find feed row index for a TDLib `message_id` (including album members). */
export function findTelegramRowIndexByTdMessageId(
  rows: TelegramMessageRow[],
  messageId: number,
): number {
  return rows.findIndex((row) => getTelegramRowTdMessageIds(row).includes(messageId));
}
