import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteChatForBoth,
  leaveChat,
  listChats,
  createOrFindPrivateChat,
} from '@/services/chatService';
import type { ChatSummary } from '@/types/chat';
import { useAuthUiStore } from '@/stores/authUiStore';

export const chatsQueryKey = ['chats'] as const;

function patchChatInList(
  chats: ChatSummary[] | undefined,
  chatId: string,
  patch: Partial<ChatSummary>,
): ChatSummary[] | undefined {
  if (!chats) return chats;
  return chats.map((chat) => (chat.id === chatId ? { ...chat, ...patch } : chat));
}

function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const aTime = a.last_message_at ?? a.updated_at ?? 0;
    const bTime = b.last_message_at ?? b.updated_at ?? 0;
    return bTime - aTime;
  });
}

export function useChatsQuery() {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');

  return useQuery({
    queryKey: chatsQueryKey,
    queryFn: listChats,
    enabled: ready,
    select: sortChats,
  });
}

export function useMuteChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, muted }: { chatId: string; muted: boolean }) => {
      // TODO: PATCH /chats/:id { is_muted } when backend endpoint exists
      return { chatId, muted };
    },
    onMutate: async ({ chatId, muted }) => {
      await queryClient.cancelQueries({ queryKey: chatsQueryKey });
      const previous = queryClient.getQueryData<ChatSummary[]>(chatsQueryKey);
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
        patchChatInList(old, chatId, { is_muted: muted }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(chatsQueryKey, context.previous);
      }
    },
  });
}

export function usePinChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, pinned }: { chatId: string; pinned: boolean }) => {
      // TODO: PATCH /chats/:id { is_pinned } when backend endpoint exists
      return { chatId, pinned };
    },
    onMutate: async ({ chatId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: chatsQueryKey });
      const previous = queryClient.getQueryData<ChatSummary[]>(chatsQueryKey);
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) => {
        const next = patchChatInList(old, chatId, { is_pinned: pinned });
        return next ? sortChats(next) : next;
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(chatsQueryKey, context.previous);
      }
    },
  });
}

export function useDeleteChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      scope,
    }: {
      chatId: string;
      scope: 'me' | 'all';
    }) => {
      if (scope === 'me') {
        return leaveChat(chatId);
      }
      return deleteChatForBoth(chatId);
    },
    onSuccess: (_data, { chatId }) => {
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
        old?.filter((chat) => chat.id !== chatId),
      );
    },
  });
}

export function useCreatePrivateChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => createOrFindPrivateChat(userId),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) => {
        if (!old) return sortChats([chat]);
        const exists = old.some((item) => item.id === chat.id);
        if (exists) {
          return sortChats(old.map((item) => (item.id === chat.id ? { ...item, ...chat } : item)));
        }
        return sortChats([chat, ...old]);
      });
    },
  });
}
