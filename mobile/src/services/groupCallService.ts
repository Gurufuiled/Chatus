import { apiGet, apiPost } from './apiClient';

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

export async function fetchActiveGroupCall(
  chatId: string,
): Promise<ApiGroupCallRoom | null> {
  const res = await apiGet(`/chats/${chatId}/group-calls/active`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to load active group call (${res.status})`);
  }
  const data = (await res.json()) as ApiGroupCallRoom | null;
  return data;
}

export async function createGroupCall(chatId: string): Promise<CreateGroupCallResponse> {
  const res = await apiPost(`/chats/${chatId}/group-calls`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to create group call (${res.status})`);
  }
  return res.json() as Promise<CreateGroupCallResponse>;
}

export async function joinGroupCall(roomId: string): Promise<JoinGroupCallResponse> {
  const res = await apiPost(`/group-calls/${roomId}/join`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to join group call (${res.status})`);
  }
  return res.json() as Promise<JoinGroupCallResponse>;
}

export async function leaveGroupCall(roomId: string): Promise<void> {
  const res = await apiPost(`/group-calls/${roomId}/leave`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to leave group call (${res.status})`);
  }
}

export async function endGroupCallForAll(roomId: string): Promise<void> {
  const res = await apiPost(`/group-calls/${roomId}/end`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to end group call (${res.status})`);
  }
}
