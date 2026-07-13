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

const readCalls: unknown[] = [];

vi.mock('ts-ebml', () => {
  class FakeDecoder {
    decode(_buffer: ArrayBuffer) {
      // A single fake "element" is enough to drive the Reader mock below.
      return [{ id: 0x1a45dfa3, name: 'EBML' }];
    }
  }
  class FakeReader {
    logging = false;
    drop_default_duration = false;
    metadatas: unknown[] = [{ id: 0x1a45dfa3, name: 'EBML' }];
    metadataSize = 4;
    timestampScale = 1_000_000;
    duration = 0;
    cues: Array<{ CueTrack: number; CueClusterPosition: number; CueTime: number }> = [];
    read(elm: unknown) {
      readCalls.push(elm);
    }
    stop() {
      // no-op for the mock
    }
  }
  return {
    Decoder: FakeDecoder,
    Reader: FakeReader,
    tools: {
      makeMetadataSeekable: vi.fn(
        (_metadatas: unknown, _duration: number, _cues: unknown) =>
          new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]).buffer,
      ),
    },
  };
});

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
    const { tools } = await import('ts-ebml');
    const input = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm;codecs=vp8,opus' });
    const fixed = await makeRecordingSeekable(input, 2500);
    expect(tools.makeMetadataSeekable).toHaveBeenCalled();
    expect(fixed.type).toContain('webm');
    // Fixed metadata (4 bytes) + body after the fake metadataSize (0 bytes left) = 4 bytes.
    expect(fixed.size).toBe(4);
  });

  it('skips remux when duration is invalid', async () => {
    const { tools } = await import('ts-ebml');
    vi.mocked(tools.makeMetadataSeekable).mockClear();
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' });
    const out = await makeRecordingSeekable(input, 0);
    expect(out).toBe(input);
    expect(tools.makeMetadataSeekable).not.toHaveBeenCalled();
  });
});
