import { useCallback, useEffect, useRef, useState } from 'react';
import { useUploadVoiceMutation } from '@/queries/media.queries';
import { useComposerStore } from '@/stores/composerStore';
import { formatMicrophoneAccessError, notifyParentMicrophoneRequired } from '@/utils/microphoneAccess';
import { formatRecordingTimer } from '@/utils/formatFileSize';
import { IconButton } from '@/components/buttons/IconButton';

interface ComposerVoiceControlsProps {
  chatId: string;
  hasText: boolean;
  onSendText: () => void;
  disabled?: boolean;
  inPanel?: boolean;
}

function pickRecorderMime(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function ComposerVoiceControls({
  chatId,
  hasText,
  onSendText,
  disabled = false,
  inPanel = false,
}: ComposerVoiceControlsProps) {
  const recordingState = useComposerStore((s) =>
    s.voiceRecordingChatId === chatId ? s.voiceRecordingState : 'idle',
  );
  const setRecordingState = useComposerStore((s) => s.setVoiceRecording);
  const setError = useComposerStore((s) => s.setComposerError);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const uploadVoice = useUploadVoiceMutation();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = 0;
    setElapsedMs(0);
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  // Stop recording only when leaving this chat (chatId changes), not on layout re-renders.
  useEffect(() => {
    return () => {
      const { voiceRecordingChatId, voiceRecordingState, setVoiceRecording } =
        useComposerStore.getState();
      if (voiceRecordingChatId === chatId && voiceRecordingState !== 'idle') {
        cleanupStream();
        setVoiceRecording('idle');
      }
    };
  }, [chatId, cleanupStream]);

  useEffect(() => {
    if (recordingState !== 'recording') return;
    const tick = () => {
      if (startedAtRef.current > 0) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [recordingState]);

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        cleanupStream();
        setRecordingState('idle');
      };
      recorder.stop();
    } else {
      cleanupStream();
      setRecordingState('idle');
    }
  }, [cleanupStream, setRecordingState]);

  const finishRecording = useCallback(
    (shouldSend: boolean) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanupStream();
        setRecordingState('idle');
        return;
      }

      const durationMs = startedAtRef.current > 0 ? Date.now() - startedAtRef.current : elapsedMs;

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        cleanupStream();

        if (!shouldSend || blob.size < 1) {
          setRecordingState('idle');
          if (shouldSend && blob.size < 1) {
            setError(chatId, 'Запись слишком короткая');
          }
          return;
        }

        setRecordingState('processing');
        uploadVoice.mutate(
          { chatId, blob, replyToId: replyToMessageId, durationMs: durationMs || undefined },
          { onSettled: () => setRecordingState('idle') },
        );
      };
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
      recorder.stop();
    },
    [
      chatId,
      cleanupStream,
      elapsedMs,
      replyToMessageId,
      setError,
      setRecordingState,
      uploadVoice,
    ],
  );

  const startRecording = useCallback(async () => {
    if (disabled || uploadVoice.isPending || recordingState !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        cleanupStream();
        setRecordingState('idle');
        setError(chatId, 'Recording failed');
      };
      recorderRef.current = recorder;
      recorder.start(100);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecordingState('recording', chatId);
    } catch (err) {
      cleanupStream();
      setRecordingState('idle');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        notifyParentMicrophoneRequired();
      }
      setError(chatId, formatMicrophoneAccessError(err));
    }
  }, [
    chatId,
    cleanupStream,
    disabled,
    recordingState,
    setError,
    setRecordingState,
    uploadVoice.isPending,
  ]);

  const isRecording = recordingState === 'recording';
  const isProcessing = recordingState === 'processing' || uploadVoice.isPending;
  const isBusy = disabled || isProcessing;

  if (isRecording || isProcessing) {
    return (
      <div
        className={`voice-recording-bar${inPanel ? ' voice-recording-bar--in-panel' : ''}`}
        aria-live="polite"
      >
        <IconButton
          label="Cancel recording"
          className="voice-recording-bar__cancel"
          disabled={isProcessing}
          onClick={cancelRecording}
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
          aria-label="Voice message timer"
          disabled
          title="Self-destruct timer (coming soon)"
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
          aria-label="Send voice message"
          disabled={isProcessing}
          onClick={() => finishRecording(true)}
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
        aria-label="Send message"
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
      aria-label="Voice message"
      disabled={isBusy}
      onClick={() => void startRecording()}
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
