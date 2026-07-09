import { apiRequest } from './apiClient';
import type { ChatSummary } from '@/types/chat';
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
