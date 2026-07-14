/**
 * Post-process MediaRecorder output so players get a Duration and can seek.
 *
 * Chrome's WebM from MediaRecorder omits Segment Info `Duration` and `Cues`.
 * Short clips sometimes scrub anyway (player scans clusters); longer recordings
 * (e.g. with screen share) do not — the progress bar sticks at 0 and seeking
 * fails until we rebuild SeekHead + Cues + Duration via `ts-ebml`.
 *
 * `ts-ebml` is loaded only through `loadTsEbml()` (Buffer + CJS ebml shims).
 * A static import crashes the Vite embed bundle at startup.
 *
 * MP4 (when MediaRecorder supports it) already has seek metadata and is
 * returned as-is.
 */

import { loadTsEbml } from './loadTsEbml';

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
    const { Decoder, Reader, tools } = await loadTsEbml();
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
      console.warn('[Recording] WebM remux skipped: no metadata parsed');
      return blob;
    }

    const scale = reader.timestampScale > 0 ? reader.timestampScale : DEFAULT_TIMESTAMP_SCALE;
    // Prefer duration derived from clusters; fall back to wall-clock when the
    // recorder never wrote Segment Info Duration (typical Chrome MediaRecorder).
    const durationTicks =
      reader.duration > 0 ? reader.duration : (durationMs * 1_000_000) / scale;

    if (!(durationTicks > 0)) {
      console.warn('[Recording] WebM remux skipped: duration is zero');
      return blob;
    }

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
