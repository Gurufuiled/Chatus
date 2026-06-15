import { useMutation } from '@tanstack/react-query';
import {
  buildMediaPayload,
  inferMsgTypeFromUpload,
  uploadFile,
  uploadVoiceBlob,
} from '@/services/mediaService';
import { useSendMediaMessageMutation } from '@/queries/messages.queries';
import { useComposerStore, type PendingAttachment } from '@/stores/composerStore';
import { compressImageForQuickSend } from '@/utils/imageCompression';
import type { MessageMediaInput } from '@/services/messageService';
import type { MessageType } from '@/types/message';

export function isStageableImage(file: File): boolean {
  return file.type.startsWith('image/');
}

export function isStageableAlbumMedia(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

async function prepareAndUpload(
  file: File,
  { compressImages, sendAsFile }: { compressImages: boolean; sendAsFile: boolean },
) {
  let prepared = file;
  if (compressImages && !sendAsFile && file.type.startsWith('image/')) {
    prepared = await compressImageForQuickSend(file);
  }
  const upload = await uploadFile(prepared);
  let msgType = inferMsgTypeFromUpload(prepared, upload);
  if (sendAsFile && prepared.type.startsWith('image/')) {
    msgType = 'file';
  }
  return { upload, msgType, prepared };
}

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
      const { upload, msgType } = await prepareAndUpload(file, { compressImages, sendAsFile });
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
      setError(chatId, err instanceof Error ? err.message : 'Не удалось загрузить файл');
    },
  });
}

export function useSendPendingAttachmentsMutation() {
  const sendMedia = useSendMediaMessageMutation();
  const setError = useComposerStore((s) => s.setComposerError);
  const clearReply = useComposerStore((s) => s.clearReply);
  const clearPendingAttachments = useComposerStore((s) => s.clearPendingAttachments);
  const clearDraft = useComposerStore((s) => s.clearDraft);

  return useMutation({
    mutationFn: async ({
      chatId,
      attachments,
      caption,
      replyToId,
      clientTempId,
    }: {
      chatId: string;
      attachments: PendingAttachment[];
      caption?: string | null;
      replyToId?: string | null;
      clientTempId?: string;
    }) => {
      const albumMedia: MessageMediaInput[] = [];
      const fileSends: { msgType: MessageType; media: MessageMediaInput; content?: string }[] = [];

      for (const attachment of attachments) {
        const { upload, msgType } = await prepareAndUpload(attachment.file, {
          compressImages: !attachment.sendAsFile,
          sendAsFile: attachment.sendAsFile,
        });
        const payload = buildMediaPayload(upload);
        if (attachment.sendAsFile || msgType === 'file') {
          fileSends.push({
            msgType,
            media: payload,
            content: attachment.file.name,
          });
        } else if (msgType === 'image' || msgType === 'video') {
          albumMedia.push({ ...payload, media_type: msgType });
        } else {
          fileSends.push({ msgType, media: payload, content: attachment.file.name });
        }
      }

      const tempId = clientTempId ?? crypto.randomUUID();
      let firstReplyToId = replyToId;
      let lastMessage = null;

      if (albumMedia.length > 1) {
        const msgType = albumMedia.some((m) => m.mime_type?.startsWith('video/'))
          ? 'video'
          : 'image';
        lastMessage = await sendMedia.mutateAsync({
          chatId,
          msgType,
          media: albumMedia,
          content: caption ?? undefined,
          replyToId: firstReplyToId,
          clientTempId: tempId,
        });
        firstReplyToId = undefined;
      } else if (albumMedia.length === 1) {
        const item = albumMedia[0];
        const msgType = item.mime_type?.startsWith('video/') ? 'video' : 'image';
        lastMessage = await sendMedia.mutateAsync({
          chatId,
          msgType,
          media: item,
          content: caption ?? undefined,
          replyToId: firstReplyToId,
          clientTempId: tempId,
        });
        firstReplyToId = undefined;
      }

      for (const fileSend of fileSends) {
        lastMessage = await sendMedia.mutateAsync({
          chatId,
          msgType: fileSend.msgType,
          media: fileSend.media,
          content: fileSend.content,
          replyToId: firstReplyToId,
          clientTempId: crypto.randomUUID(),
        });
        firstReplyToId = undefined;
      }

      return lastMessage;
    },
    onSuccess: (_message, { chatId }) => {
      clearPendingAttachments(chatId);
      clearDraft(chatId);
      clearReply();
    },
    onError: (err, { chatId }) => {
      setError(chatId, err instanceof Error ? err.message : 'Не удалось отправить вложения');
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
      setError(chatId, err instanceof Error ? err.message : 'Не удалось отправить голосовое');
    },
  });
}
