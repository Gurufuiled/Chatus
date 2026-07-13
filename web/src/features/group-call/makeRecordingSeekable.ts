/**
 * Post-process MediaRecorder output so players get a Duration and can seek.
 * WebM from Chrome lacks duration/Cues; we inject Duration via fix-webm-duration.
 * MP4 (when MediaRecorder supports it) is already typically seekable — returned as-is.
 */

import fixWebmDuration from 'fix-webm-duration';

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
    const fixed = await fixWebmDuration(blob, durationMs, { logger: false });
    if (!(fixed instanceof Blob) || fixed.size === 0) {
      return blob;
    }
    // Preserve codec mime from the recorder when the fixer returns a bare type.
    const type = fixed.type && fixed.type !== 'application/octet-stream' ? fixed.type : blob.type;
    return type === fixed.type ? fixed : new Blob([fixed], { type });
  } catch {
    return blob;
  }
}
