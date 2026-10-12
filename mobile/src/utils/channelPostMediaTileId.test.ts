import assert from 'node:assert/strict';
import { channelPostMediaTileId } from './channelPostMediaTileId';

assert.equal(channelPostMediaTileId('post-42', 0), 'post-42-m0');
assert.equal(channelPostMediaTileId('post-42', 3), 'post-42-m3');
// разные посты и разные индексы не пересекаются
assert.notEqual(channelPostMediaTileId('a', 1), channelPostMediaTileId('b', 1));
assert.notEqual(channelPostMediaTileId('a', 1), channelPostMediaTileId('a', 2));
// формат совместим с прежним id плиток вьювера
assert.match(channelPostMediaTileId('x', 7), /^x-m7$/);

console.log('channelPostMediaTileId.test.ts: ok');
