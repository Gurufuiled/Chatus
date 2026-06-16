import { useCallback, useEffect, useRef, useState } from 'react';
import { useUploadVoiceMutation } from '@/queries/media.queries';
import { useComposerStore } from '@/stores/composerStore';
import { formatMicrophoneAccessError, notifyParentMicrophoneRequired } from '@/utils/microphoneAccess';

function pickRecorderMime(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useVoiceRecorder(chatId: string, disabled = false) {
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
  const startSessionRef = useRef(0);
  const finishingRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = 0;
    setElapsedMs(0);
  }, []);

  useEffect(() => {
    return () => {
      startSessionRef.current += 1;
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
      if (finishingRef.current || recordingState !== 'recording') return;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanupStream();
        setRecordingState('idle');
        return;
      }

      finishingRef.current = true;
      const durationMs = startedAtRef.current > 0 ? Date.now() - startedAtRef.current : 0;

      recorder.onstop = () => {
        finishingRef.current = false;
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
      recordingState,
      replyToMessageId,
      setError,
      setRecordingState,
      uploadVoice,
    ],
  );

  const startRecording = useCallback(async () => {
    if (disabled || uploadVoice.isPending || recordingState !== 'idle') return;
    const session = ++startSessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== startSessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
        setError(chatId, 'Не удалось записать голосовое');
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

  return {
    elapsedMs,
    isRecording,
    isProcessing,
    isBusy: disabled || isProcessing,
    startRecording,
    cancelRecording,
    finishRecording,
  };
}
