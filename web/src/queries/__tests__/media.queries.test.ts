import { describe, expect, it } from 'vitest';
import { isStageableAlbumMedia, isStageableImage } from '@/queries/media.queries';

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
});
