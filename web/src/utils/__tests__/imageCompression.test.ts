import { describe, expect, it, vi, beforeEach } from 'vitest';
import { compressImageForQuickSend } from '@/utils/imageCompression';

function mockImageLoad(width: number, height: number) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  const OriginalImage = globalThis.Image;
  class MockImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  // @ts-expect-error test mock
  globalThis.Image = MockImage;

  return () => {
    globalThis.Image = OriginalImage;
  };
}

function mockCanvas(blob: Blob) {
  const originalCreateElement = document.createElement.bind(document);
  const toBlob = vi.fn((cb: BlobCallback, _type?: string, _quality?: number) => {
    cb(blob);
  });
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob,
      } as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tag);
  });
}

describe('compressImageForQuickSend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns non-image files unchanged', async () => {
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    await expect(compressImageForQuickSend(file)).resolves.toBe(file);
  });

  it('returns gif and svg unchanged', async () => {
    const gif = new File(['gif'], 'anim.gif', { type: 'image/gif' });
    const svg = new File(['svg'], 'icon.svg', { type: 'image/svg+xml' });
    await expect(compressImageForQuickSend(gif)).resolves.toBe(gif);
    await expect(compressImageForQuickSend(svg)).resolves.toBe(svg);
  });

  it('returns small images without recompression', async () => {
    const restore = mockImageLoad(800, 600);
    const file = new File(['x'.repeat(1000)], 'small.jpg', { type: 'image/jpeg' });
    const result = await compressImageForQuickSend(file);
    expect(result).toBe(file);
    restore();
  });

  it('compresses oversized images to jpeg', async () => {
    const restore = mockImageLoad(4000, 3000);
    const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });
    mockCanvas(compressedBlob);

    const file = new File(['x'.repeat(2_000_000)], 'big.png', { type: 'image/png' });
    const result = await compressImageForQuickSend(file);

    expect(result).not.toBe(file);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('big.jpg');
    restore();
  });

  it('falls back to original file when canvas fails', async () => {
    const restore = mockImageLoad(4000, 3000);
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => null,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    const file = new File(['x'.repeat(2_000_000)], 'big.jpg', { type: 'image/jpeg' });
    await expect(compressImageForQuickSend(file)).resolves.toBe(file);
    restore();
  });
});
