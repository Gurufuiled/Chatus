/**
 * Local group-call recording (Variant A — Telemost-style «Записать на компьютер»).
 *
 * UX (wired in GroupCallOverlay):
 * - idle → requesting → recording → stopping → save_prompt → idle
 * - Toolbar: «Записать»; while recording — red indicator + elapsed timer; click soft-stops
 * - Soft stop opens «Сохранить запись?» (Save / Discard) — no confirm() before stop
 * - Filename: `Запись звонка YYYY-MM-DD HH-mm.webm` (or .mp4 when MediaRecorder supports it)
 * - After stop: WebM duration fix so players can seek; brief «Обработка записи…» if >~300ms
 * - Errors: Russian in-call banners (never alert())
 *
 * Capture (client-only MediaRecorder → download):
 * - Video: canvas composite of stage tiles + LiveKit camera/screen tracks (screen preferred;
 *   mid-call screen share is picked up dynamically)
 * - Audio: AudioContext mix of local mic + remote LiveKit microphone tracks present at start
 * - Avatar/name tiles drawn when a participant has no video
 */

import type { Room } from 'livekit-client';
import { Track } from 'livekit-client';
import {
  formatMicrophoneAccessError,
  isEmbeddedInIframe,
  notifyParentMicrophoneRequired,
} from '@/utils/microphoneAccess';
import {
  clearOffscreenVideos,
  drawStageToCanvas,
  type CanvasLayoutLock,
  type OffscreenVideoMap,
} from './callRecordingCanvas';
import {
  makeRecordingSeekable,
  recordingExtensionForMime,
} from './makeRecordingSeekable';

export type CallRecordingPhase =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'stopping'
  | 'save_prompt';

export type CallRecordingSnapshot = {
  phase: CallRecordingPhase;
  startedAt: number | null;
  error: string | null;
  warning: string | null;
  pendingBlob: Blob | null;
  pendingFilename: string | null;
};

export type CallRecordingListener = (snapshot: CallRecordingSnapshot) => void;

const TIMESLICE_MS = 1000;
const DRAW_FPS = 15;
const LONG_RECORDING_WARN_MS = 30 * 60 * 1000;
const PROCESSING_HINT_DELAY_MS = 300;

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function buildCallRecordingFilename(
  date = new Date(),
  ext: 'webm' | 'mp4' = 'webm',
): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `Запись звонка ${y}-${m}-${d} ${hh}-${mm}.${ext}`;
}

export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function isCallRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    Boolean(pickRecordingMimeType())
  );
}

export function formatCallRecordingAccessError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (isEmbeddedInIframe()) {
      return 'Нет доступа к микрофону для записи. Если запрос не появлялся — Loginus должен добавить allow="microphone" в iframe ChatUs';
    }
    return 'Доступ к микрофону для записи запрещён — разрешите в настройках браузера';
  }
  if (name === 'NotFoundError') {
    return 'Микрофон не найден — запись звука недоступна';
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return formatMicrophoneAccessError(err);
}

function collectLiveKitAudioTracks(room: Room): MediaStreamTrack[] {
  const tracks: MediaStreamTrack[] = [];
  const localMic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  if (localMic?.kind === Track.Kind.Audio && localMic.mediaStreamTrack) {
    tracks.push(localMic.mediaStreamTrack);
  }
  for (const participant of room.remoteParticipants.values()) {
    const micPub = participant.getTrackPublication(Track.Source.Microphone);
    const track = micPub?.track;
    if (track?.kind === Track.Kind.Audio && track.mediaStreamTrack) {
      tracks.push(track.mediaStreamTrack);
    }
  }
  return tracks;
}

type FileSystemWritableFileStreamLike = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandleLike = {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
};

async function saveBlobLocally(blob: Blob, filename: string): Promise<void> {
  const w = window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandleLike>;
  };

  const ext = recordingExtensionForMime(blob.type || filename);
  const accept =
    ext === 'mp4'
      ? ({ 'video/mp4': ['.mp4'] } as Record<string, string[]>)
      : ({ 'video/webm': ['.webm'] } as Record<string, string[]>);
  const description = ext === 'mp4' ? 'MP4 video' : 'WebM video';

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'AbortError') {
        throw new Error('Сохранение отменено');
      }
      // Fall through to anchor download
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    if (isEmbeddedInIframe()) {
      throw new Error(
        'Не удалось сохранить запись. Если скачивание не началось — Loginus должен разрешить downloads для iframe ChatUs (allow-downloads / отсутствие sandbox-блокировки)',
      );
    }
    throw new Error('Не удалось сохранить запись на устройство');
  }
}

function isPermissionDeniedError(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : '';
  return name === 'NotAllowedError' || name === 'PermissionDeniedError';
}

