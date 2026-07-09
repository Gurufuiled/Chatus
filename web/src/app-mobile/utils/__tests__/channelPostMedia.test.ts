import { describe, expect, it } from 'vitest';
import { computeChannelMediaDisplaySize } from '../channelPostMedia';

describe('computeChannelMediaDisplaySize', () => {
  it('clamps portrait photos to channel max height', () => {
    const size = computeChannelMediaDisplaySize(1080, 1920, 390, 844);
    expect(size.width).toBeLessThanOrEqual(320);
    expect(size.height).toBeLessThanOrEqual(380);
    expect(size.height).toBeGreaterThan(size.width);
  });

  it('returns square fallback when dimensions are missing', () => {
    const size = computeChannelMediaDisplaySize(null, null, 390, 844);
    expect(size.width).toBe(size.height);
    expect(size.width).toBeLessThanOrEqual(240);
  });
});
