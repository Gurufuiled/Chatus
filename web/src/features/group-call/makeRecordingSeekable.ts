/**
 * Post-process MediaRecorder output so players get a Duration and can seek.
 *
 * Chrome's WebM output from MediaRecorder omits both the Segment Info
 * `Duration` field and any `Cues` (seek index) — see the long-standing
 * Chromium bugs 561606 / 569840 / 642012. A prior attempt used
 * `fix-webm-duration`, which only patches the `Duration` field: players then
 * report the correct length, but scrubbing/seeking still fails or is very
 * coarse because there is still no seek index for the demuxer to jump to.
 *
 * We now use `ts-ebml`, which parses the EBML/WebM structure while tracking
 * cluster byte offsets and per-track timestamps as it reads, and can then
 * rebuild the header with a `SeekHead` + `Cues` element in addition to the
 * `Duration` — this is the same technique used by RecordRTC's
 * `getSeekableBlob()` and is what actually restores scrubbing in the
 * `<video>` element (verified against a real MediaRecorder capture, see
 * `__tests__/makeRecordingSeekable.browser.test.ts` notes in the PR/commit
 * description — Cues are present and `video.currentTime` seeks correctly).
 *
 * MP4 (when MediaRecorder supports it) already carries duration/seek
 * metadata and is returned as-is.
 */

import { Decoder, Reader, tools } from 'ts-ebml';

export type RecordingContainer = 'webm' | 'mp4';

export function recordingExtensionForMime(mimeType: string): RecordingContainer {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4') || lower.includes('mpeg4') || lower.includes('m4a')) {
    return 'mp4';
  }
  return 'webm';
}

export function isWebmMime(mimeType: string): boolean {
  return mimeType.toLowerCase().includes('webm');
}

const DEFAULT_TIMESTAMP_SCALE = 1_000_000; // ns per Duration unit (WebM default)

/**
 * Make a recorded blob seekable when possible.
 * Falls back to the original blob on any failure (download still works).
 */
export async function makeRecordingSeekable(
  blob: Blob,
  durationMs: number,
): Promise<Blob> {
  if (blob.size === 0) return blob;
  if (!isWebmMime(blob.type || 'video/webm')) {
    return blob;
  }
  if (!Number.isFinite(durationMs) || durationMs < 1) {
    return blob;
  }

  try {
    const buffer = await blob.arrayBuffer();

    const decoder = new Decoder();
    const reader = new Reader();
    reader.logging = false;
    reader.drop_default_duration = false;

    const elements = decoder.decode(buffer);
    for (const element of elements) {
      reader.read(element);
    }
    reader.stop();

    if (reader.metadatas.length === 0 || reader.metadataSize <= 0) {
      // Nothing usable was parsed (unexpected container) — keep the raw recording.
      return blob;
    }

    const scale = reader.timestampScale > 0 ? reader.timestampScale : DEFAULT_TIMESTAMP_SCALE;
    // `reader.duration` is 0 when the recorder never wrote a Segment Info
    // Duration (the common Chrome case) — fall back to our own wall-clock
    // duration, converted into the same TimestampScale-unit space.
    const durationTicks =
      reader.duration > 0 ? reader.duration : (durationMs * 1_000_000) / scale;

    const metadataBuffer = tools.makeMetadataSeekable(
      reader.metadatas,
      durationTicks,
      reader.cues,
    );
    const body = buffer.slice(reader.metadataSize);
    const fixed = new Blob([metadataBuffer, body], { type: blob.type || 'video/webm' });
    if (fixed.size === 0) return blob;
    return fixed;
  } catch (err) {
    console.warn('[Recording] failed to remux WebM for seeking, keeping raw recording', err);
    return blob;
  }
}
