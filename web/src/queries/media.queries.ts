import { useMutation } from '@tanstack/react-query';
import {
  buildMediaPayload,
  inferMsgTypeFromUpload,
  uploadFile,
  uploadVoiceBlob,
} from '@/services/mediaService';
import {
  useSendMediaMessageMutation,
} from '@/queries/messages.queries';
import { useComposerStore } from '@/stores/composerStore';

export function useUploadAttachmentMutation() {
  const sendMedia = useSendMediaMessageMutation();
  const setError = useComposerStore((s) => s.setComposerError);
  const clearReply = useComposerStore((s) => s.clearReply);

  return useMutation({
    mutationFn: async ({
      chatId,
      file,
      replyToId,
    }: {
      chatId: string;
      file: File;
      replyToId?: string | null;
    }) => {
      const upload = await uploadFile(file);
      const msgType = inferMsgTypeFromUpload(file, upload);
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
    }: {
      chatId: string;
      blob: Blob;
      replyToId?: string | null;
    }) => {
      const upload = await uploadVoiceBlob(blob);
      return { upload, chatId, replyToId };
    },
    onSuccess: ({ upload, chatId, replyToId }) => {
      sendMedia.mutate(
        {
          chatId,
          msgType: 'voice',
          media: buildMediaPayload(upload),
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
