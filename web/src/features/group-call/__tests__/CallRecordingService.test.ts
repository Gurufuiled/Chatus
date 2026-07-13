import { describe, expect, it, vi } from 'vitest';
import {
  buildCallRecordingFilename,
  isCallRecordingSupported,
  pickRecordingMimeType,
} from '../CallRecordingService';
import {
  isWebmMime,
  makeRecordingSeekable,
  recordingExtensionForMime,
} from '../makeRecordingSeekable';

vi.mock('fix-webm-duration', () => ({
  default: vi.fn(async (blob: Blob, _duration: number) => {
    // Simulate a fixed WebM with preserved type.
    return new Blob([blob, new Uint8Array([0x00])], { type: blob.type || 'video/webm' });
  }),
}));

describe('CallRecordingService helpers', () => {
  it('builds Telemost-style filename with webm extension by default', () => {
    const date = new Date(2026, 6, 13, 15, 4); // Jul 13, 2026 15:04 local
    expect(buildCallRecordingFilename(date)).toBe('Запись звонка 2026-07-13 15-04.webm');
  });

  it('builds filename with mp4 extension when requested', () => {
    const date = new Date(2026, 6, 13, 15, 4);
    expect(buildCallRecordingFilename(date, 'mp4')).toBe('Запись звонка 2026-07-13 15-04.mp4');
  });

  it('reports MediaRecorder support without throwing', () => {
    expect(typeof isCallRecordingSupported()).toBe('boolean');
    const mime = pickRecordingMimeType();
    expect(
      mime === undefined || mime.startsWith('video/webm') || mime.startsWith('video/mp4'),
    ).toBe(true);
  });
});

describe('makeRecordingSeekable', () => {
  it('maps mime types to file extensions', () => {
    expect(recordingExtensionForMime('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(recordingExtensionForMime('video/mp4')).toBe('mp4');
    expect(isWebmMime('video/webm')).toBe(true);
    expect(isWebmMime('video/mp4')).toBe(false);
  });

  it('passes through empty blobs and non-webm containers', async () => {
    const empty = new Blob([], { type: 'video/webm' });
    expect(await makeRecordingSeekable(empty, 1000)).toBe(empty);

    const mp4 = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
    expect(await makeRecordingSeekable(mp4, 1000)).toBe(mp4);
  });

  it('invokes webm duration fixer for webm blobs with positive duration', async () => {
    const { default: fixWebmDuration } = await import('fix-webm-duration');
    const input = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm;codecs=vp8,opus' });
    const fixed = await makeRecordingSeekable(input, 2500);
    expect(fixWebmDuration).toHaveBeenCalled();
    expect(fixed.size).toBeGreaterThan(input.size);
    expect(fixed.type).toContain('webm');
  });

  it('skips fixer when duration is invalid', async () => {
    const { default: fixWebmDuration } = await import('fix-webm-duration');
    vi.mocked(fixWebmDuration).mockClear();
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' });
    const out = await makeRecordingSeekable(input, 0);
    expect(out).toBe(input);
    expect(fixWebmDuration).not.toHaveBeenCalled();
  });
});
