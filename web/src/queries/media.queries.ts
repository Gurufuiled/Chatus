import { useMutation } from '@tanstack/react-query';
import {
  buildMediaPayload,
  inferMsgTypeFromUpload,
  uploadFile,
  uploadVideoNoteBlob,
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

/** Bound concurrency for compress+upload to avoid mobile memory spikes. */
export const ATTACHMENT_UPLOAD_CONCURRENCY = 3;

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
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
  const removePendingAttachmentsByIds = useComposerStore((s) => s.removePendingAttachmentsByIds);
  const markPendingAttachmentUploaded = useComposerStore((s) => s.markPendingAttachmentUploaded);
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
      type PreparedItem = {
        attachmentId: string;
        msgType: MessageType;
        media: MessageMediaInput;
        bucket: 'album' | 'file';
        fileName: string;
      };

      // Parallel compress+upload (bounded) — serial awaits made multi-photo albums feel stuck.
      const prepared: PreparedItem[] = await mapPool(
        attachments,
        ATTACHMENT_UPLOAD_CONCURRENCY,
        async (attachment) => {
          let payload = attachment.uploadedMedia;
          let msgType = attachment.uploadedMsgType;
          if (!payload || !msgType) {
            const { upload, msgType: inferred } = await prepareAndUpload(attachment.file, {
              compressImages: !attachment.sendAsFile,
              sendAsFile: attachment.sendAsFile,
            });
            payload = buildMediaPayload(upload);
            msgType = inferred;
            markPendingAttachmentUploaded(chatId, attachment.id, payload, msgType);
          }

          if (attachment.sendAsFile || msgType === 'file') {
            return {
              attachmentId: attachment.id,
              msgType,
              media: payload,
              bucket: 'file' as const,
              fileName: attachment.file.name,
            };
          }
          if (msgType === 'image' || msgType === 'video') {
            return {
              attachmentId: attachment.id,
              msgType,
              media: { ...payload, media_type: msgType },
              bucket: 'album' as const,
              fileName: attachment.file.name,
            };
          }
          return {
            attachmentId: attachment.id,
            msgType,
            media: payload,
            bucket: 'file' as const,
            fileName: attachment.file.name,
          };
        },
      );

      const albumItems = prepared.filter((item) => item.bucket === 'album');
      const fileItems = prepared.filter((item) => item.bucket === 'file');
      const trimmedCaption = caption?.trim() || undefined;

      const tempId = clientTempId ?? crypto.randomUUID();
      let firstReplyToId = replyToId;
      let lastMessage = null;

      if (albumItems.length > 1) {
        const msgType = albumItems.some((m) => m.media.mime_type?.startsWith('video/'))
          ? 'video'
          : 'image';
        lastMessage = await sendMedia.mutateAsync({
          chatId,
          msgType,
          media: albumItems.map((item) => item.media),
          content: trimmedCaption,
          replyToId: firstReplyToId,
          clientTempId: tempId,
        });
        removePendingAttachmentsByIds(
          chatId,
          albumItems.map((item) => item.attachmentId),
        );
        firstReplyToId = undefined;
      } else if (albumItems.length === 1) {
        const item = albumItems[0];
        const msgType = item.media.mime_type?.startsWith('video/') ? 'video' : 'image';
        lastMessage = await sendMedia.mutateAsync({
          chatId,
          msgType,
          media: item.media,
          content: trimmedCaption,
          replyToId: firstReplyToId,
          clientTempId: tempId,
        });
        removePendingAttachmentsByIds(chatId, [item.attachmentId]);
        firstReplyToId = undefined;
      }

      for (let index = 0; index < fileItems.length; index++) {
        const fileSend = fileItems[index];
        const useCaption = index === 0 && albumItems.length === 0 && trimmedCaption;
        lastMessage = await sendMedia.mutateAsync({
          chatId,
          msgType: fileSend.msgType,
          media: fileSend.media,
          content: useCaption ? trimmedCaption : fileSend.fileName,
          replyToId: firstReplyToId,
          clientTempId: crypto.randomUUID(),
        });
        removePendingAttachmentsByIds(chatId, [fileSend.attachmentId]);
        firstReplyToId = undefined;
      }

      return lastMessage;
    },
    onSuccess: (_message, { chatId }) => {
      clearPendingAttachments(chatId);
      clearDraft(chatId);
      clearReply();
    },
    onError: (err, { chatId, attachments }) => {
      const remaining = useComposerStore.getState().pendingAttachments[chatId]?.length ?? 0;
      const sentCount = attachments.length - remaining;
      if (sentCount > 0 && sentCount < attachments.length) {
        setError(
          chatId,
          `Отправлено ${sentCount} из ${attachments.length}. Повторите отправку для оставшихся.`,
        );
        return;
      }
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

export function useUploadVideoNoteMutation() {
  const sendMedia = useSendMediaMessageMutation();
  const setError = useComposerStore((s) => s.setComposerError);
  const clearReply = useComposerStore((s) => s.clearReply);

  return useMutation({
    mutationFn: async ({
      chatId,
      blob,
      mimeType,
      replyToId,
      durationMs,
      thumbnailBlob,
    }: {
      chatId: string;
      blob: Blob;
      mimeType: string;
      replyToId?: string | null;
      durationMs?: number;
      thumbnailBlob?: Blob | null;
    }) => {
      const upload = await uploadVideoNoteBlob(blob, mimeType);
      let thumbnailUrl = upload.thumbnail_path ?? undefined;
      if (!thumbnailUrl && thumbnailBlob) {
        try {
          const thumbUpload = await uploadFile(
            new File([thumbnailBlob], 'video_note_thumb.jpg', { type: 'image/jpeg' }),
          );
          thumbnailUrl = thumbUpload.url;
        } catch {
          // Thumbnail is optional.
        }
      }
      return { upload, chatId, replyToId, durationMs, thumbnailUrl };
    },
    onSuccess: ({ upload, chatId, replyToId, durationMs, thumbnailUrl }) => {
      const media = {
        ...buildMediaPayload(upload),
        duration_ms: durationMs ?? upload.duration_ms ?? undefined,
        thumbnail_url: thumbnailUrl ?? upload.thumbnail_path ?? undefined,
        width: upload.width ?? 320,
        height: upload.height ?? 320,
      };
      sendMedia.mutate(
        {
          chatId,
          msgType: 'video_note',
          media,
          replyToId,
          clientTempId: crypto.randomUUID(),
        },
        { onSuccess: () => clearReply() },
      );
    },
    onError: (err, { chatId }) => {
      setError(chatId, err instanceof Error ? err.message : 'Не удалось отправить видеокружок');
    },
  });
}
