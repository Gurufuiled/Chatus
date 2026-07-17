import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteChatForBoth,
  leaveChat,
  listChats,
  createOrFindPrivateChat,
  createGroupChat,
  updateGroupChat,
  updateGroupMemberTag,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  getGroupSettings,
  updateGroupSettings,
  updateGroupAdmin,
  regenerateGroupInviteLink,
  revokeGroupInviteLink,
  getGroupInviteLink,
  joinGroupByInvite,
  resolveGroupInvite,
} from '@/services/chatService';
import { createChannel } from '@/services/channelService';
import type { ChatSummary } from '@/types/chat';
import type {
  GroupChatSettings,
  GroupChatSettingsPatch,
  UpdateGroupAdminPayload,
} from '@/types/groupSettings';
import { defaultGroupSettings } from '@/types/groupSettings';
import { ApiError } from '@/services/apiClient';
import { useAuthUiStore } from '@/stores/authUiStore';

export const chatsQueryKey = ['chats'] as const;

export const groupSettingsQueryKey = (chatId: string) =>
  ['chats', chatId, 'settings'] as const;

export const groupInviteQueryKey = (chatId: string) =>
  ['chats', chatId, 'invite-link'] as const;

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

function upsertChatInCache(queryClient: ReturnType<typeof useQueryClient>, chat: ChatSummary) {
  queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) => {
    if (!old) return sortChats([chat]);
    const exists = old.some((item) => item.id === chat.id);
    if (exists) {
      return sortChats(old.map((item) => (item.id === chat.id ? { ...item, ...chat } : item)));
    }
    return sortChats([chat, ...old]);
  });
}

export function useCreateGroupChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, memberIds }: { name: string; memberIds: string[] }) =>
      createGroupChat(name, memberIds),
    onSuccess: (chat) => upsertChatInCache(queryClient, chat),
  });
}

export function useCreateChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createChannel,
    onSuccess: (chat) => upsertChatInCache(queryClient, chat),
  });
}

export function useUpdateGroupChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      chatId,
      ...payload
    }: {
      chatId: string;
      name?: string;
      description?: string;
      avatar_url?: string;
    }) => updateGroupChat(chatId, payload),
    onSuccess: (chat) => upsertChatInCache(queryClient, chat),
  });
}

export function useUpdateGroupMemberTagMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      chatId,
      memberId,
      tag,
      tag_color,
    }: {
      chatId: string;
      memberId: string;
      tag: string;
      tag_color?: string | null;
    }) => updateGroupMemberTag(chatId, memberId, { tag, tag_color }),
    onSuccess: (chat) => upsertChatInCache(queryClient, chat),
  });
}

export function useAddGroupMembersMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, memberIds }: { chatId: string; memberIds: string[] }) =>
      addGroupMembers(chatId, memberIds),
    onSuccess: (chat) => upsertChatInCache(queryClient, chat),
  });
}

export function useRemoveGroupMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, memberId }: { chatId: string; memberId: string }) =>
      removeGroupMember(chatId, memberId),
    onSuccess: (chat) => upsertChatInCache(queryClient, chat),
  });
}

export function useLeaveGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chatId: string) => leaveGroup(chatId),
    onSuccess: (_data, chatId) => {
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
        old?.filter((chat) => chat.id !== chatId),
      );
    },
  });
}

function isMissingEndpoint(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 501) return true;
  // Nest missing-route 404s look like "Cannot GET /api/..."; resource 404s use domain messages.
  if (error.status === 404) {
    return /^Cannot (GET|POST|PATCH|DELETE)\b/i.test(error.message);
  }
  return false;
}

export { isMissingEndpoint };

export function useGroupSettingsQuery(chatId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: groupSettingsQueryKey(chatId ?? ''),
    queryFn: () => getGroupSettings(chatId!),
    enabled: Boolean(chatId) && enabled,
    retry: (failureCount, error) => {
      if (isMissingEndpoint(error)) return false;
      return failureCount < 2;
    },
    placeholderData: chatId ? defaultGroupSettings(chatId) : undefined,
  });
}

