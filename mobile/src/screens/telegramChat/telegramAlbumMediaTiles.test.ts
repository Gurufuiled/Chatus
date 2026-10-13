import assert from 'node:assert/strict';
import {
  buildTelegramAlbumViewerTiles,
  findTelegramAlbumViewerIndex,
} from './telegramAlbumMediaTiles';

const items = [
  { messageId: 11, kind: 'image' as const, mediaUri: 'file:///a.jpg', width: 800, height: 600 },
  {
    messageId: 12,
    kind: 'video' as const,
    mediaUri: 'file:///v.mp4',
    thumbnailUri: 'file:///t.jpg',
    durationMs: 4000,
    width: 640,
    height: 360,
  },
  { messageId: 13, kind: 'image' as const, mediaUri: '  ' }, // без файла — пропускается
  { messageId: 14, kind: 'image' as const, mediaUri: 'file:///d.jpg' }, // размер неизвестен
];

const tiles = buildTelegramAlbumViewerTiles(items, '  Подпись  ');

// пропускаются плитки без файла
assert.equal(tiles.length, 3);
assert.deepEqual(
  tiles.map((t) => t.id),
  ['tg-11', 'tg-12', 'tg-14'],
  'id плиток = tg-<messageId>: по ним миниатюры в чате находят свой кадр',
);

// размер фото и видео передаётся, чтобы рамка при закрытии свайпом села без «подгонки»
assert.equal(tiles[0].width, 800);
assert.equal(tiles[0].height, 600);
assert.equal(tiles[1].width, 640);
assert.equal(tiles[1].height, 360);
assert.equal(tiles[2].width, undefined, 'размер неизвестен — не выдумываем');
assert.equal(tiles[2].height, undefined);

// видео: превью и длительность
assert.equal(tiles[1].kind, 'video');
assert.equal(tiles[1].previewUri, 'file:///t.jpg');
assert.equal(tiles[1].durationMs, 4000);

// подпись только у первой плитки и без пробелов по краям
assert.equal(tiles[0].caption, 'Подпись');
assert.equal(tiles[1].caption, undefined);

// пустая подпись не создаёт видимой подписи (вьювер проверяет длину после trim)
assert.ok(!buildTelegramAlbumViewerTiles(items, '   ')[0].caption);
assert.equal(buildTelegramAlbumViewerTiles([], 'x').length, 0);

// поиск стартового индекса по messageId
assert.equal(findTelegramAlbumViewerIndex(tiles, 12), 1);
assert.equal(findTelegramAlbumViewerIndex(tiles, 14), 2);
assert.equal(findTelegramAlbumViewerIndex(tiles, 999), 0, 'неизвестный id — первая плитка');

console.log('telegramAlbumMediaTiles.test.ts: ok');
