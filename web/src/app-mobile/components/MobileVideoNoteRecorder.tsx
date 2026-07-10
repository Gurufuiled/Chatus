import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_DURATION_MS = 60_000;
const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export type VideoNoteRecordingResult = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  thumbnailBlob: Blob | null;
};

interface MobileVideoNoteRecorderProps {
  open: boolean;
  onComplete: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onCancel: () => void;
}

function pickVideoMime(): string | undefined {
  return VIDEO_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

function formatTimer(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

async function captureThumbnail(video: HTMLVideoElement): Promise<Blob | null> {
  try {
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth || 320, video.videoHeight || 320, 320);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const vw = video.videoWidth || size;
    const vh = video.videoHeight || size;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
    });
  } catch {
    return null;
  }
}

export function MobileVideoNoteRecorder({
  open,
  onComplete,
  onCancel,
}: MobileVideoNoteRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const finishingRef = useRef(false);
  const cancelledRef = useRef(false);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraSessionRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const cleanupTimers = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const closeAndCleanup = useCallback(() => {
    cancelledRef.current = true;
    cleanupTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    stopStream();
    setIsRecording(false);
    setIsPreparing(false);
    setCameraReady(false);
    setElapsedMs(0);
    setError(null);
  }, [cleanupTimers, stopStream]);

  const startCamera = useCallback(async () => {
    const session = ++cameraSessionRef.current;
    setError(null);
    setCameraReady(false);
    setIsPreparing(true);
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode,
          width: { ideal: 480 },
          height: { ideal: 480 },
          aspectRatio: { ideal: 1 },
        },
      });
      if (cancelledRef.current || session !== cameraSessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (session !== cameraSessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setCameraReady(true);
    } catch (err) {
      if (session !== cameraSessionRef.current) return;
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Нет доступа к камере или микрофону');
      } else if (name === 'NotFoundError') {
        setError('Камера не найдена');
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось открыть камеру');
      }
    } finally {
      if (session === cameraSessionRef.current) {
        setIsPreparing(false);
      }
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    if (!open) {
      closeAndCleanup();
      return;
    }
    cancelledRef.current = false;
    finishingRef.current = false;
    void startCamera();
    return () => {
      closeAndCleanup();
    };
  }, [closeAndCleanup, open, startCamera]);

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => {
      if (startedAtRef.current > 0) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const finishRecording = useCallback(
    async (shouldSend: boolean) => {
      if (finishingRef.current) return;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        if (!shouldSend) onCancel();
        return;
      }
      finishingRef.current = true;
      cleanupTimers();
      const durationMs = startedAtRef.current > 0 ? Date.now() - startedAtRef.current : 0;
      const thumbnailBlob = videoRef.current ? await captureThumbnail(videoRef.current) : null;

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });

      const mimeType = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      stopStream();
      setIsRecording(false);
      finishingRef.current = false;

      if (cancelledRef.current || !shouldSend || blob.size < 1 || durationMs < 400) {
        if (!cancelledRef.current) onCancel();
        return;
      }

      await onComplete({
        blob,
        durationMs: Math.min(durationMs, MAX_DURATION_MS),
        mimeType,
        thumbnailBlob,
      });
    },
    [cleanupTimers, onCancel, onComplete, stopStream],
  );

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !cameraReady || isRecording || finishingRef.current) return;
    const mimeType = pickVideoMime();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 850_000 })
      : new MediaRecorder(stream, { videoBitsPerSecond: 850_000 });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      setError('Не удалось записать видеокружок');
      void finishRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start(100);
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
    maxTimerRef.current = setTimeout(() => {
      void finishRecording(true);
    }, MAX_DURATION_MS);
  }, [cameraReady, finishRecording, isRecording]);

  if (!open) return null;

  return (
    <div className="mobile-video-note-recorder" role="dialog" aria-modal="true" aria-label="Видеосообщение">
      <div className="mobile-video-note-recorder__backdrop" onClick={onCancel} />
      <div className="mobile-video-note-recorder__sheet">
        <div className="mobile-video-note-recorder__header">
          <button type="button" className="mobile-video-note-recorder__close" onClick={onCancel} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
          <span className="mobile-video-note-recorder__title">Видеосообщение</span>
          <button
            type="button"
            className="mobile-video-note-recorder__flip"
            aria-label="Переключить камеру"
            disabled={isRecording || isPreparing}
            onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M16 7h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2" strokeLinecap="round" />
              <path d="M9 7l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </button>
        </div>

        <div className="mobile-video-note-recorder__circle">
          <video
            ref={videoRef}
            className="mobile-video-note-recorder__preview"
            muted
            playsInline
            autoPlay
          />
          {isRecording ? (
            <div className="mobile-video-note-recorder__timer" aria-live="polite">
              {formatTimer(elapsedMs)}
            </div>
          ) : null}
          {!cameraReady && !error ? (
            <div className="mobile-video-note-recorder__loading">Открытие камеры…</div>
          ) : null}
          {error ? <div className="mobile-video-note-recorder__error">{error}</div> : null}
        </div>

        <div className="mobile-video-note-recorder__actions">
          {isRecording ? (
            <>
              <button
                type="button"
                className="mobile-video-note-recorder__secondary"
                onClick={() => void finishRecording(false)}
              >
                Удалить
              </button>
              <button
                type="button"
                className="mobile-video-note-recorder__stop"
                aria-label="Отправить видеокружок"
                onClick={() => void finishRecording(true)}
              >
                <span />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="mobile-video-note-recorder__record"
              aria-label="Начать запись"
              disabled={!cameraReady || isPreparing || Boolean(error)}
              onClick={startRecording}
            >
              <span />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
