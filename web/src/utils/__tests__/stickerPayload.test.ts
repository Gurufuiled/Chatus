import { describe, expect, it } from 'vitest';
import {
  encodeStickerPayload,
  isChatusStickerMessage,
  tryDecodeStickerPayload,
} from '@/utils/stickerPayload';

describe('stickerPayload', () => {
  it('encodes pack and sticker ids into compact JSON', () => {
    const encoded = encodeStickerPayload({ packId: 'animals', stickerId: 'cat-wave' });
    expect(encoded).toBe('{"t":"cs","p":"animals","i":"cat-wave"}');
  });

  it('decodes valid sticker payload', () => {
    const ref = tryDecodeStickerPayload('{"t":"cs","p":"default","i":"smile"}');
    expect(ref).toEqual({ packId: 'default', stickerId: 'smile' });
  });

  it('returns null for plain text and malformed JSON', () => {
    expect(tryDecodeStickerPayload('Привет')).toBeNull();
    expect(tryDecodeStickerPayload('{"t":"other"}')).toBeNull();
    expect(tryDecodeStickerPayload('{broken')).toBeNull();
    expect(tryDecodeStickerPayload(null)).toBeNull();
  });

  it('detects sticker messages', () => {
    expect(isChatusStickerMessage(encodeStickerPayload({ packId: 'p', stickerId: 's' }))).toBe(
      true,
    );
    expect(isChatusStickerMessage('обычный текст')).toBe(false);
  });
});
