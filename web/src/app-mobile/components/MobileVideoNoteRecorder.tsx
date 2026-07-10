import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeVideoUploadMime } from '@/services/mediaService';

const MAX_DURATION_MS = 60_000;
const CIRCLE_SIZE_PX = 320;
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

function getMobileAppPortalRoot(): HTMLElement {
  return document.querySelector('.mobile-app') ?? document.body;
}

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

function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M21 12a9 9 0 11-2.64-6.36" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path
        d="M4 8.5A2.5 2.5 0 016.5 6h2l1.2-1.6A1.5 1.5 0 0110.9 4h2.2a1.5 1.5 0 011.2.4L15.5 6h2A2.5 2.5 0 0120 8.5v7A2.5 2.5 0 0117.5 18h-11A2.5 2.5 0 014 15.5v-7z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
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
  const startAttemptedRef = useRef(false);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraSessionRef = useRef(0);
  const facingModeRef = useRef<'user' | 'environment'>('user');
  const isRecordingRef = useRef(false);
  const isPreparingRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [permissionDenied, setPermissionDenied] = useState(false);

  facingModeRef.current = facingMode;
  isRecordingRef.current = isRecording;
  isPreparingRef.current = isPreparing;

  const canFlipCamera = !isPreparing && !isRecording && !finishingRef.current;

  const setPreparing = useCallback((value: boolean) => {
    isPreparingRef.current = value;
    setIsPreparing(value);
  }, []);

  const setRecording = useCallback((value: boolean) => {
    isRecordingRef.current = value;
    setIsRecording(value);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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

  const stopRecorderSilently = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const closeAndCleanup = useCallback(() => {
    cancelledRef.current = true;
    startAttemptedRef.current = false;
    cleanupTimers();
    stopRecorderSilently();
    stopStream();
    setRecording(false);
    setPreparing(false);
    setCameraReady(false);
    setElapsedMs(0);
    setError(null);
    setPermissionDenied(false);
  }, [cleanupTimers, setPreparing, setRecording, stopRecorderSilently, stopStream]);

  const startCamera = useCallback(
    async (facing: 'user' | 'environment') => {
      const session = ++cameraSessionRef.current;
      setError(null);
      setPermissionDenied(false);
      setCameraReady(false);
      setPreparing(true);
      setRecording(false);
      startAttemptedRef.current = false;
      cleanupTimers();

      try {
        stopRecorderSilently();
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: facing,
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
        // Keep preparing true until auto-start begins recording (blocks flip race).
        setCameraReady(true);
      } catch (err) {
        if (session !== cameraSessionRef.current) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setPermissionDenied(true);
          setError('Нужен доступ к камере и микрофону');
        } else if (name === 'NotFoundError') {
          setError('Камера не найдена');
        } else {
          setError(err instanceof Error ? err.message : 'Не удалось открыть камеру');
        }
        if (session === cameraSessionRef.current) {
          setPreparing(false);
        }
      }
    },
    [cleanupTimers, setPreparing, setRecording, stopRecorderSilently, stopStream],
  );

  useEffect(() => {
    if (!open) {
      closeAndCleanup();
      return;
    }
    cancelledRef.current = false;
    finishingRef.current = false;
    startAttemptedRef.current = false;
    setFacingMode('user');
    facingModeRef.current = 'user';
    setElapsedMs(0);
    setRecording(false);
    void startCamera('user');
    return () => {
      closeAndCleanup();
    };
    // Intentionally only re-run on open — facing flips call startCamera directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => {
      if (startedAtRef.current > 0) {
        const next = Math.min(Date.now() - startedAtRef.current, MAX_DURATION_MS);
        setElapsedMs(next);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const finishRecording = useCallback(
    async (shouldSend: boolean) => {
      if (finishingRef.current) return;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        if (!shouldSend) {
          closeAndCleanup();
          onCancel();
        }
        return;
      }
      finishingRef.current = true;
      cancelledRef.current = !shouldSend;
      setPreparing(true);
      cleanupTimers();
      const durationMs = startedAtRef.current > 0 ? Date.now() - startedAtRef.current : 0;
      const thumbnailBlob = videoRef.current ? await captureThumbnail(videoRef.current) : null;

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch {
            // ignore
          }
        }
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });

      const mimeType = normalizeVideoUploadMime(recorder.mimeType || chunksRef.current[0]?.type);
      const blob = new Blob(chunksRef.current, { type: mimeType });
      stopStream();
      recorderRef.current = null;
      chunksRef.current = [];
      setRecording(false);
      setPreparing(false);
      finishingRef.current = false;

      if (!shouldSend || cancelledRef.current) {
        onCancel();
        return;
      }

      if (blob.size < 1 || durationMs < 400) {
        onCancel();
        return;
      }

      await onComplete({
        blob,
        durationMs: Math.min(durationMs, MAX_DURATION_MS),
        mimeType,
        thumbnailBlob,
      });
    },
    [cleanupTimers, closeAndCleanup, onCancel, onComplete, setPreparing, setRecording, stopStream],
  );

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (
      !stream ||
      !cameraReady ||
      isRecordingRef.current ||
      finishingRef.current ||
      startAttemptedRef.current ||
      cancelledRef.current
    ) {
      return;
    }
    startAttemptedRef.current = true;
    setPreparing(true);
    try {
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
      if (cancelledRef.current) {
        stopRecorderSilently();
        setPreparing(false);
        return;
      }
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      setPreparing(false);
      maxTimerRef.current = setTimeout(() => {
        void finishRecording(true);
      }, MAX_DURATION_MS);
    } catch {
      setError('Не удалось начать запись видеокружка');
      startAttemptedRef.current = false;
      setPreparing(false);
      onCancel();
    }
  }, [cameraReady, finishRecording, onCancel, setPreparing, setRecording, stopRecorderSilently]);

  // Auto-start recording once camera is ready (mobile parity).
  useEffect(() => {
    if (!open || !cameraReady || isRecording || finishingRef.current || permissionDenied || error) {
      return;
    }
    startRecording();
  }, [cameraReady, error, isRecording, open, permissionDenied, startRecording]);

  const handleCancel = () => {
    if (!open) return;
    if (isRecordingRef.current || recorderRef.current) {
      void finishRecording(false);
      return;
    }
    cancelledRef.current = true;
    closeAndCleanup();
    onCancel();
  };

  const handleSend = () => {
    if (!isRecordingRef.current || isPreparingRef.current) return;
    void finishRecording(true);
  };

  const handleFlipCamera = () => {
    if (isPreparingRef.current || isRecordingRef.current || finishingRef.current) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    void startCamera(next);
  };

  const handleRequestPermission = () => {
    void startCamera(facingModeRef.current);
  };

  if (!open) return null;

  const circleSize = `min(${CIRCLE_SIZE_PX}px, calc(100vw - 44px))`;
  const showPermission = permissionDenied;
  const showGenericError = Boolean(error) && !permissionDenied;

  // Portal out of `.mobile-composer-wrap` — it uses `will-change: transform` /
  // keyboard `translateY`, which makes `position: fixed` cover only the composer strip.
  return createPortal(
    <div className="mobile-video-note-recorder" role="dialog" aria-modal="true" aria-label="Видеокружок">
      <div className="mobile-video-note-recorder__backdrop" />
      <div className="mobile-video-note-recorder__wash" />

      <div className="mobile-video-note-recorder__content">
        <div className="mobile-video-note-recorder__stage">
          <div
            className="mobile-video-note-recorder__circle"
            style={{ width: circleSize, height: circleSize }}
            role={showPermission || showGenericError ? undefined : 'button'}
            aria-label={showPermission || showGenericError ? undefined : 'Отправить видеокружок'}
            tabIndex={showPermission || showGenericError ? undefined : 0}
            onClick={
              showPermission || showGenericError
                ? undefined
                : () => {
                    handleSend();
                  }
            }
            onKeyDown={
              showPermission || showGenericError
                ? undefined
                : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSend();
                    }
                  }
            }
          >
            <div className="mobile-video-note-recorder__camera-mask">
              <video
                ref={videoRef}
                className={`mobile-video-note-recorder__preview${facingMode === 'user' ? ' mobile-video-note-recorder__preview--mirror' : ''}`}
                muted
                playsInline
                autoPlay
              />
            </div>

            {showPermission || showGenericError ? (
              <div className="mobile-video-note-recorder__permission">
                <CameraGlyph />
                {showPermission ? (
                  <>
                    <strong>Нужен доступ к камере и микрофону</strong>
                    <p>Разреши доступ, и свайп вверх сразу будет открывать запись видеокружка.</p>
                    <button
                      type="button"
                      className="mobile-video-note-recorder__permission-btn"
                      onClick={handleRequestPermission}
                    >
                      Разрешить
                    </button>
                  </>
                ) : (
                  <>
                    <strong>{error}</strong>
                    <p>Попробуй ещё раз или закрой запись.</p>
                    <button
                      type="button"
                      className="mobile-video-note-recorder__permission-btn"
                      onClick={handleRequestPermission}
                    >
                      Повторить
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {isPreparing && !showPermission && !showGenericError ? (
              <div className="mobile-video-note-recorder__loading" aria-hidden>
                <span className="mobile-video-note-recorder__spinner" />
              </div>
            ) : null}
          </div>

          <div className="mobile-video-note-recorder__right-rail">
            <button
              type="button"
              className="mobile-video-note-recorder__rail-btn"
              aria-label="Переключить камеру"
              disabled={!canFlipCamera}
              onClick={handleFlipCamera}
            >
              <FlipIcon />
            </button>
            <span className="mobile-video-note-recorder__video-badge">VIDEO</span>
          </div>
        </div>

        <div className="mobile-video-note-recorder__bottom">
          <div className="mobile-video-note-recorder__controls-bar">
            <div className="mobile-video-note-recorder__controls-wash" />
            <div className="mobile-video-note-recorder__controls-tint mobile-video-note-recorder__controls-tint--left" />
            <div className="mobile-video-note-recorder__controls-tint mobile-video-note-recorder__controls-tint--right" />
            <div className="mobile-video-note-recorder__controls-content">
              <div className="mobile-video-note-recorder__timer-pill" aria-live="polite">
                <span className="mobile-video-note-recorder__record-dot" aria-hidden />
                <span>{formatTimer(elapsedMs)}</span>
              </div>
              <button
                type="button"
                className="mobile-video-note-recorder__cancel"
                onClick={handleCancel}
              >
                Отмена
              </button>
            </div>
          </div>

          <button
            type="button"
            className="mobile-video-note-recorder__send"
            aria-label="Отправить видеокружок"
            disabled={!isRecording || isPreparing}
            onClick={handleSend}
          >
            <SendArrowIcon />
          </button>
        </div>
      </div>
    </div>,
    getMobileAppPortalRoot(),
  );
}
