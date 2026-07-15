import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listMessages,
  markChatRead,
  sendMediaMessage,
  sendStickerMessage,
  sendTextMessage,
  type SendMediaMessageInput,
  type SendStickerMessageInput,
  type SendTextMessageInput,
} from '@/services/messageService';
import { pinChatMessage, unpinChatMessage } from '@/services/chatService';
import type { MappedMessage } from '@/types/message';
import { useAuthUiStore } from '@/stores/authUiStore';
import { chatsQueryKey } from '@/queries/chats.queries';
import type { ChatSummary } from '@/types/chat';
import { isTempMessageId, getOutgoingMessagePreview } from '@/features/conversation/messageFormatters';
import { meQueryKey } from '@/queries/auth.queries';
import type { AuthUser } from '@/types/auth';
import { encodeStickerPayload } from '@/utils/stickerPayload';
import { useComposerStore } from '@/stores/composerStore';
import { wsClient } from '@/ws/wsClient';
import { buildForwardPayload } from '@/utils/forwardPayload';

export const messagesQueryKey = (chatId: string) => ['messages', chatId] as const;

function sortMessagesAsc(messages: MappedMessage[]): MappedMessage[] {
  return [...messages].sort((a, b) => a.created_at - b.created_at);
}

export function useMessagesQuery(chatId: string | undefined) {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: messagesQueryKey(chatId ?? ''),
    queryFn: () => listMessages(chatId!),
    enabled: ready && !!chatId,
    select: sortMessagesAsc,
  });
}

function patchMessagesCache(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
  updater: (messages: MappedMessage[]) => MappedMessage[],
) {
  queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) => {
    const next = updater(old ?? []);
    return sortMessagesAsc(next);
  });
}

function updateChatLastMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
  message: MappedMessage,
) {
  queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) => {
    if (!old) return old;
    return old.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            last_message: message,
            last_message_id: message.id,
            last_message_at: message.created_at,
            last_message_preview: getOutgoingMessagePreview(message) || chat.last_message_preview,
          }
        : chat,
    );
  });
}

function createOptimisticMessage(
  me: AuthUser | undefined,
  chatId: string,
  tempId: string,
  fields: Pick<MappedMessage, 'msg_type' | 'content'> & {
    replyToId?: string | null;
    media?: MappedMessage['media'];
  },
): MappedMessage {
  return {
    id: `temp-${tempId}`,
    client_temp_id: tempId,
    chat_id: chatId,
    sender_id: me?.id ?? 'me',
    msg_type: fields.msg_type,
    content: fields.content,
    reply_to_id: fields.replyToId ?? null,
    is_deleted: false,
    status: 'sending',
    created_at: Date.now(),
    updated_at: Date.now(),
    media: fields.media,
  };
}

type OptimisticContext = {
  previous?: MappedMessage[];
  tempId: string;
  chatId: string;
};

function useOptimisticSendMutation<TInput extends { chatId: string; clientTempId?: string }>(
  mutationFn: (input: TInput) => Promise<MappedMessage>,
  buildOptimistic: (
    input: TInput,
    me: AuthUser | undefined,
    tempId: string,
  ) => Pick<MappedMessage, 'msg_type' | 'content'> & {
    replyToId?: string | null;
    media?: MappedMessage['media'];
  },
) {
  const queryClient = useQueryClient();
  const setError = useComposerStore((s) => s.setComposerError);

  return useMutation({
    mutationFn,
    onMutate: async (input) => {
      const tempId = input.clientTempId ?? crypto.randomUUID();
      await queryClient.cancelQueries({ queryKey: messagesQueryKey(input.chatId) });
      const previous = queryClient.getQueryData<MappedMessage[]>(
        messagesQueryKey(input.chatId),
      );
      const me = queryClient.getQueryData<AuthUser>(meQueryKey);
      const optimisticFields = buildOptimistic(input, me, tempId);
      const optimistic = createOptimisticMessage(me, input.chatId, tempId, optimisticFields);
      patchMessagesCache(queryClient, input.chatId, (messages) => [...messages, optimistic]);
      return { previous, tempId, chatId: input.chatId } satisfies OptimisticContext;
    },
    onSuccess: (message, input, context) => {
      const tempId = context?.tempId ?? input.clientTempId;
      patchMessagesCache(queryClient, input.chatId, (messages) =>
        messages.map((m) =>
          tempId && (m.id === `temp-${tempId}` || m.id === tempId) ? message : m,
        ),
      );
      updateChatLastMessage(queryClient, input.chatId, message);
    },
    onError: (err, input, context) => {
      const tempId = context?.tempId ?? input.clientTempId;
      if (tempId) {
        patchMessagesCache(queryClient, input.chatId, (messages) =>
          messages.map((m) =>
            m.id === `temp-${tempId}` ? { ...m, status: 'error' as const } : m,
          ),
        );
      }
      setError(input.chatId, err instanceof Error ? err.message : 'Failed to send message');
    },
  });
}