function waitForRecorderStop(recorder: MediaRecorder, timeoutMs: number): Promise<void> {
  if (recorder.state === 'inactive') return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    const previousOnStop = recorder.onstop;
    recorder.onstop = (event) => {
      try {
        if (typeof previousOnStop === 'function') {
          previousOnStop.call(recorder, event);
        }
      } finally {
        finish();
      }
    };
    try {
      recorder.requestData();
    } catch {
      // ignore
    }
    try {
      recorder.stop();
    } catch {
      finish();
    }
  });
}

export class CallRecordingService {
  private phase: CallRecordingPhase = 'idle';
  private startedAt: number | null = null;
  private error: string | null = null;
  private warning: string | null = null;
  private pendingBlob: Blob | null = null;
  private pendingFilename: string | null = null;
  private listeners = new Set<CallRecordingListener>();

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mixedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private drawTimer: number | null = null;
  private warnTimer: number | null = null;
  private sessionId = 0;
  private trackEndedCleanups: Array<() => void> = [];
  private stopPromise: Promise<void> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private finalizedSessionId: number | null = null;
  private room: Room | null = null;
  private offscreenVideos: OffscreenVideoMap = new Map();
  private canvasLayout: CanvasLayoutLock | null = null;
  private recordingMimeType: string | null = null;

  subscribe(listener: CallRecordingListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): CallRecordingSnapshot {
    return {
      phase: this.phase,
      startedAt: this.startedAt,
      error: this.error,
      warning: this.warning,
      pendingBlob: this.pendingBlob,
      pendingFilename: this.pendingFilename,
    };
  }

  isBusy(): boolean {
    return this.phase !== 'idle' && this.phase !== 'save_prompt';
  }

  hasPendingSave(): boolean {
    return this.phase === 'save_prompt' && Boolean(this.pendingBlob);
  }

  clearError(): void {
    if (!this.error && !this.warning) return;
    this.error = null;
    this.warning = null;
    this.emit();
  }

  /** Surface a UI error without starting a session (banners, not alert). */
  reportError(message: string): void {
    if (this.phase !== 'idle' && this.phase !== 'save_prompt') return;
    this.error = message;
    this.emit();
  }

  async start(room: Room): Promise<void> {
    if (this.phase !== 'idle' && this.phase !== 'save_prompt') {
      return;
    }
    if (this.phase === 'save_prompt') {
      this.discardPending();
    }
    if (!isCallRecordingSupported()) {
      this.setError('Запись звонка не поддерживается в этом браузере');
      return;
    }

    const mimeType = pickRecordingMimeType();
    if (!mimeType) {
      this.setError('Запись звонка не поддерживается в этом браузере');
      return;
    }

    this.sessionId += 1;
    const session = this.sessionId;
    this.error = null;
    this.warning = null;
    this.pendingBlob = null;
    this.pendingFilename = null;
    this.finalizedSessionId = null;
    this.room = room;
    this.canvasLayout = null;
    this.recordingMimeType = mimeType;
    this.setPhase('requesting');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Не удалось создать холст для записи');
      }
      this.canvas = canvas;

