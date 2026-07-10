import { useEffect, useRef, useState } from 'react';
import { formatRecordingTimer } from '@/utils/formatFileSize';
import { useVoiceHoldGesture } from '../hooks/useVoiceHoldGesture';

const CANCEL_TRIGGER = 0.84;
const VIDEO_SWIPE_TRIGGER = 34;
const TAP_SLOP = 10;

interface MobileComposerVoiceControlsProps {
  hasText: boolean;
  hasAttachments: boolean;
  onSend: () => void;
  elapsedMs: number;
  isRecording: boolean;
  isProcessing: boolean;
  isBusy: boolean;
  onStartRecording: () => void;
  onCancelRecording: () => void;
  onFinishRecording: (shouldSend: boolean) => void;
  /** When set, tap mic toggles voice/video entry; swipe-up or camera tap opens recorder. */
  onOpenVideoNoteRecorder?: () => void;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="9" y="4" width="6" height="11" rx="3" />
      <path
        d="M6 11a6 6 0 0012 0M12 17v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CameraIcon() {
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

export function MobileComposerVoiceControls({
  hasText,
  hasAttachments,
  onSend,
  elapsedMs,
  isRecording,
  isProcessing,
  isBusy,
  onStartRecording,
  onCancelRecording,
  onFinishRecording,
  onOpenVideoNoteRecorder,
}: MobileComposerVoiceControlsProps) {
  const canSend = hasText || hasAttachments;
  const canUseVideoNotes = typeof onOpenVideoNoteRecorder === 'function';
  const [entryMode, setEntryMode] = useState<'voice' | 'video'>('voice');

  const videoPointerRef = useRef<{
    id: number | null;
    x: number;
    y: number;
    moved: boolean;
    opened: boolean;
  }>({ id: null, x: 0, y: 0, moved: false, opened: false });

  const voiceHold = useVoiceHoldGesture({
    disabled: isBusy || entryMode === 'video',
    canSend,
    isRecording,
    isProcessing,
    onStartRecording,
    onCancelRecording,
    onFinishRecording,
    onIdleTap: canUseVideoNotes
      ? () => setEntryMode((prev) => (prev === 'voice' ? 'video' : 'voice'))
      : undefined,
  });

  useEffect(() => {
    voiceHold.syncRecordingMode();
  }, [isRecording, isProcessing, voiceHold.syncRecordingMode]);

  useEffect(() => {
    if (!canUseVideoNotes && entryMode !== 'voice') {
      setEntryMode('voice');
    }
  }, [canUseVideoNotes, entryMode]);

  const { gesture, onMicPointerDown, resetVisuals } = voiceHold;
  const isLocked = gesture.mode === 'locked';
  const showRecordingUi = isRecording || isProcessing || gesture.mode !== 'idle';
  const cancelActive = gesture.cancelProgress >= CANCEL_TRIGGER;
  const showSendAction =
    isProcessing || isLocked || (isRecording && !gesture.touchTracking);

  const handleCancel = () => {
    onCancelRecording();
    resetVisuals('idle');
  };

  const handleVideoPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isBusy || canSend) return;
    if (e.button !== 0) return;
    e.preventDefault();
    videoPointerRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      opened: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleVideoPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = videoPointerRef.current;
    if (state.id !== e.pointerId) return;
    const dy = e.clientY - state.y;
    const dx = e.clientX - state.x;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) {
      state.moved = true;
    }
    if (!state.opened && dy <= -VIDEO_SWIPE_TRIGGER) {
      state.opened = true;
      onOpenVideoNoteRecorder?.();
    }
  };

  const handleVideoPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = videoPointerRef.current;
    if (state.id !== e.pointerId) return;
    videoPointerRef.current = { id: null, x: 0, y: 0, moved: false, opened: false };
    if (state.opened) return;
    if (!state.moved) {
      // Tap in video mode toggles back to voice (mobile parity).
      setEntryMode('voice');
    }
  };

  if (showRecordingUi) {
    return (
      <div
        className={`mobile-composer__recording-stage${showSendAction ? ' mobile-composer__recording-stage--locked' : ''}${cancelActive ? ' mobile-composer__recording-stage--cancel' : ''}`}
        aria-live="polite"
      >
        {gesture.touchTracking && !isLocked ? (
          <div className="mobile-composer__recording-gesture-layer" aria-hidden />
        ) : null}

        {!isLocked && gesture.touchTracking ? (
          <div
            className="mobile-composer__recording-lock-hint"
            style={{ opacity: Math.max(0.2, gesture.lockProgress) }}
            aria-hidden
          >
            <span className="mobile-composer__recording-lock-icon">
              <LockIcon />
            </span>
            <span>Вверх — закрепить</span>
          </div>
        ) : null}

        <div className="mobile-composer__recording">
          <button
            type="button"
            className="mobile-composer__recording-cancel"
            aria-label="Удалить запись"
            disabled={isProcessing}
            onClick={handleCancel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v11a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z" />
            </svg>
          </button>

          <div
            className="mobile-composer__recording-bubble"
            style={{
              transform: `translate(${gesture.dragX}px, ${gesture.dragY}px)`,
            }}
          >
            <div
              className="mobile-composer__recording-bubble-tint"
              style={{ opacity: gesture.cancelProgress * 0.85 }}
            />
            <div className="mobile-composer__recording-center">
              <span className="mobile-composer__recording-dot" aria-hidden />
              <span className="mobile-composer__recording-timer">
                {formatRecordingTimer(elapsedMs)}
              </span>
            </div>
            {!isLocked && gesture.touchTracking ? (
              <span className="mobile-composer__recording-slide-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Влево — отмена
              </span>
            ) : null}
            <span
              className="mobile-composer__recording-cancel-label"
              style={{ opacity: gesture.cancelProgress }}
            >
              ОТМЕНА
            </span>
          </div>

          {showSendAction ? (
            <button
              type="button"
              className="mobile-composer__send mobile-composer__recording-send"
              aria-label="Отправить голосовое"
              disabled={isProcessing || !isRecording}
              onClick={() => onFinishRecording(true)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          ) : (
            <div className="mobile-composer__recording-mic-halo" aria-hidden>
              <MicIcon />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (canSend) {
    return (
      <button
        type="button"
        className="mobile-composer__send"
        onClick={onSend}
        disabled={isBusy}
        aria-label="Отправить"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    );
  }

  if (entryMode === 'video' && canUseVideoNotes) {
    return (
      <button
        type="button"
        className="mobile-composer__voice mobile-composer__voice--video"
        aria-label="Свайп вверх для видеокружка, нажатие — голосовое"
        disabled={isBusy}
        onPointerDown={handleVideoPointerDown}
        onPointerMove={handleVideoPointerMove}
        onPointerUp={handleVideoPointerUp}
        onPointerCancel={handleVideoPointerUp}
      >
        <CameraIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="mobile-composer__voice"
      aria-label={
        canUseVideoNotes
          ? 'Удерживайте для голосового, нажмите для видеокружка'
          : 'Удерживайте для записи голосового'
      }
      disabled={isBusy}
      onPointerDown={onMicPointerDown}
    >
      <MicIcon />
    </button>
  );
}