export function useSendMessageMutation() {
  return useOptimisticSendMutation<SendTextMessageInput>(sendTextMessage, (input) => ({
    msg_type: 'text',
    content: input.text,
    replyToId: input.replyToId,
  }));
}

export function useSendStickerMessageMutation() {
  return useOptimisticSendMutation<SendStickerMessageInput>(sendStickerMessage, (input) => ({
    msg_type: 'text',
    content: encodeStickerPayload({ packId: input.packId, stickerId: input.stickerId }),
    replyToId: input.replyToId,
  }));
}

export function useSendMediaMessageMutation() {
  return useOptimisticSendMutation<SendMediaMessageInput>(sendMediaMessage, (input, _me, tempId) => {
    const mediaItems = Array.isArray(input.media) ? input.media : [input.media];
    const content =
      input.content?.trim() ||
      (input.msgType === 'file'
        ? (mediaItems[0]?.file_name ?? 'File')
        : input.msgType === 'image'
          ? mediaItems.length > 1
            ? `${mediaItems.length} media`
            : 'Photo'
          : input.msgType === 'voice'
            ? 'Voice message'
            : input.msgType === 'video' || input.msgType === 'video_note'
              ? 'Video'
              : 'Message');

    const media = mediaItems[0]?.url
      ? mediaItems.map((item, index) => ({
          id: `temp-media-${tempId}-${index}`,
          message_id: `temp-${tempId}`,
          media_type: item.mime_type?.startsWith('video/') ? 'video' : input.msgType,
          file_name: item.file_name ?? null,
          mime_type: item.mime_type ?? null,
          file_size: item.file_size ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          duration_ms: item.duration_ms ?? null,
          remote_url: item.url ?? null,
          thumbnail_url: item.thumbnail_url ?? null,
          waveform: null,
          is_round: input.msgType === 'video_note',
          created_at: Date.now(),
        }))
      : undefined;

    return {
      msg_type: input.msgType,
      content,
      replyToId: input.replyToId,
      media,
    };
  });
}

export function useToggleReactionMutation() {
  const queryClient = useQueryClient();
  const setError = useComposerStore((s) => s.setComposerError);

  return useMutation({
    mutationFn: async ({
      chatId,
      messageId,
      emoji,
    }: {
      chatId: string;
      messageId: string;
      emoji: string;
    }) => {
      const sent = wsClient.toggleReaction(chatId, messageId, emoji);
      if (!sent) {
        throw new Error('WebSocket не подключён (реакции требуют WS)');
      }
      await wsClient.waitForReactionUpdate(messageId);
      return { chatId, messageId, emoji };
    },
    onMutate: async ({ chatId, messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey(chatId) });
      const previous = queryClient.getQueryData<MappedMessage[]>(messagesQueryKey(chatId));

      queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) =>
        old?.map((message) => {
          if (message.id !== messageId) return message;
          const reactions = [...(message.reactions ?? [])];
          const existingIdx = reactions.findIndex((r) => r.emoji === emoji);
          const mineIdx = reactions.findIndex((r) => r.reacted_by_me);

          if (existingIdx >= 0 && reactions[existingIdx].reacted_by_me) {
            const next = reactions[existingIdx];
            if (next.count <= 1) reactions.splice(existingIdx, 1);
            else reactions[existingIdx] = { ...next, count: next.count - 1, reacted_by_me: false };
          } else if (mineIdx >= 0 && mineIdx !== existingIdx) {
            const prev = reactions[mineIdx];
            if (prev.count <= 1) reactions.splice(mineIdx, 1);
            else reactions[mineIdx] = { ...prev, count: prev.count - 1, reacted_by_me: false };
            if (existingIdx >= 0) {
              reactions[existingIdx] = {
                ...reactions[existingIdx],
                count: reactions[existingIdx].count + 1,
                reacted_by_me: true,
              };
            } else {
              reactions.push({ emoji, count: 1, reacted_by_me: true });
            }
          } else if (existingIdx >= 0) {
            reactions[existingIdx] = {
              ...reactions[existingIdx],
              count: reactions[existingIdx].count + 1,
              reacted_by_me: true,
            };
          } else {
            reactions.push({ emoji, count: 1, reacted_by_me: true });
          }

          return { ...message, reactions };
        }),
      );

      return { previous, chatId };
    },
    onError: (err, { chatId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesQueryKey(chatId), context.previous);
      }
      setError(chatId, err instanceof Error ? err.message : 'Не удалось поставить реакцию');
    },
  });
}

export function useMarkChatReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chatId: string) => markChatRead(chatId),
    onSuccess: (_data, chatId) => {
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
        old?.map((chat) =>
          chat.id === chatId ? { ...chat, unread_count: 0 } : chat,
        ),
      );
    },
  });
}

export function removeTempMessages(messages: MappedMessage[]): MappedMessage[] {
  return messages.filter((m) => !isTempMessageId(m.id));
}

