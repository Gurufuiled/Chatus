/**
 * Post-process MediaRecorder WebM so players get Duration + Cues.
 *
 * Chrome's WebM omits Segment Info `Duration` and `Cues`. We rebuild SeekHead +
 * Cues + Duration via `ts-ebml` (loaded only through `loadTsEbml()` — a static
 * import crashes the Vite embed at startup).
 *
 * Prefer `finalizeRecordingBlob` for downloads: it converts to progressive MP4
 * for Windows Movies & TV. This remux remains the WebM fallback path.
 *
 * Duration units: WebM Duration is in TimestampScale ticks. Default scale is
 * 1_000_000 ns, so ticks ≈ milliseconds. We never write wall-clock nanoseconds
 * into Duration (that produces the absurd multi-hour trim times in Movies & TV).
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
    // Chrome writes a bad DefaultDuration (crbug 606000); keep ts-ebml's default drop.
    reader.drop_default_duration = true;

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
    // Duration must be TimestampScale ticks (≈ ms when scale is 1e6), never raw ns.
    // Prefer measured wall-clock — cluster-derived duration can be inflated.
    const fromWallClock = (durationMs * 1_000_000) / scale;
    const fromClusters = reader.duration > 0 ? reader.duration : 0;
    const durationTicks = fromWallClock > 0 ? fromWallClock : fromClusters;

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
