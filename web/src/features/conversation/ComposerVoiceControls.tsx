import { formatRecordingTimer } from '@/utils/formatFileSize';
import { IconButton } from '@/components/buttons/IconButton';

interface ComposerVoiceControlsProps {
  hasText: boolean;
  onSendText: () => void;
  inPanel?: boolean;
  elapsedMs: number;
  isRecording: boolean;
  isProcessing: boolean;
  isBusy: boolean;
  onStartRecording: () => void;
  onCancelRecording: () => void;
  onFinishRecording: (shouldSend: boolean) => void;
}

export function ComposerVoiceControls({
  hasText,
  onSendText,
  inPanel = false,
  elapsedMs,
  isRecording,
  isProcessing,
  isBusy,
  onStartRecording,
  onCancelRecording,
  onFinishRecording,
}: ComposerVoiceControlsProps) {
  if (isRecording || isProcessing) {
    return (
      <div
        className={`voice-recording-bar${inPanel ? ' voice-recording-bar--in-panel' : ''}`}
        aria-live="polite"
      >
        <IconButton
          label="Отменить запись"
          className="voice-recording-bar__cancel"
          disabled={isProcessing}
          onClick={onCancelRecording}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v11a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <div className="voice-recording-bar__center">
          <span className="voice-recording-bar__dot" aria-hidden />
          <span className="voice-recording-bar__timer">{formatRecordingTimer(elapsedMs)}</span>
          <span className="voice-recording-bar__live-bars" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className="voice-recording-bar__live-bar"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </span>
        </div>
        <button
          type="button"
          className="voice-recording-bar__timer-mode"
          aria-label="Таймер самоуничтожения"
          disabled
          title="Таймер (скоро)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 8V13l3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M9 3h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="message-composer__send message-composer__send--recording"
          aria-label="Отправить голосовое"
          disabled={isProcessing}
          onClick={() => onFinishRecording(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12l14-7-7 14-2-5-5-2z" fill="currentColor" />
          </svg>
        </button>
      </div>
    );
  }

  if (hasText) {
    return (
      <button
        type="button"
        className="message-composer__send"
        aria-label="Отправить сообщение"
        disabled={isBusy}
        onClick={onSendText}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path d="M5 12l14-7-7 14-2-5-5-2z" fill="currentColor" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="message-composer__voice"
      aria-label="Голосовое сообщение"
      disabled={isBusy}
      onClick={() => void onStartRecording()}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="9" y="4" width="6" height="11" rx="3" fill="currentColor" />
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
