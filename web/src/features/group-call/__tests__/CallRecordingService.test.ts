import { describe, expect, it, vi } from 'vitest';
import {
  buildCallRecordingFilename,
  isCallRecordingSupported,
  pickRecordingMimeType,
} from '../CallRecordingService';
import { finalizeRecordingBlob } from '../finalizeRecordingBlob';
import {
  isWebmMime,
  makeRecordingSeekable,
  recordingExtensionForMime,
} from '../makeRecordingSeekable';

const makeMetadataSeekable = vi.fn(
  (_metadatas: unknown, _duration: number, _cues: unknown) =>
    new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]).buffer,
);

vi.mock('../loadTsEbml', () => {
  class FakeDecoder {
    decode(_buffer: ArrayBuffer) {
      return [{ id: 0x1a45dfa3, name: 'EBML' }];
    }
  }
  class FakeReader {
    logging = false;
    drop_default_duration = true;
    metadatas: unknown[] = [{ id: 0x1a45dfa3, name: 'EBML' }];
    metadataSize = 4;
    timestampScale = 1_000_000;
    duration = 0;
    cues: Array<{ CueTrack: number; CueClusterPosition: number; CueTime: number }> = [];
    read(_elm: unknown) {
      // no-op for the mock
    }
    stop() {
      // no-op for the mock
    }
  }
  return {
    loadTsEbml: async () => ({
      Decoder: FakeDecoder,
      Reader: FakeReader,
      tools: {
        makeMetadataSeekable,
        readVint: () => ({ length: 4, value: 1 }),
      },
    }),
  };
});

vi.mock('../convertRecordingToMp4', () => ({
  convertRecordingToMp4: vi.fn(async () => null),
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

  it('remuxes webm blobs with positive duration via ts-ebml (adds Cues/SeekHead)', async () => {
    makeMetadataSeekable.mockClear();
    const input = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm;codecs=vp8,opus' });
    const fixed = await makeRecordingSeekable(input, 2500);
    expect(makeMetadataSeekable).toHaveBeenCalled();
    expect(fixed.type).toContain('webm');
    // Fixed metadata (4 bytes) + body after the fake metadataSize (0 bytes left) = 4 bytes.
    expect(fixed.size).toBe(4);
  });

  it('skips remux when duration is invalid', async () => {
    makeMetadataSeekable.mockClear();
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' });
    const out = await makeRecordingSeekable(input, 0);
    expect(out).toBe(input);
    expect(makeMetadataSeekable).not.toHaveBeenCalled();
  });

  it('writes Duration in TimestampScale ticks (ms when scale is 1e6), not nanoseconds', async () => {
    makeMetadataSeekable.mockClear();
    const input = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm' });
    await makeRecordingSeekable(input, 2500);
    expect(makeMetadataSeekable).toHaveBeenCalled();
    const durationTicks = makeMetadataSeekable.mock.calls[0]?.[1];
    // 2500ms with scale 1e6 → 2500 ticks (NOT 2.5e12 ns)
    expect(durationTicks).toBe(2500);
  });
});

describe('finalizeRecordingBlob', () => {
  it('falls back to seekable webm when MP4 conversion returns null', async () => {
    makeMetadataSeekable.mockClear();
    const input = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm;codecs=vp8,opus' });
    const result = await finalizeRecordingBlob(input, 2500);
    expect(result.container).toBe('webm');
    expect(result.blob.type).toContain('webm');
    expect(makeMetadataSeekable).toHaveBeenCalled();
  });

  it('returns mp4 when conversion succeeds', async () => {
    const { convertRecordingToMp4 } = await import('../convertRecordingToMp4');
    vi.mocked(convertRecordingToMp4).mockResolvedValueOnce(
      new Blob([new Uint8Array([9, 9, 9])], { type: 'video/mp4' }),
    );
    const input = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm' });
    const result = await finalizeRecordingBlob(input, 1000);
    expect(result.container).toBe('mp4');
    expect(result.blob.type).toBe('video/mp4');
  });
});