export function usePinMessageMutation() {
  const queryClient = useQueryClient();
  const setError = useComposerStore((s) => s.setComposerError);

  return useMutation({
    mutationFn: async ({
      chatId,
      messageId,
      notify = true,
    }: {
      chatId: string;
      messageId: string | null;
      /** When pinning: true = notify members (Telegram default). */
      notify?: boolean;
    }) => {
      if (messageId) {
        await pinChatMessage(chatId, messageId, notify);
      } else {
        await unpinChatMessage(chatId);
      }
      return { chatId, messageId };
    },
    onMutate: async ({ chatId, messageId }) => {
      await queryClient.cancelQueries({ queryKey: chatsQueryKey });
      const previous = queryClient.getQueryData<ChatSummary[]>(chatsQueryKey);
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
        old?.map((chat) =>
          chat.id === chatId ? { ...chat, pinned_message_id: messageId } : chat,
        ),
      );
      return { previous };
    },
    onError: (err, { chatId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(chatsQueryKey, context.previous);
      }
      setError(chatId, err instanceof Error ? err.message : 'Failed to pin message');
    },
  });
}

export function useDeleteMessageMutation() {
  const queryClient = useQueryClient();
  const setError = useComposerStore((s) => s.setComposerError);

  return useMutation({
    mutationFn: async ({
      chatId,
      messageId,
      scope,
    }: {
      chatId: string;
      messageId: string;
      scope: 'me' | 'all';
    }) => {
      if (scope === 'me') {
        // API gap: server has no per-user message delete; hide locally only.
        return { chatId, messageId, scope };
      }
      const sent = wsClient.deleteMessage(chatId, messageId);
      if (!sent) {
        throw new Error('WebSocket is not connected (delete requires WS)');
      }
      return { chatId, messageId, scope };
    },
    onMutate: async ({ chatId, messageId, scope }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey(chatId) });
      const previous = queryClient.getQueryData<MappedMessage[]>(
        messagesQueryKey(chatId),
      );
      if (scope === 'me') {
        queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) =>
          old?.filter((m) => m.id !== messageId),
        );
      } else {
        queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) =>
          old?.map((m) =>
            m.id === messageId ? { ...m, is_deleted: true, content: null } : m,
          ),
        );
      }
      return { previous, chatId };
    },
    onError: (err, { chatId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesQueryKey(chatId), context.previous);
      }
      setError(chatId, err instanceof Error ? err.message : 'Failed to delete message');
    },
  });
}

export function useForwardMessagesMutation() {
  const queryClient = useQueryClient();
  const setError = useComposerStore((s) => s.setComposerError);

  return useMutation({
    mutationFn: async ({
      sourceChatId,
      targetChatIds,
      targetChatId,
      messageIds,
      caption,
    }: {
      sourceChatId: string;
      /** Preferred: forward into one or many chats. */
      targetChatIds?: string[];
      /** @deprecated use targetChatIds */
      targetChatId?: string;
      messageIds: string[];
      caption?: string;
    }) => {
      const targets = [
        ...new Set(
          (targetChatIds?.length ? targetChatIds : targetChatId ? [targetChatId] : []).filter(
            Boolean,
          ),
        ),
      ];
      if (targets.length === 0) {
        throw new Error('No target chats selected');
      }

      const sourceMessages =
        queryClient.getQueryData<MappedMessage[]>(messagesQueryKey(sourceChatId)) ?? [];
      const toForward = messageIds
        .map((id) => sourceMessages.find((m) => m.id === id))
        .filter((m): m is MappedMessage => !!m);

      if (toForward.length === 0) {
        throw new Error('Messages not found');
      }

      let sentCount = 0;
      for (const chatId of targets) {
        let forwardedInChat = 0;
        for (const message of toForward) {
          const payload = buildForwardPayload(message);
          if (!payload) continue;

          const sent = wsClient.forwardMessage(chatId, {
            ...payload,
            client_temp_id: crypto.randomUUID(),
          });
          if (!sent) {
            throw new Error('WebSocket is not connected (forward requires WS)');
          }
          sentCount += 1;
          forwardedInChat += 1;
        }

        const trimmedCaption = caption?.trim();
        if (trimmedCaption && forwardedInChat > 0) {
          const captionSent = wsClient.sendEvent('send_message', {
            chat_id: chatId,
            content: trimmedCaption,
            msg_type: 'text',
            client_temp_id: crypto.randomUUID(),
            relay_mailbox: true,
          });
          if (!captionSent) {
            throw new Error('WebSocket is not connected (forward requires WS)');
          }
        }
      }

      if (sentCount === 0) {
        throw new Error('These messages cannot be forwarded');
      }

      return { targetChatIds: targets, count: sentCount };
    },
    onError: (err, { sourceChatId }) => {
      setError(
        sourceChatId,
        err instanceof Error ? err.message : 'Failed to forward message',
      );
    },
  });
}
