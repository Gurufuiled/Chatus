import { useEffect } from 'react';
import { formatRecordingTimer } from '@/utils/formatFileSize';
import { useVoiceHoldGesture } from '../hooks/useVoiceHoldGesture';

const CANCEL_TRIGGER = 0.84;

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
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
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
}: MobileComposerVoiceControlsProps) {
  const canSend = hasText || hasAttachments;
  const voiceHold = useVoiceHoldGesture({
    disabled: isBusy,
    canSend,
    isRecording,
    isProcessing,
    onStartRecording,
    onCancelRecording,
    onFinishRecording,
  });

  useEffect(() => {
    voiceHold.syncRecordingMode();
  }, [isRecording, isProcessing, voiceHold.syncRecordingMode]);

  const {
    gesture,
    onMicPointerDown,
    onMicPointerMove,
    onMicPointerUp,
    onMicPointerCancel,
  } = voiceHold;
  const isLocked = gesture.mode === 'locked';
  const showRecordingUi = isRecording || isProcessing || gesture.mode !== 'idle';
  const cancelActive = gesture.cancelProgress >= CANCEL_TRIGGER;

  if (showRecordingUi) {
    return (
      <div
        className={`mobile-composer__recording-stage${isLocked ? ' mobile-composer__recording-stage--locked' : ''}${cancelActive ? ' mobile-composer__recording-stage--cancel' : ''}`}
        aria-live="polite"
      >
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
          {isLocked ? (
            <button
              type="button"
              className="mobile-composer__recording-cancel"
              aria-label="Удалить запись"
              disabled={isProcessing}
              onClick={onCancelRecording}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v11a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z" />
              </svg>
            </button>
          ) : null}

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
            {!isLocked ? (
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

          {isLocked ? (
            <button
              type="button"
              className="mobile-composer__send"
              aria-label="Отправить голосовое"
              disabled={isProcessing}
              onClick={() => onFinishRecording(true)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          ) : (
            <div className="mobile-composer__recording-mic-halo" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="9" y="4" width="6" height="11" rx="3" />
                <path
                  d="M6 11a6 6 0 0012 0M12 17v3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
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

  return (
    <button
      type="button"
      className="mobile-composer__voice"
      aria-label="Удерживайте для записи голосового"
      disabled={isBusy}
      onPointerDown={onMicPointerDown}
      onPointerMove={onMicPointerMove}
      onPointerUp={onMicPointerUp}
      onPointerCancel={onMicPointerCancel}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="9" y="4" width="6" height="11" rx="3" />
        <path
          d="M6 11a6 6 0 0012 0M12 17v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
