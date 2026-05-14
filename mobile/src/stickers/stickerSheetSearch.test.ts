import assert from 'node:assert/strict';
import { filterStickerSheetItems, stickerItemMatchesQuery } from './stickerSheetSearch';

const item = { packId: 'friend', stickerId: '1f642-200d-2195-fe0f' };

assert.equal(stickerItemMatchesQuery(item, ''), true);
assert.equal(stickerItemMatchesQuery(item, '   '), true);
assert.equal(stickerItemMatchesQuery(item, '1f642'), true);
assert.equal(stickerItemMatchesQuery(item, '2195'), true);
assert.equal(stickerItemMatchesQuery(item, '1f642200d2195fe0f'), true);
assert.equal(stickerItemMatchesQuery(item, 'friend:1f642'), true);
assert.equal(stickerItemMatchesQuery(item, 'zzz'), false);

const mixed = [
  { packId: 'friend', stickerId: '1f600' },
  { packId: 'friend', stickerId: '2764-fe0f' },
];
assert.deepEqual(
  filterStickerSheetItems(mixed, '2764'),
  [{ packId: 'friend', stickerId: '2764-fe0f' }],
);

console.log('stickerSheetSearch.test.ts OK');
