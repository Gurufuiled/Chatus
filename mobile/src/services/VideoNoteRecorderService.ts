/**
 * VideoNoteRecorderService - Records video notes using expo-camera CameraView.
 * Outputs MP4 format with first-frame thumbnail.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { getThumbnailAsync } from 'expo-video-thumbnails';

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
export const MAX_VIDEO_NOTE_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_DURATION_MS = MAX_DURATION_SECONDS * 1000;

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

    this.startTimeMs = Date.now();
    this.recordPromise = ref.recordAsync({
      maxDuration: MAX_DURATION_SECONDS,
      maxFileSize: MAX_VIDEO_NOTE_FILE_SIZE_BYTES,
    });
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
    this.recordPromise = null;

    const result = await promise;
    const durationMs = Math.min(
      Math.max(Math.round(stopRequestedAtMs - this.startTimeMs), 0),
      MAX_DURATION_MS
    );

    if (!result?.uri) {
      throw new Error('Recording produced no file URI');
    }

    let thumbnailUri = '';
    try {
      const thumb = await getThumbnailAsync(result.uri, { time: 0 });
      thumbnailUri = thumb?.uri ?? '';
    } catch {
      // Thumbnail failed; return video with empty thumbnail; caller can handle
    }

    return {
      uri: result.uri,
      durationMs,
      thumbnailUri,
    };
  }

  /**
   * Отменить запись и выбросить результат — без ожидания.
   *
   * Раньше отмена шла через `stopRecording()`: ждала, пока камера допишет и закроет файл, и ещё строила превью
   * (`getThumbnailAsync`), хотя результат никому не нужен — отсюда долгий спиннер при отмене. Теперь сигнал остановки
   * отправляется сразу, метод возвращается мгновенно, а недописанный файл удаляется в фоне, когда камера его закроет.
   */
  cancelRecording(): void {
    const ref = this.cameraRef;
    const promise = this.recordPromise;
    this.recordPromise = null;
    if (!promise) return;

    try {
      ref?.stopRecording();
    } catch {
      // камера уже останавливается или размонтирована
    }

    void promise.then(
      async (result) => {
        if (result?.uri) {
          await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
        }
      },
      () => undefined,
    );
  }

  /** Check if currently recording. */
  isRecording(): boolean {
    return this.recordPromise != null;
  }
}

export const VideoNoteRecorderService = new VideoNoteRecorderServiceClass();
