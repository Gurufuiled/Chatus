import { describe, expect, it } from 'vitest';
import {
  isStageableAlbumMedia,
  isStageableImage,
  mapPool,
} from '@/queries/media.queries';

describe('media.queries helpers', () => {
  it('detects stageable images', () => {
    expect(isStageableImage(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isStageableImage(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(false);
  });

  it('detects album-capable image and video files', () => {
    expect(isStageableAlbumMedia(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isStageableAlbumMedia(new File(['x'], 'a.mp4', { type: 'video/mp4' }))).toBe(true);
    expect(isStageableAlbumMedia(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(
      false,
    );
  });

  it('mapPool preserves order with bounded concurrency', async () => {
    const active = { count: 0, max: 0 };
    const results = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      active.count += 1;
      active.max = Math.max(active.max, active.count);
      await new Promise((r) => setTimeout(r, 5));
      active.count -= 1;
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(active.max).toBeLessThanOrEqual(2);
  });
});
