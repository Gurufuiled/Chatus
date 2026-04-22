/**
 * ChatService - API for creating chats (createOrFindChat).
 * POST /chats with { chat_type: 'private', member_ids: [userId] }.
 */

import { apiDelete, apiGet, apiPatch, apiPost } from './apiClient';
import type { Chat } from '../stores/types';

/** API chat response (snake_case from server). */
interface ApiChat {
  id: string;
  chat_type: string;
  name: string | null;
  description?: string | null;
  avatar_url: string | null;
  visibility?: 'public' | 'private';
  access_type?: 'free' | 'paid';
  subscription_price_cents?: number | null;
  subscription_period_days?: number | null;
  linked_discussion_chat_id?: string | null;
  invite_token?: string | null;
  allow_comments?: boolean;
  allow_reactions?: boolean;
  preview_post_count?: number;
  subscriber_count?: number;
  active_subscriber_count?: number;
  access_status?: 'none' | 'pending' | 'active' | 'expired' | 'canceled';
  subscription_expires_at?: number | null;
  pending_earnings_cents?: number;
  available_payout_cents?: number;
  paid_out_cents?: number;
  created_by_id: string;
  last_message_id: string | null;
  pinned_message_id: string | null;
  last_message_at: number | null;
  last_message_preview: string | null;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  draft: string | null;
  created_at: number;
  updated_at: number;
  members?: {
    user_id: string;
    role?: string;
    tag?: string | null;
    tag_color?: string | null;
    joined_at?: number;
    user?: {
      id: string;
      username: string | null;
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
      is_online: boolean;
      last_seen: number | null;
    };
  }[];
  peer_display_name?: string | null;
}

function normalizeApiMember(
  member: NonNullable<ApiChat['members']>[number]
): NonNullable<ApiChat['members']>[number] {
  const loose = member as Record<string, unknown>;
  const tag = member.tag ?? (loose.tag as string | null | undefined) ?? null;
  const tag_color =
    member.tag_color ??
    (loose.tag_color as string | null | undefined) ??
    (loose.tagColor as string | null | undefined) ??
    null;
  return { ...member, tag, tag_color };
}

function mapApiChatToChat(api: ApiChat): Chat {
  return {
    id: api.id ?? '',
    chat_type: (api.chat_type ?? 'private') as 'private' | 'group' | 'channel' | 'discussion',
    name: api.name ?? null,
    description: api.description ?? null,
    avatar_url: api.avatar_url ?? null,
    visibility: api.visibility ?? 'public',
    access_type: api.access_type ?? 'free',
    subscription_price_cents: api.subscription_price_cents ?? null,
    subscription_period_days: api.subscription_period_days ?? null,
    linked_discussion_chat_id: api.linked_discussion_chat_id ?? null,
    invite_token: api.invite_token ?? null,
    allow_comments: api.allow_comments === false ? 0 : 1,
    allow_reactions: api.allow_reactions === false ? 0 : 1,
    preview_post_count: api.preview_post_count ?? 3,
    subscriber_count: api.subscriber_count ?? 0,
    active_subscriber_count: api.active_subscriber_count ?? 0,
    access_status: api.access_status ?? 'active',
    subscription_expires_at: api.subscription_expires_at ?? null,
    pending_earnings_cents: api.pending_earnings_cents ?? 0,
    available_payout_cents: api.available_payout_cents ?? 0,
    paid_out_cents: api.paid_out_cents ?? 0,
    created_by: api.created_by_id ?? null,
    last_message_id: api.last_message_id,
    pinned_message_id: api.pinned_message_id ?? null,
    last_message_at: api.last_message_at,
    last_message_preview: api.last_message_preview,
    unread_count: api.unread_count,
    is_muted: api.is_muted ? 1 : 0,
    is_pinned: api.is_pinned ? 1 : 0,
    is_archived: api.is_archived ? 1 : 0,
    draft: api.draft,
    created_at: api.created_at,
    updated_at: api.updated_at,
    members: api.members?.map(normalizeApiMember),
    peer_display_name: api.peer_display_name ?? null,
  };
}

/**
 * Create or find a private chat with the given user.
 * POST /chats { chat_type: 'private', member_ids: [userId] }.
 * Returns the Chat for the UI layer.
 */
export async function createOrFindChat(userId: string): Promise<Chat> {
  const res = await apiPost('/chats', {
    chat_type: 'private',
    member_ids: [userId],
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Failed to create chat: ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}

/**
 * Create a group chat with the given title and members.
 * POST /chats { chat_type: 'group', name, member_ids }.
 */
export async function createGroupChat(name: string, memberIds: string[]): Promise<Chat> {
  const trimmedName = name.trim();
  const normalizedMemberIds = [...new Set(memberIds.filter((id) => id.trim().length > 0))];

  const res = await apiPost('/chats', {
    chat_type: 'group',
    name: trimmedName,
    member_ids: normalizedMemberIds,
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Failed to create group: ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}

export async function getChatById(chatId: string): Promise<Chat> {
  const res = await apiGet(`/chats/${encodeURIComponent(chatId)}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to load chat: ${res.status}`);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}

export async function updateGroupChat(
  chatId: string,
  payload: { name?: string; description?: string; avatar_url?: string }
): Promise<Chat> {
  const res = await apiPatch(`/chats/${encodeURIComponent(chatId)}`, payload);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update group: ${res.status}`);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}

export async function addGroupMembers(chatId: string, memberIds: string[]): Promise<Chat> {
  const res = await apiPost(`/chats/${encodeURIComponent(chatId)}/members`, {
    member_ids: memberIds,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to add members: ${res.status}`);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}

export async function updateGroupMemberTag(
  chatId: string,
  memberId: string,
  payload: { tag: string; tag_color?: string | null }
): Promise<Chat> {
  const res = await apiPatch(
    `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(memberId)}`,
    payload
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update member tag: ${res.status}`);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}

export async function removeGroupMember(chatId: string, memberId: string): Promise<Chat> {
  const res = await apiDelete(
    `/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(memberId)}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to remove member: ${res.status}`);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}

export async function leaveGroup(chatId: string): Promise<void> {
  const res = await apiPost(`/chats/${encodeURIComponent(chatId)}/leave`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to leave group: ${res.status}`);
  }
}

export async function deleteGroup(chatId: string): Promise<void> {
  const res = await apiDelete(`/chats/${encodeURIComponent(chatId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to delete group: ${res.status}`);
  }
}
