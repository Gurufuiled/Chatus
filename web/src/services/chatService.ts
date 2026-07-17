import { apiRequest } from './apiClient';
import type { ChatSummary } from '@/types/chat';
import type {
  GroupChatSettings,
  GroupChatSettingsPatch,
  GroupInviteLinkResult,
  UpdateGroupAdminPayload,
} from '@/types/groupSettings';
import { getPreviewChats, isUiPreviewMode } from '@/dev/uiPreview';

export async function listChats(): Promise<ChatSummary[]> {
  if (isUiPreviewMode()) return getPreviewChats();
  return apiRequest<ChatSummary[]>('/chats');
}

export async function deleteChatForBoth(chatId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
}

export async function leaveChat(chatId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/chats/${encodeURIComponent(chatId)}/leave`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function createOrFindPrivateChat(userId: string): Promise<ChatSummary> {
  return apiRequest<ChatSummary>('/chats', {
    method: 'POST',
    body: JSON.stringify({
      chat_type: 'private',
      member_ids: [userId],
    }),
  });
}

export async function createGroupChat(name: string, memberIds: string[]): Promise<ChatSummary> {
  const trimmedName = name.trim();
  const normalizedMemberIds = [...new Set(memberIds.filter((id) => id.trim().length > 0))];
  return apiRequest<ChatSummary>('/chats', {
    method: 'POST',
    body: JSON.stringify({
      chat_type: 'group',
      name: trimmedName,
      member_ids: normalizedMemberIds,
    }),
  });
}

export async function updateGroupChat(
  chatId: string,
  payload: { name?: string; description?: string; avatar_url?: string },
): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateGroupMemberTag(
  chatId: string,
  memberId: string,
  payload: { tag: string; tag_color?: string | null },
): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(
    `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function addGroupMembers(chatId: string, memberIds: string[]): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(`/chats/${encodeURIComponent(chatId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ member_ids: memberIds }),
  });
}

export async function removeGroupMember(chatId: string, memberId: string): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(
    `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' },
  );
}

export async function leaveGroup(chatId: string): Promise<void> {
  await apiRequest<unknown>(`/chats/${encodeURIComponent(chatId)}/leave`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** POST /chats/:id/pin — { message_id, notify? } */
export async function pinChatMessage(
  chatId: string,
  messageId: string,
  notify = true,
): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(`/chats/${encodeURIComponent(chatId)}/pin`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId, notify }),
  });
}

/** DELETE /chats/:id/pin */
export async function unpinChatMessage(chatId: string): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(`/chats/${encodeURIComponent(chatId)}/pin`, {
    method: 'DELETE',
  });
}

/** GET /chats/:id/settings — group member permissions + invite metadata. */
export async function getGroupSettings(chatId: string): Promise<GroupChatSettings> {
  return apiRequest<GroupChatSettings>(`/chats/${encodeURIComponent(chatId)}/settings`);
}

/** PATCH /chats/:id/settings */
export async function updateGroupSettings(
  chatId: string,
  patch: GroupChatSettingsPatch,
): Promise<GroupChatSettings> {
  return apiRequest<GroupChatSettings>(`/chats/${encodeURIComponent(chatId)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** GET /chats/:id/invite-link */
export async function getGroupInviteLink(chatId: string): Promise<GroupInviteLinkResult> {
  return apiRequest<GroupInviteLinkResult>(
    `/chats/${encodeURIComponent(chatId)}/invite-link`,
  );
}

/** POST /chats/:id/invite-link/recreate */
export async function regenerateGroupInviteLink(
  chatId: string,
): Promise<GroupInviteLinkResult> {
  return apiRequest<GroupInviteLinkResult>(
    `/chats/${encodeURIComponent(chatId)}/invite-link/recreate`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

/** POST /chats/:id/invite-link/revoke */
export async function revokeGroupInviteLink(
  chatId: string,
): Promise<GroupInviteLinkResult> {
  return apiRequest<GroupInviteLinkResult>(
    `/chats/${encodeURIComponent(chatId)}/invite-link/revoke`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

/**
 * PATCH /chats/:id/members/:memberId/admin
 * Promote (`role: 'admin'`), demote (`role: 'member'`), or edit admin flags.
 */
export async function updateGroupAdmin(
  chatId: string,
  memberId: string,
  payload: UpdateGroupAdminPayload,
): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(
    `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(memberId)}/admin`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export type GroupInvitePreview = {
  chat_id: string;
  name: string | null;
  avatar_url: string | null;
  member_count: number;
};

/** GET /chats/invite/:token — preview before join. */
export async function resolveGroupInvite(token: string): Promise<GroupInvitePreview> {
  return apiRequest<GroupInvitePreview>(
    `/chats/invite/${encodeURIComponent(token.trim())}`,
  );
}

/** POST /chats/join — { invite_token }. Returns the joined (or already-member) chat. */
export async function joinGroupByInvite(inviteToken: string): Promise<ChatSummary> {
  return apiRequest<ChatSummary>('/chats/join', {
    method: 'POST',
    body: JSON.stringify({ invite_token: inviteToken.trim() }),
  });
}
