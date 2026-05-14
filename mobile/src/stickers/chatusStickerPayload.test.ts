import assert from 'node:assert/strict';
import {
  encodeStickerPayload,
  isChatusStickerMessage,
  resolveChatusStickerSoloSendFlag,
  tryDecodeStickerPayload,
} from './chatusStickerPayload';

const ref = { packId: 'friend', stickerId: 'wave' };
const payload = encodeStickerPayload(ref);

assert.deepEqual(tryDecodeStickerPayload(payload), ref);

assert.equal(tryDecodeStickerPayload(''), null);
assert.equal(tryDecodeStickerPayload('   '), null);
assert.equal(tryDecodeStickerPayload('hello'), null);
assert.equal(tryDecodeStickerPayload('{"t":"x"}'), null);
assert.equal(tryDecodeStickerPayload('{"t":"cs","p":"a"}'), null);
assert.equal(tryDecodeStickerPayload('{"t":"cs","p":1,"i":"x"}'), null);

const unknownPack = encodeStickerPayload({ packId: 'other', stickerId: 'x' });
assert.deepEqual(tryDecodeStickerPayload(unknownPack), { packId: 'other', stickerId: 'x' });
assert.equal(isChatusStickerMessage(unknownPack), true, 'valid cs payload counts as sticker even without asset');

assert.equal(isChatusStickerMessage('{"t":"cs","p":"p","i":"i"}'), true);
assert.equal(isChatusStickerMessage('not json'), false);

assert.equal(resolveChatusStickerSoloSendFlag(payload, { chatusStickerSoloSend: true }), true);
assert.equal(resolveChatusStickerSoloSendFlag(payload, { chatusStickerSoloSend: false }), false);
assert.equal(resolveChatusStickerSoloSendFlag(payload, undefined), false);
assert.equal(resolveChatusStickerSoloSendFlag('hello', { chatusStickerSoloSend: true }), false);

assert.equal(tryDecodeStickerPayload('{'), null);