      const firstDraw = drawStageToCanvas(canvas, ctx, room, this.offscreenVideos, null);
      this.canvasLayout = { ...firstDraw.layout, locked: true };
      const videoStream = canvas.captureStream(DRAW_FPS);
      const videoTrack = videoStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('Не удалось захватить видео для записи');
      }

      const audioDestination = await this.buildAudioMix(room);
      const tracks: MediaStreamTrack[] = [videoTrack];
      for (const track of audioDestination.getAudioTracks()) {
        tracks.push(track);
      }
      this.mixedStream = new MediaStream(tracks);

      this.chunks = [];
      const recorder = new MediaRecorder(this.mixedStream, { mimeType });
      this.recorder = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (session !== this.sessionId) return;
        void this.salvageAfterRecorderError(session, 'Ошибка MediaRecorder во время записи');
      };

      this.bindTrackEnded(videoTrack, session);
      for (const track of this.mixedStream.getAudioTracks()) {
        this.bindTrackEnded(track, session);
      }

      recorder.start(TIMESLICE_MS);
      if (session !== this.sessionId) {
        recorder.stop();
        this.releaseCaptureResources();
        return;
      }

      this.startedAt = Date.now();
      this.setPhase('recording');
      this.startDrawLoop(canvas, ctx);
      this.bindVisibilityWatch(session);
      this.warnTimer = window.setTimeout(() => {
        if (session !== this.sessionId || this.phase !== 'recording') return;
        this.warning =
          'Запись уже идёт больше 30 минут — файл может получиться большим. Можно остановить и сохранить.';
        this.emit();
      }, LONG_RECORDING_WARN_MS);
    } catch (err) {
      this.releaseCaptureResources();
      if (isPermissionDeniedError(err)) {
        notifyParentMicrophoneRequired();
      }
      this.setPhase('idle');
      this.setError(formatCallRecordingAccessError(err));
    }
  }

  async stop(): Promise<void> {
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }
    if (this.phase !== 'recording') return;
    const session = this.sessionId;
    this.setPhase('stopping');
    this.clearDrawLoop();
    this.clearWarnTimer();
    this.unbindVisibilityWatch();

    this.stopPromise = this.runFinalize(session);
    await this.stopPromise;
  }

  /** Call when the group call ends: soft-stop and offer save if chunks exist. */
  async stopBecauseCallEnded(): Promise<void> {
    if (this.phase === 'requesting') {
      this.sessionId += 1;
      this.clearDrawLoop();
      this.clearWarnTimer();
      this.unbindVisibilityWatch();
      this.releaseCaptureResources();
      this.chunks = [];
      this.startedAt = null;
      this.recordingMimeType = null;
      this.setPhase('idle');
      return;
    }
    if (this.phase === 'recording') {
      await this.stop();
      return;
    }
    if (this.stopPromise) {
      await this.stopPromise;
    }
  }

  private async runFinalize(session: number): Promise<void> {
    try {
      const recorder = this.recorder;
      const durationMs = this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0;
      if (recorder && recorder.state !== 'inactive') {
        await waitForRecorderStop(recorder, 2500);
      }
      if (session !== this.sessionId) return;
      await this.finishWithChunks(session, durationMs);
    } finally {
      this.stopPromise = null;
    }
  }

  async savePending(): Promise<void> {
    const blob = this.pendingBlob;
    const filename = this.pendingFilename ?? buildCallRecordingFilename();
    if (!blob) {
      this.setError('Нет данных для сохранения');
      this.setPhase('idle');
      return;
    }
    try {
      await saveBlobLocally(blob, filename);
      this.pendingBlob = null;
      this.pendingFilename = null;
      this.warning = null;
      this.error = null;
      this.setPhase('idle');
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'Сохранение отменено'
          ? null
          : err instanceof Error
            ? err.message
            : 'Не удалось сохранить запись';
      if (message) {
        this.setError(message);
      }
      // Keep save_prompt so user can retry / discard
      this.emit();
    }
  }

  discardPending(): void {
    this.pendingBlob = null;
    this.pendingFilename = null;
    this.warning = null;
    this.error = null;
    this.startedAt = null;
    this.setPhase('idle');
  }

  dispose(): void {
    this.sessionId += 1;
    this.clearDrawLoop();
    this.clearWarnTimer();
    this.unbindVisibilityWatch();
    const recorder = this.recorder;
    try {
      if (recorder && recorder.state !== 'inactive') {
        // Resolve any in-flight stop waiters via timeout path by forcing stop without nulling first.
        void waitForRecorderStop(recorder, 500);
      }
    } catch {
      // ignore
    }
    this.releaseCaptureResources();
    this.chunks = [];
    this.pendingBlob = null;
    this.pendingFilename = null;
    this.startedAt = null;
    this.recordingMimeType = null;
    this.error = null;
    this.warning = null;
    this.stopPromise = null;
    this.phase = 'idle';
    this.emit();
  }

  private async finishWithChunks(session: number, durationMs: number): Promise<void> {
    if (this.finalizedSessionId === session) return;
    this.finalizedSessionId = session;
    this.releaseCaptureResources();
    this.unbindVisibilityWatch();
    if (session !== this.sessionId) return;

    const mimeType = this.recordingMimeType ?? pickRecordingMimeType() ?? 'video/webm';
    const rawBlob = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];
    // Keep startedAt until save_prompt so the stopping/processing timer does not jump to 0:00.

    if (rawBlob.size === 0) {
      this.startedAt = null;
      this.recordingMimeType = null;
      if (this.phase === 'save_prompt' && this.pendingBlob) {
        this.emit();
        return;
      }
      this.setPhase('idle');
      if (!this.error) {
        this.setError('Запись пустая — нечего сохранять');
      } else {
        this.emit();
      }
      return;
    }

    let processingHintTimer: number | null = window.setTimeout(() => {
      processingHintTimer = null;
      if (session !== this.sessionId) return;
      if (this.phase !== 'stopping') return;
      this.warning = 'Обработка записи…';
      this.emit();
    }, PROCESSING_HINT_DELAY_MS);

    let blob = rawBlob;
    try {
      blob = await makeRecordingSeekable(rawBlob, durationMs);
    } finally {
      if (processingHintTimer != null) {
        window.clearTimeout(processingHintTimer);
      }
    }

    if (session !== this.sessionId) return;

    const ext = recordingExtensionForMime(blob.type || mimeType);
    this.pendingBlob = blob;
    this.pendingFilename = buildCallRecordingFilename(new Date(), ext);
    if (this.warning === 'Обработка записи…') {
      this.warning = null;
    }
    this.startedAt = null;
    this.recordingMimeType = null;
    this.setPhase('save_prompt');
  }

  private async salvageAfterRecorderError(session: number, message: string): Promise<void> {
    if (session !== this.sessionId) return;
    this.error = message;
    this.emit();

    // Join in-flight finalize instead of running a second finishWithChunks.
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    if (this.phase === 'recording') {
      await this.stop();
      return;
    }

    if (this.phase === 'stopping') {
      // Stopping without promise (should be rare) — own the finalize.
      this.clearDrawLoop();
      this.clearWarnTimer();
      this.unbindVisibilityWatch();
      this.stopPromise = this.runFinalize(session);
      await this.stopPromise;
      return;
    }

    if (this.finalizedSessionId !== session && this.chunks.length > 0) {
      const durationMs = this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0;
      await this.finishWithChunks(session, durationMs);
    }
  }

  private bindVisibilityWatch(session: number): void {
    this.unbindVisibilityWatch();
    this.visibilityHandler = () => {
      if (session !== this.sessionId || this.phase !== 'recording') return;
      if (document.visibilityState === 'hidden') {
        this.warning =
          'Вкладка в фоне — видеозаписи может не хватать кадров. Лучше держать звонок на переднем плане.';
        this.emit();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private unbindVisibilityWatch(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private async buildAudioMix(room: Room): Promise<MediaStream> {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return new MediaStream();
    }

    const audioContext = new AudioCtx();
    this.audioContext = audioContext;
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        // continue; mix may still work after a user gesture
      }
    }

    const destination = audioContext.createMediaStreamDestination();
    const liveTracks = collectLiveKitAudioTracks(room);
    let connected = 0;

    for (const track of liveTracks) {
      try {
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
        connected += 1;
      } catch {
        // Skip unusable track
      }
    }

    // Fallback: if LiveKit tracks are not mixable yet, try a short getUserMedia mic.
    if (connected === 0) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of mic.getAudioTracks()) {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
          // Keep track alive for the recording session; stop on release.
          this.trackEndedCleanups.push(() => track.stop());
          connected += 1;
        }
      } catch (err) {
        // Remote-only recording without local mic is still useful; only fail hard if no audio at all.
        if (liveTracks.length === 0) {
          // Keep going with silence so MediaRecorder still produces a valid WebM.
          console.warn('[CallRecording] mic unavailable, recording silent audio', err);
        }
      }
    }

    if (destination.stream.getAudioTracks().length === 0) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      this.trackEndedCleanups.push(() => {
        try {
          oscillator.stop();
        } catch {
          // ignore
        }
      });
    }

    return destination.stream;
  }

  private startDrawLoop(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.clearDrawLoop();
    const tick = () => {
      if (this.phase !== 'recording' || !this.canvas) return;
      const result = drawStageToCanvas(
        canvas,
        ctx,
        this.room,
        this.offscreenVideos,
        this.canvasLayout,
      );
      // Preserve lock flag if already capturing.
      this.canvasLayout = {
        ...result.layout,
        locked: this.canvasLayout?.locked ?? result.layout.locked,
      };
    };
    tick();
    this.drawTimer = window.setInterval(tick, Math.round(1000 / DRAW_FPS));
  }

  private clearDrawLoop(): void {
    if (this.drawTimer != null) {
      window.clearInterval(this.drawTimer);
      this.drawTimer = null;
    }
  }

  private clearWarnTimer(): void {
    if (this.warnTimer != null) {
      window.clearTimeout(this.warnTimer);
      this.warnTimer = null;
    }
  }

  private bindTrackEnded(track: MediaStreamTrack, session: number): void {
    const onEnded = () => {
      if (session !== this.sessionId) return;
      if (this.phase !== 'recording') return;
      // Soft-stop if the composite video track ends unexpectedly.
      if (track.kind === 'video') {
        void this.stop();
      }
    };
    track.addEventListener('ended', onEnded);
    this.trackEndedCleanups.push(() => track.removeEventListener('ended', onEnded));
  }

  private releaseCaptureResources(): void {
    for (const cleanup of this.trackEndedCleanups) {
      try {
        cleanup();
      } catch {
        // ignore
      }
    }
    this.trackEndedCleanups = [];

    if (this.mixedStream) {
      for (const track of this.mixedStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.mixedStream = null;
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }

    clearOffscreenVideos(this.offscreenVideos);
    this.canvas = null;
    this.canvasLayout = null;
    this.recorder = null;
    this.room = null;
    // Keep recordingMimeType until finishWithChunks builds the blob / next start().
  }

  private setPhase(phase: CallRecordingPhase): void {
    this.phase = phase;
    this.emit();
  }

  private setError(message: string): void {
    this.error = message;
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}
