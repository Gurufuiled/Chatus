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

function parseApiErrorMessage(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed) as { message?: string | string[] };
    const message = parsed.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    // plain text error body
  }
  return trimmed;
}

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

async function readJsonBody<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Некорректный ответ сервера');
  }
}

export async function fetchActiveGroupCall(
  chatId: string,
): Promise<ApiGroupCallRoom | null> {
  const res = await apiGet(`/chats/${chatId}/group-calls/active`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      parseApiErrorMessage(text, `Failed to load active group call (${res.status})`),
    );
  }
  const data = await readJsonBody<ApiGroupCallRoom | null>(res);
  return data;
}

export async function createGroupCall(chatId: string): Promise<CreateGroupCallResponse> {
  const res = await apiPost(`/chats/${chatId}/group-calls`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(text, `Failed to create group call (${res.status})`));
  }
  const data = await readJsonBody<CreateGroupCallResponse>(res);
  if (!data) {
    throw new Error('Пустой ответ сервера при создании звонка');
  }
  return data;
}

export async function joinGroupCall(roomId: string): Promise<JoinGroupCallResponse> {
  const res = await apiPost(`/group-calls/${roomId}/join`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(text, `Failed to join group call (${res.status})`));
  }
  const data = await readJsonBody<JoinGroupCallResponse>(res);
  if (!data) {
    throw new Error('Пустой ответ сервера при подключении к звонку');
  }
  return data;
}

export async function leaveGroupCall(roomId: string): Promise<void> {
  const res = await apiPost(`/group-calls/${roomId}/leave`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(text, `Failed to leave group call (${res.status})`));
  }
}

export async function endGroupCallForAll(roomId: string): Promise<void> {
  const res = await apiPost(`/group-calls/${roomId}/end`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(text, `Failed to end group call (${res.status})`));
  }
}
