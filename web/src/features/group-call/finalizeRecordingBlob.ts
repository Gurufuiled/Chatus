/**
 * Finalize a call recording for download.
 *
 * Preferred output: progressive MP4 (Movies & TV seek + trim).
 * Fallback: seekable WebM via ts-ebml (Chrome/VLC).
 */

import { convertRecordingToMp4 } from './convertRecordingToMp4';
import { makeRecordingSeekable, recordingExtensionForMime } from './makeRecordingSeekable';

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

  // Native MediaRecorder MP4 is often fragmented / wrong-timescale for Movies & TV.
  // Prefer re-encoding through mediabunny into a progressive file. If that fails,
  // keep the original (still better than nothing).
  const seekableWebm = await makeRecordingSeekable(blob, durationMs);
  const sourceForMp4 = seekableWebm.size > 0 ? seekableWebm : blob;

  const mp4 = await convertRecordingToMp4(sourceForMp4);
  if (mp4 && mp4.size > 0) {
    return { blob: mp4, container: 'mp4' };
  }

  // Already an MP4 we could not re-encode — return as-is.
  if (recordingExtensionForMime(blob.type || '') === 'mp4') {
    return { blob, container: 'mp4' };
  }

  return {
    blob: seekableWebm,
    container: 'webm',
  };
}
