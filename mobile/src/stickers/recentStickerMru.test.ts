import assert from 'node:assert/strict';
import {
  dedupeStickerRefsPreserveOrder,
  MAX_RECENT_STICKERS,
  mergeMruStickerRefs,
} from './recentStickerMru';

const a = { packId: 'friend', stickerId: '1f600' };
const b = { packId: 'friend', stickerId: '2764-fe0f' };
const c = { packId: 'friend', stickerId: '1f602' };

assert.deepEqual(mergeMruStickerRefs([], a), [a]);
assert.deepEqual(mergeMruStickerRefs([a], a), [a], 'pick already first');
assert.deepEqual(mergeMruStickerRefs([a, b], a), [a, b]);
assert.deepEqual(mergeMruStickerRefs([b, a], a), [a, b], 'pick moves to front');

const long = Array.from({ length: 30 }, (_, i) => ({ packId: 'friend', stickerId: `id${i}` }));
const merged = mergeMruStickerRefs(long, { packId: 'friend', stickerId: 'new' });
assert.equal(merged.length, MAX_RECENT_STICKERS);
assert.equal(merged[0]?.stickerId, 'new');

assert.deepEqual(
  dedupeStickerRefsPreserveOrder([a, b, a, c, b]),
  [a, b, c],
  'dedupe keeps first occurrence order',
);

assert.deepEqual(dedupeStickerRefsPreserveOrder([]), []);

console.log('recentStickerMru.test.ts OK');
