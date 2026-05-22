import assert from 'node:assert/strict';
import { collapseTelegramAlbumRows } from './telegramAlbumRows';
import type { TelegramMessageRow } from './types';

function row(
  messageId: number,
  kind: TelegramMessageRow['kind'],
  mediaAlbumId?: number,
): TelegramMessageRow {
  return {
    id: String(messageId),
    messageId,
    kind,
    text: kind === 'image' && messageId === 102 ? 'caption' : '',
    outgoing: true,
    dateMs: messageId * 1000,
    status: 'sent',
    mediaAlbumId,
    mediaUri: kind === 'image' || kind === 'video' ? `file:///m${messageId}.jpg` : undefined,
  };
}

const twoPhotos = collapseTelegramAlbumRows([
  row(102, 'image', 55),
  row(101, 'image', 55),
]);

assert.equal(twoPhotos.length, 1);
assert.equal(twoPhotos[0]?.kind, 'album');
assert.equal(twoPhotos[0]?.albumMedia?.length, 2);
assert.equal(twoPhotos[0]?.text, 'caption');
assert.equal(twoPhotos[0]?.albumMessageIds?.join(','), '101,102');

const singleWithAlbumId = collapseTelegramAlbumRows([row(10, 'image', 7)]);
assert.equal(singleWithAlbumId.length, 1);
assert.equal(singleWithAlbumId[0]?.kind, 'image');

const duplicateAlbum = collapseTelegramAlbumRows([
  {
    id: 'album-55',
    messageId: 102,
    kind: 'album',
    text: '',
    outgoing: true,
    dateMs: 102000,
    status: 'sent',
    mediaAlbumId: 55,
    albumMedia: [
      { messageId: 101, kind: 'image', mediaUri: 'file:///a.jpg' },
      { messageId: 102, kind: 'image', mediaUri: 'file:///b.jpg' },
    ],
    albumMessageIds: [101, 102],
  },
  row(102, 'image', 55),
  row(101, 'image', 55),
]);
assert.equal(duplicateAlbum.length, 1);
assert.equal(duplicateAlbum[0]?.kind, 'album');

console.log('telegramAlbumRows.test.ts: ok');
