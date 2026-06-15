import { useCallback, useEffect, useRef } from 'react';
import { useUploadVoiceMutation } from '@/queries/media.queries';
import { useComposerStore } from '@/stores/composerStore';

interface VoiceRecorderButtonProps {
  chatId: string;
  disabled?: boolean;
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

export function VoiceRecorderButton({ chatId, disabled = false }: VoiceRecorderButtonProps) {
  const recordingState = useComposerStore((s) => s.voiceRecordingState);
  const setRecordingState = useComposerStore((s) => s.setVoiceRecording);
  const setError = useComposerStore((s) => s.setComposerError);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const uploadVoice = useUploadVoiceMutation();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupStream();
      setRecordingState('idle');
    }
  }, [cleanupStream, setRecordingState]);

  const startRecording = useCallback(async () => {
    if (disabled || uploadVoice.isPending) return;
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
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        cleanupStream();
        if (blob.size < 1) {
          setRecordingState('idle');
          setError(chatId, 'Recording is too short');
          return;
        }
        setRecordingState('processing');
        uploadVoice.mutate(
          { chatId, blob, replyToId: replyToMessageId },
          { onSettled: () => setRecordingState('idle') },
        );
      };
      recorder.onerror = () => {
        cleanupStream();
        setRecordingState('idle');
        setError(chatId, 'Recording failed');
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingState('recording');
    } catch (err) {
      cleanupStream();
      setRecordingState('idle');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError(chatId, 'Microphone access denied');
      } else if (name === 'NotFoundError') {
        setError(chatId, 'No microphone found');
      } else {
        setError(chatId, err instanceof Error ? err.message : 'Cannot access microphone');
      }
    }
  }, [
    chatId,
    cleanupStream,
    disabled,
    replyToMessageId,
    setError,
    setRecordingState,
    uploadVoice,
  ]);

  const handleClick = () => {
    if (recordingState === 'recording') {
      stopRecording();
      return;
    }
    if (recordingState === 'idle') {
      void startRecording();
    }
  };

  const isBusy = disabled || recordingState === 'processing' || uploadVoice.isPending;

  return (
    <button
      type="button"
      className={`message-composer__voice${recordingState === 'recording' ? ' message-composer__voice--recording' : ''}`}
      aria-label={
        recordingState === 'recording' ? 'Stop recording' : 'Voice message'
      }
      disabled={isBusy}
      onClick={handleClick}
    >
      {recordingState === 'recording' ? (
        <span className="message-composer__voice-pulse" aria-hidden />
      ) : null}
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