export function useUpdateGroupSettingsMutation(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: GroupChatSettingsPatch) => updateGroupSettings(chatId, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: groupSettingsQueryKey(chatId) });
      await queryClient.cancelQueries({ queryKey: chatsQueryKey });
      const previousSettings = queryClient.getQueryData<GroupChatSettings>(
        groupSettingsQueryKey(chatId),
      );
      const previousChats = queryClient.getQueryData<ChatSummary[]>(chatsQueryKey);
      if (previousSettings) {
        queryClient.setQueryData<GroupChatSettings>(groupSettingsQueryKey(chatId), {
          ...previousSettings,
          ...patch,
          member_permissions: {
            ...previousSettings.member_permissions,
            ...(patch.member_permissions ?? {}),
          },
        });
      }
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) => {
        const chatPatch: Partial<ChatSummary> = {};
        if (patch.hide_members !== undefined) chatPatch.hide_members = patch.hide_members;
        if (patch.restrict_saving_content !== undefined) {
          chatPatch.restrict_saving_content = patch.restrict_saving_content;
        }
        if (patch.visibility !== undefined) chatPatch.visibility = patch.visibility;
        if (patch.member_permissions !== undefined) {
          chatPatch.member_permissions = {
            ...(old?.find((c) => c.id === chatId)?.member_permissions ?? {}),
            ...patch.member_permissions,
          };
        }
        return patchChatInList(old, chatId, chatPatch);
      });
      return { previousSettings, previousChats };
    },
    onError: (_err, _patch, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(groupSettingsQueryKey(chatId), context.previousSettings);
      }
      if (context?.previousChats) {
        queryClient.setQueryData(chatsQueryKey, context.previousChats);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(groupSettingsQueryKey(chatId), data);
      queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
        patchChatInList(old, chatId, {
          hide_members: data.hide_members,
          restrict_saving_content: data.restrict_saving_content,
          visibility: data.visibility as ChatSummary['visibility'],
          member_permissions: data.member_permissions,
          my_permissions: data.my_permissions,
          invite_token: data.invite_token,
        }),
      );
    },
  });
}

export function useGroupInviteLinkQuery(chatId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: groupInviteQueryKey(chatId ?? ''),
    queryFn: () => getGroupInviteLink(chatId!),
    enabled: Boolean(chatId) && enabled,
    retry: (failureCount, error) => {
      if (isMissingEndpoint(error)) return false;
      return failureCount < 2;
    },
  });
}

export function useUpdateGroupAdminMutation(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      payload,
    }: {
      memberId: string;
      payload: UpdateGroupAdminPayload;
    }) => updateGroupAdmin(chatId, memberId, payload),
    onSuccess: (chat) => {
      upsertChatInCache(queryClient, chat);
      void queryClient.invalidateQueries({ queryKey: groupSettingsQueryKey(chatId) });
    },
  });
}

export function useRegenerateGroupInviteMutation(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => regenerateGroupInviteLink(chatId),
    onSuccess: (result) => {
      queryClient.setQueryData(groupInviteQueryKey(chatId), result);
      queryClient.setQueryData<GroupChatSettings>(groupSettingsQueryKey(chatId), (old) =>
        old ? { ...old, invite_token: result.invite_token } : old,
      );
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}

export function useRevokeGroupInviteMutation(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => revokeGroupInviteLink(chatId),
    onSuccess: (result) => {
      queryClient.setQueryData(groupInviteQueryKey(chatId), result);
      queryClient.setQueryData<GroupChatSettings>(groupSettingsQueryKey(chatId), (old) =>
        old ? { ...old, invite_token: result.invite_token } : old,
      );
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}

export function useResolveGroupInviteQuery(token: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['chats', 'invite', token ?? ''] as const,
    queryFn: () => resolveGroupInvite(token!),
    enabled: Boolean(token?.trim()) && enabled,
    retry: false,
  });
}

export function useJoinGroupByInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteToken: string) => joinGroupByInvite(inviteToken),
    onSuccess: (chat) => upsertChatInCache(queryClient, chat),
  });
}
