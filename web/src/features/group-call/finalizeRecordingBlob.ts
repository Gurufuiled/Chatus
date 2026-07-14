/**
 * Finalize a call recording for download.
 *
 * Preferred output: progressive MP4 (Movies & TV seek + trim).
 * Fallback: seekable WebM via ts-ebml (Chrome/VLC).
 *
 * Never return unre-encoded MediaRecorder MP4 — it is often fragmented / wrong
 * timescale and breaks Movies & TV (the failure mode this path exists to avoid).
 */

import { convertRecordingToMp4 } from './convertRecordingToMp4';
import {
  isWebmMime,
  makeRecordingSeekable,
  recordingExtensionForMime,
} from './makeRecordingSeekable';

export type FinalizedRecording = {
  blob: Blob;
  container: 'mp4' | 'webm';
};

/**
 * Remux WebM for seeking, then convert to progressive MP4 when possible.
 */
export async function finalizeRecordingBlob(
  blob: Blob,
  durationMs: number,
): Promise<FinalizedRecording> {
  if (blob.size === 0) {
    return { blob, container: recordingExtensionForMime(blob.type || 'video/webm') };
  }

  const inputIsWebm = isWebmMime(blob.type || 'video/webm');
  const seekableWebm = inputIsWebm ? await makeRecordingSeekable(blob, durationMs) : blob;
  const sourceForMp4 = seekableWebm.size > 0 ? seekableWebm : blob;

  const mp4 = await convertRecordingToMp4(sourceForMp4, durationMs);
  if (mp4 && mp4.size > 0) {
    return { blob: mp4, container: 'mp4' };
  }

  if (inputIsWebm) {
    return {
      blob: seekableWebm,
      container: 'webm',
    };
  }

  // Native MediaRecorder MP4 that we could not re-encode: do not ship it as the
  // success path (Movies & TV scrub/trim will fail). Keep the blob so the user
  // can still open it in VLC/Chrome, but label as mp4 only as a last resort.
  console.warn(
    '[Recording] could not re-encode MediaRecorder MP4 to progressive; Movies & TV may not seek',
  );
  return { blob, container: 'mp4' };
}
