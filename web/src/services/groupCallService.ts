import { apiRequest } from './apiClient';

export type ApiGroupCallRoom = {
  id: string;
  chat_id: string;
  livekit_room_name: string;
  started_by_user_id: string;
  started_at: number;
  participant_count: number;
};

export type ApiGroupCallParticipant = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_muted: boolean;
};

export type CreateGroupCallResponse = {
  room: ApiGroupCallRoom;
  token: string;
  livekit_url: string;
  room_name: string;
};

export type JoinGroupCallResponse = {
  token: string;
  livekit_url: string;
  room_name: string;
  room: ApiGroupCallRoom;
};

export function isGroupCallUnavailableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not found') ||
    lower.includes('already ended') ||
    lower.includes('не найден') ||
    lower.includes('group call not found') ||
    lower.includes('(404)')
  );
}

export async function fetchActiveGroupCall(
  chatId: string,
): Promise<ApiGroupCallRoom | null> {
  return apiRequest<ApiGroupCallRoom | null>(`/chats/${chatId}/group-calls/active`);
}

export async function createGroupCall(chatId: string): Promise<CreateGroupCallResponse> {
  return apiRequest<CreateGroupCallResponse>(`/chats/${chatId}/group-calls`, {
    method: 'POST',
  });
}

export async function joinGroupCall(roomId: string): Promise<JoinGroupCallResponse> {
  return apiRequest<JoinGroupCallResponse>(`/group-calls/${roomId}/join`, {
    method: 'POST',
  });
}

export async function leaveGroupCall(roomId: string): Promise<void> {
  await apiRequest<unknown>(`/group-calls/${roomId}/leave`, { method: 'POST' });
}

export async function endGroupCallForAll(roomId: string): Promise<void> {
  await apiRequest<unknown>(`/group-calls/${roomId}/end`, { method: 'POST' });
}
