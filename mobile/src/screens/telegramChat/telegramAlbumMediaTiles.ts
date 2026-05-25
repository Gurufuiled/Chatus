import type { MediaTile } from '../../components/ChatProfileMediaSection';
import type { TelegramAlbumMediaItem } from './types';

/** Tiles for fullscreen album viewer (images + videos). */
export function buildTelegramAlbumViewerTiles(
  items: TelegramAlbumMediaItem[],
  caption?: string,
): MediaTile[] {
  const trimmedCaption = caption?.trim();
  const tiles: MediaTile[] = [];

  for (const item of items) {
    if (item.kind === 'image') {
      const uri = item.mediaUri?.trim();
      if (!uri) continue;
      tiles.push({
        id: `tg-${item.messageId}`,
        kind: 'image',
        uri,
        caption: tiles.length === 0 ? trimmedCaption : undefined,
      });
      continue;
    }

    const uri = item.mediaUri?.trim();
    if (!uri) continue;
    const preview = item.thumbnailUri?.trim() || undefined;
    tiles.push({
      id: `tg-${item.messageId}`,
      kind: 'video',
      uri,
      previewUri: preview,
      durationMs: item.durationMs,
      caption: tiles.length === 0 ? trimmedCaption : undefined,
    });
  }

  return tiles;
}

export function findTelegramAlbumViewerIndex(tiles: MediaTile[], messageId: number): number {
  const id = `tg-${messageId}`;
  const idx = tiles.findIndex((tile) => tile.id === id);
  return idx >= 0 ? idx : 0;
}
