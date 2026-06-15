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
