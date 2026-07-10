import { useCallback, useEffect, useRef, useState } from 'react';
import { useComposerStore } from '@/stores/composerStore';
import { uploadVoiceBlob, buildMediaPayload } from '@/services/mediaService';
import { formatMicrophoneAccessError, notifyParentMicrophoneRequired } from '@/utils/microphoneAccess';
import type { MappedMessage } from '@/types/message';
import type { ChannelPostMedia } from '@/services/channelService';

type PublishChannelPostFn = (args: {
  channelId: string;
  content?: string;
  msgType?: string;
  media?: ChannelPostMedia | ChannelPostMedia[];
}) => Promise<MappedMessage>;

function pickRecorderMime(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useChannelPostVoiceRecorder(
  channelId: string,
  disabled: boolean,
  publishPost: PublishChannelPostFn,
) {
  const recordingState = useComposerStore((s) =>
    s.voiceRecordingChatId === channelId ? s.voiceRecordingState : 'idle',
  );
  const setRecordingState = useComposerStore((s) => s.setVoiceRecording);
  const setError = useComposerStore((s) => s.setComposerError);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const startSessionRef = useRef(0);
  const finishingRef = useRef(false);
  const recordingStateRef = useRef(recordingState);
  recordingStateRef.current = recordingState;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);

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
      if (voiceRecordingChatId === channelId && voiceRecordingState !== 'idle') {
        cleanupStream();
        setVoiceRecording('idle');
      }
    };
  }, [channelId, cleanupStream]);

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
    startSessionRef.current += 1;
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
      if (finishingRef.current || recordingStateRef.current !== 'recording') return;
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
            setError(channelId, 'Запись слишком короткая');
          }
          return;
        }

        setRecordingState('processing');
        setIsPublishing(true);
        void (async () => {
          try {
            const uploaded = await uploadVoiceBlob(blob);
            const duration = durationMs || uploaded.duration_ms || undefined;
            await publishPost({
              channelId,
              msgType: 'voice',
              media: {
                media_type: 'voice',
                ...buildMediaPayload(uploaded),
                duration_ms: duration,
              },
            });
            clearDraft(channelId);
          } catch (err) {
            setError(
              channelId,
              err instanceof Error ? err.message : 'Не удалось опубликовать голосовое',
            );
          } finally {
            setIsPublishing(false);
            setRecordingState('idle');
          }
        })();
      };
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
      recorder.stop();
    },
    [channelId, cleanupStream, clearDraft, publishPost, setError, setRecordingState],
  );

  const startRecording = useCallback(async () => {
    if (disabled || isPublishing || recordingState !== 'idle') return;
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
        setError(channelId, 'Не удалось записать голосовое');
      };
      recorderRef.current = recorder;
      recorder.start(100);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecordingState('recording', channelId);
    } catch (err) {
      cleanupStream();
      setRecordingState('idle');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        notifyParentMicrophoneRequired();
      }
      setError(channelId, formatMicrophoneAccessError(err));
    }
  }, [
    channelId,
    cleanupStream,
    disabled,
    isPublishing,
    recordingState,
    setError,
    setRecordingState,
  ]);

  const isRecording = recordingState === 'recording';
  const isProcessing = recordingState === 'processing' || isPublishing;

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
