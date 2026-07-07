import { formatRecordingTimer } from '@/utils/formatFileSize';

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
  if (isRecording || isProcessing) {
    return (
      <div className="mobile-composer__recording" aria-live="polite">
        <button
          type="button"
          className="mobile-composer__recording-cancel"
          aria-label="Отменить запись"
          disabled={isProcessing}
          onClick={onCancelRecording}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v11a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z" />
          </svg>
        </button>
        <div className="mobile-composer__recording-center">
          <span className="mobile-composer__recording-dot" aria-hidden />
          <span className="mobile-composer__recording-timer">{formatRecordingTimer(elapsedMs)}</span>
        </div>
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
      </div>
    );
  }

  if (hasText || hasAttachments) {
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
      aria-label="Голосовое сообщение"
      disabled={isBusy}
      onClick={() => void onStartRecording()}
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
