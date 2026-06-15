import { useMutation } from '@tanstack/react-query';
import {
  buildMediaPayload,
  inferMsgTypeFromUpload,
  uploadFile,
  uploadVoiceBlob,
} from '@/services/mediaService';
import { useSendMediaMessageMutation } from '@/queries/messages.queries';
import { useComposerStore } from '@/stores/composerStore';
import { compressImageForQuickSend } from '@/utils/imageCompression';

export function useUploadAttachmentMutation() {
  const sendMedia = useSendMediaMessageMutation();
  const setError = useComposerStore((s) => s.setComposerError);
  const clearReply = useComposerStore((s) => s.clearReply);

  return useMutation({
    mutationFn: async ({
      chatId,
      file,
      replyToId,
      compressImages = true,
      sendAsFile = false,
    }: {
      chatId: string;
      file: File;
      replyToId?: string | null;
      compressImages?: boolean;
      sendAsFile?: boolean;
    }) => {
      let prepared = file;
      if (compressImages && !sendAsFile && file.type.startsWith('image/')) {
        prepared = await compressImageForQuickSend(file);
      }

      const upload = await uploadFile(prepared);
      let msgType = inferMsgTypeFromUpload(prepared, upload);
      if (sendAsFile && prepared.type.startsWith('image/')) {
        msgType = 'file';
      }
      return { upload, msgType, chatId, replyToId };
    },
    onSuccess: ({ upload, msgType, chatId, replyToId }) => {
      sendMedia.mutate(
        {
          chatId,
          msgType,
          media: buildMediaPayload(upload),
          replyToId,
          clientTempId: crypto.randomUUID(),
        },
        { onSuccess: () => clearReply() },
      );
    },
    onError: (err, { chatId }) => {
      setError(chatId, err instanceof Error ? err.message : 'Upload failed');
    },
  });
}

export function useUploadVoiceMutation() {
  const sendMedia = useSendMediaMessageMutation();
  const setError = useComposerStore((s) => s.setComposerError);
  const clearReply = useComposerStore((s) => s.clearReply);

  return useMutation({
    mutationFn: async ({
      chatId,
      blob,
      replyToId,
      durationMs,
    }: {
      chatId: string;
      blob: Blob;
      replyToId?: string | null;
      durationMs?: number;
    }) => {
      const upload = await uploadVoiceBlob(blob);
      return { upload, chatId, replyToId, durationMs };
    },
    onSuccess: ({ upload, chatId, replyToId, durationMs }) => {
      const media = buildMediaPayload(upload);
      if (durationMs && !media.duration_ms) {
        media.duration_ms = durationMs;
      }
      sendMedia.mutate(
        {
          chatId,
          msgType: 'voice',
          media,
          replyToId,
          clientTempId: crypto.randomUUID(),
        },
        { onSuccess: () => clearReply() },
      );
    },
    onError: (err, { chatId }) => {
      setError(chatId, err instanceof Error ? err.message : 'Voice upload failed');
    },
  });
}
