/**
 * Browser verification helper for recording finalize:
 * canvas MediaRecorder → finalizeRecordingBlob → HTMLVideoElement.duration / seek.
 *
 * Run via Playwright page.evaluate after importing the built module, or:
 *   npx vitest run src/features/group-call/__tests__/finalizeRecording.browser.test.ts
 * when a browser vitest project exists.
 *
 * This Node-safe unit checks the Duration tick math and finalize fallback wiring.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeRecordingSeekable } from '../makeRecordingSeekable';

const makeMetadataSeekable = vi.fn(
  (_metadatas: unknown, duration: number) => {
    // Echo duration into a tiny buffer so callers can assert ticks.
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, duration, true);
    return view.buffer;
  },
);

vi.mock('../loadTsEbml', () => {
  class FakeDecoder {
    decode() {
      return [{}];
    }
  }
  class FakeReader {
    logging = false;
    drop_default_duration = true;
    metadatas = [{}];
    metadataSize = 4;
    timestampScale = 1_000_000;
    duration = 99_999; // inflated cluster duration must be ignored when wall-clock is set
    cues = [];
    read() {}
    stop() {}
  }
  return {
    loadTsEbml: async () => ({
      Decoder: FakeDecoder,
      Reader: FakeReader,
      tools: { makeMetadataSeekable },
    }),
  };
});

describe('recording duration ticks', () => {
  it('uses wall-clock ms as Duration ticks at default TimestampScale (not ns, not cluster inflate)', async () => {
    makeMetadataSeekable.mockClear();
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'video/webm' });
    await makeRecordingSeekable(blob, 40_000);
    expect(makeMetadataSeekable).toHaveBeenCalled();
    const ticks = makeMetadataSeekable.mock.calls[0]?.[1] as number;
    expect(ticks).toBe(40_000);
    // Cosmic Movies & TV times come from writing ~4e10 (ns) here instead of 4e4.
    expect(ticks).toBeLessThan(1_000_000);
  });
});
