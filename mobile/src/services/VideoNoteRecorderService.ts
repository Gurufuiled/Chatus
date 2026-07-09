import { ensureLocalFileUri } from '../utils/ensureLocalFileUri';

export interface VideoNoteRecordingResult {
  uri: string;
  durationMs: number;
  thumbnailUri: string;
}

/** Camera ref with recordAsync/stopRecording (expo-camera CameraView instance). */
export interface VideoNoteCameraRef {
  recordAsync(options?: { maxDuration?: number; maxFileSize?: number }): Promise<{ uri: string } | undefined>;
  stopRecording(): void;
}

export const MAX_DURATION_SECONDS = 60;
const MAX_DURATION_MS = MAX_DURATION_SECONDS * 1000;
const RECORD_READY_DELAY_MS = 450;

class VideoNoteRecorderServiceClass {
  private cameraRef: VideoNoteCameraRef | null = null;
  private recordPromise: Promise<{ uri: string } | undefined> | null = null;
  private startTimeMs: number = 0;

  /** Set the CameraView ref. Call when the recorder component mounts. */
  setCameraRef(ref: VideoNoteCameraRef | null): void {
    this.cameraRef = ref;
  }

  /** Start recording. Call stopRecording() to finish and get result. */
  async startRecording(): Promise<void> {
    const ref = this.cameraRef;
    if (!ref) {
      throw new Error('Camera ref not set. Mount VideoNoteRecorder first.');
    }
    if (this.recordPromise) {
      throw new Error('Recording already in progress. Call stopRecording() first.');
    }

    await new Promise((resolve) => setTimeout(resolve, RECORD_READY_DELAY_MS));

    this.startTimeMs = Date.now();
    const promise = ref.recordAsync({
      maxDuration: MAX_DURATION_SECONDS,
    });

    if (!promise || typeof promise.then !== 'function') {
      throw new Error('Camera recording is not ready yet');
    }

    this.recordPromise = promise;
  }

  /** Stop recording and return { uri, durationMs, thumbnailUri }. */
  async stopRecording(): Promise<VideoNoteRecordingResult> {
    const ref = this.cameraRef;
    const promise = this.recordPromise;
    if (!ref || !promise) {
      throw new Error('No active recording. Call startRecording() first.');
    }

    const stopRequestedAtMs = Date.now();
    ref.stopRecording();

    let result: { uri: string } | undefined;
    try {
      result = await Promise.race([
        promise,
        new Promise<undefined>((_, reject) => {
          setTimeout(() => reject(new Error('Video note recording timed out while saving')), 20_000);
        }),
      ]);
    } finally {
      this.recordPromise = null;
    }

    const durationMs = Math.min(
      Math.max(Math.round(stopRequestedAtMs - this.startTimeMs), 0),
      MAX_DURATION_MS
    );

    if (!result?.uri) {
      throw new Error('Recording produced no file URI');
    }

    const stableUri = await ensureLocalFileUri(result.uri, 'video_note.mp4').catch(
      () => result.uri,
    );

    let thumbnailUri = '';
    try {
      const { getThumbnailAsync } = await import('expo-video-thumbnails');
      const thumb = await getThumbnailAsync(stableUri, { time: 0 });
      thumbnailUri = thumb?.uri ?? '';
    } catch {
      // Thumbnail failed; return video with empty thumbnail; caller can handle
    }

    return {
      uri: stableUri,
      durationMs,
      thumbnailUri,
    };
  }

  /** Check if currently recording. */
  isRecording(): boolean {
    return this.recordPromise != null;
  }
}

export const VideoNoteRecorderService = new VideoNoteRecorderServiceClass();
