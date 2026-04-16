import { apiDelete, apiGet, apiPatch, apiPost } from './apiClient';
import type { Chat, Message } from '../stores/types';
import { decodeServerWaveform } from './waveformTransport';
import type { ChannelDetail } from '../stores/channelStore';

export type ChannelPermissions = {
  can_post: boolean;
  can_manage_admins: boolean;
  can_edit_channel: boolean;
  can_moderate_subscribers: boolean;
  can_edit_channel_avatar: boolean;
  can_edit_channel_name: boolean;
  can_edit_channel_description: boolean;
  can_add_admins: boolean;
  can_remove_admins: boolean;
  can_edit_admin_permissions: boolean;
};

type ApiChatMember = {
  user_id: string;
  role?: string;
  access_status?: 'none' | 'pending' | 'active' | 'expired' | 'canceled';
  subscription_expires_at?: number | null;
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
};

type ApiChannelMemberListItem = {
  user_id: string;
  role: 'owner' | 'admin' | 'member' | string;
  access_status: 'none' | 'pending' | 'active' | 'expired' | 'canceled' | string;
  subscription_expires_at: number | null;
  joined_at: number;
  permissions?: Partial<ChannelPermissions>;
  is_banned?: boolean;
  user?: {
    id: string;
    username: string | null;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean;
    last_seen: number | null;
  };
};

type ApiChannelMemberListResponse = {
  items: ApiChannelMemberListItem[];
  next_cursor: string | null;
};

type ApiChat = {
  id: string;
  chat_type: 'channel' | 'discussion' | 'group' | 'private';
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
  disable_comments_new?: boolean;
  disable_comments_all?: boolean;
  disable_voice_comments?: boolean;
  disable_media_comments?: boolean;
  comment_cooldown_sec?: number;
  slug?: string | null;
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
  members?: ApiChatMember[];
  peer_display_name?: string | null;
  can_view_full_feed?: boolean;
  can_comment?: boolean;
  can_react?: boolean;
  can_post?: boolean;
  is_subscribed?: boolean;
  channel_permissions?: Partial<ChannelPermissions>;
};

type ApiReaction = {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
};

type ApiMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name?: string | null;
  sender_avatar_url?: string | null;
  msg_type: string;
  content: string | null;
  reply_to_id?: string | null;
  thread_root_message_id?: string | null;
  is_channel_post?: boolean;
  view_count?: number;
  comment_count?: number;
  is_edited?: boolean | number;
  is_deleted?: boolean | number;
  status: string;
  transport?: string | null;
  created_at: number;
  updated_at: number;
  media?: {
    duration_ms?: number | null;
    waveform?: string | null;
    remote_url?: string | null;
    thumbnail_url?: string | null;
    width?: number | null;
    height?: number | null;
    file_name?: string | null;
    file_size?: number | null;
    is_round?: boolean;
  }[];
  reactions?: ApiReaction[];
};

type ApiChannelDetail = ApiChat & {
  preview_posts: ApiMessage[];
};

type ApiDiscussionResponse = {
  channel: ApiChat;
  discussion_chat_id: string;
  thread_root_message_id: string;
  can_comment: boolean;
  post: ApiMessage | null;
  messages: ApiMessage[];
};

export type ChannelMemberItem = {
  user_id: string;
  role: string;
  access_status: string;
  subscription_expires_at: number | null;
  joined_at: number;
  permissions: ChannelPermissions;
  is_banned: boolean;
  user?: {
    id: string;
    username: string | null;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean;
    last_seen: number | null;
  };
};

function mapApiChannelMember(item: ApiChannelMemberListItem): ChannelMemberItem {
  return {
    user_id: item.user_id,
    role: item.role,
    access_status: item.access_status,
    subscription_expires_at: item.subscription_expires_at ?? null,
    joined_at: item.joined_at,
    permissions: {
      can_post: item.permissions?.can_post !== false,
      can_manage_admins: item.permissions?.can_manage_admins !== false,
      can_edit_channel: item.permissions?.can_edit_channel !== false,
      can_moderate_subscribers: item.permissions?.can_moderate_subscribers !== false,
      can_edit_channel_avatar: item.permissions?.can_edit_channel_avatar !== false,
      can_edit_channel_name: item.permissions?.can_edit_channel_name !== false,
      can_edit_channel_description: item.permissions?.can_edit_channel_description !== false,
      can_add_admins: item.permissions?.can_add_admins !== false,
      can_remove_admins: item.permissions?.can_remove_admins !== false,
      can_edit_admin_permissions: item.permissions?.can_edit_admin_permissions !== false,
    },
    is_banned: item.is_banned === true,
    user: item.user,
  };
}

function mapApiChatToChat(api: ApiChat): Chat {
  return {
    id: api.id,
    chat_type: api.chat_type,
    name: api.name,
    description: api.description ?? null,
    avatar_url: api.avatar_url,
    visibility: api.visibility ?? 'public',
    access_type: api.access_type ?? 'free',
    subscription_price_cents: api.subscription_price_cents ?? null,
    subscription_period_days: api.subscription_period_days ?? null,
    linked_discussion_chat_id: api.linked_discussion_chat_id ?? null,
    invite_token: api.invite_token ?? null,
    allow_comments: api.allow_comments === false ? 0 : 1,
    allow_reactions: api.allow_reactions === false ? 0 : 1,
    disable_comments_new: api.disable_comments_new ? 1 : 0,
    disable_comments_all: api.disable_comments_all ? 1 : 0,
    disable_voice_comments: api.disable_voice_comments ? 1 : 0,
    disable_media_comments: api.disable_media_comments ? 1 : 0,
    comment_cooldown_sec: api.comment_cooldown_sec ?? 0,
    slug: api.slug ?? null,
    preview_post_count: api.preview_post_count ?? 3,
    subscriber_count: api.subscriber_count ?? 0,
    active_subscriber_count: api.active_subscriber_count ?? 0,
    access_status: api.access_status ?? 'none',
    subscription_expires_at: api.subscription_expires_at ?? null,
    pending_earnings_cents: api.pending_earnings_cents ?? 0,
    available_payout_cents: api.available_payout_cents ?? 0,
    paid_out_cents: api.paid_out_cents ?? 0,
    created_by: api.created_by_id ?? null,
    last_message_id: api.last_message_id ?? null,
    pinned_message_id: api.pinned_message_id ?? null,
    last_message_at: api.last_message_at ?? null,
    last_message_preview: api.last_message_preview ?? null,
    unread_count: api.unread_count ?? 0,
    is_muted: api.is_muted ? 1 : 0,
    is_pinned: api.is_pinned ? 1 : 0,
    is_archived: api.is_archived ? 1 : 0,
    draft: api.draft ?? null,
    created_at: api.created_at,
    updated_at: api.updated_at,
    peer_display_name: api.peer_display_name ?? null,
    channel_permissions: api.channel_permissions
      ? {
          can_post: api.channel_permissions.can_post !== false,
          can_manage_admins: api.channel_permissions.can_manage_admins !== false,
          can_edit_channel: api.channel_permissions.can_edit_channel !== false,
          can_moderate_subscribers:
            api.channel_permissions.can_moderate_subscribers !== false,
          can_edit_channel_avatar:
            api.channel_permissions.can_edit_channel_avatar !== false,
          can_edit_channel_name:
            api.channel_permissions.can_edit_channel_name !== false,
          can_edit_channel_description:
            api.channel_permissions.can_edit_channel_description !== false,
          can_add_admins: api.channel_permissions.can_add_admins !== false,
          can_remove_admins: api.channel_permissions.can_remove_admins !== false,
          can_edit_admin_permissions:
            api.channel_permissions.can_edit_admin_permissions !== false,
        }
      : undefined,
    members: api.members,
  };
}

export function mapApiMessageToMessage(api: ApiMessage): Message {
  return {
    id: api.id,
    chat_id: api.chat_id,
    sender_id: api.sender_id,
    sender_name: api.sender_name ?? null,
    sender_avatar_url: api.sender_avatar_url ?? null,
    msg_type: api.msg_type,
    content: api.content,
    reply_to_id: api.reply_to_id ?? null,
    thread_root_message_id: api.thread_root_message_id ?? null,
    is_channel_post: api.is_channel_post ? 1 : 0,
    view_count: api.view_count ?? 0,
    comment_count: api.comment_count ?? 0,
    is_edited: api.is_edited ? 1 : 0,
    is_deleted: api.is_deleted ? 1 : 0,
    status: api.status,
    transport: api.transport ?? 'ws',
    server_id: null,
    created_at: api.created_at,
    updated_at: api.updated_at,
    media:
      api.media?.map((item) => ({
        duration_ms: item.duration_ms ?? undefined,
        waveform: decodeServerWaveform(item.waveform),
        remote_url: item.remote_url ?? undefined,
        thumbnail_url: item.thumbnail_url ?? undefined,
        width: item.width ?? undefined,
        height: item.height ?? undefined,
        file_name: item.file_name ?? undefined,
        file_size: item.file_size ?? undefined,
        is_round: item.is_round,
      })) ?? undefined,
    reactions: api.reactions?.map((item) => ({
      emoji: item.emoji,
      count: item.count,
      reacted_by_me: item.reacted_by_me,
    })),
  };
}

function localizeChannelApiMessage(message: string): string {
  switch (message) {
    case 'Reactions are unavailable for this channel':
      return 'Реакции недоступны в этом канале.';
    case 'Comments are unavailable for this channel':
      return 'Комментарии недоступны в этом канале.';
    case 'Channel discussion is not configured':
      return 'Обсуждение для этого канала не настроено.';
    case 'Join the channel before opening the discussion':
      return 'Сначала вступите в канал, чтобы открыть обсуждение.';
    case 'Paid channels require checkout first':
      return 'Для платного канала сначала нужно оформить доступ.';
    case 'Channel is private':
      return 'Это приватный канал.';
    case 'Channel not found':
      return 'Канал не найден.';
    case 'Channel post not found':
      return 'Публикация канала не найдена.';
    default:
      return message;
  }
}

async function parseJsonOrThrow<T>(res: Response, defaultMessage: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    if (!text) {
      throw new Error(`${defaultMessage}: ${res.status}`);
    }

    try {
      const payload = JSON.parse(text) as { message?: string | string[]; error?: string };
      const message = Array.isArray(payload.message)
        ? payload.message.join('\n')
        : payload.message ?? payload.error;
      if (message) {
        throw new Error(localizeChannelApiMessage(message));
      }
    } catch (error) {
      if (error instanceof Error && error.message !== text) {
        throw error;
      }
    }

    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

export async function fetchChannelCatalog(): Promise<Chat[]> {
  const res = await apiGet('/channels');
  const data = await parseJsonOrThrow<ApiChat[]>(res, 'Failed to load channels');
  return data.map(mapApiChatToChat);
}

export async function searchChannels(query: string): Promise<Chat[]> {
  const res = await apiGet(`/channels/search?q=${encodeURIComponent(query)}`);
  const data = await parseJsonOrThrow<ApiChat[]>(res, 'Failed to search channels');
  return data.map(mapApiChatToChat);
}

export async function fetchChannelDetail(channelId: string): Promise<ChannelDetail> {
  const res = await apiGet(`/channels/${encodeURIComponent(channelId)}`);
  const data = await parseJsonOrThrow<ApiChannelDetail>(res, 'Failed to load channel');
  return {
    channel: mapApiChatToChat(data),
    preview_posts: data.preview_posts.map(mapApiMessageToMessage),
    can_view_full_feed: data.can_view_full_feed ?? false,
    can_comment: data.can_comment ?? false,
    can_react: data.can_react ?? false,
    can_post: data.can_post ?? false,
    is_subscribed: data.is_subscribed ?? false,
    linked_discussion_chat_id: data.linked_discussion_chat_id ?? null,
    channel_permissions: data.channel_permissions
      ? {
          can_post: data.channel_permissions.can_post !== false,
          can_manage_admins: data.channel_permissions.can_manage_admins !== false,
          can_edit_channel: data.channel_permissions.can_edit_channel !== false,
          can_moderate_subscribers:
            data.channel_permissions.can_moderate_subscribers !== false,
          can_edit_channel_avatar:
            data.channel_permissions.can_edit_channel_avatar !== false,
          can_edit_channel_name:
            data.channel_permissions.can_edit_channel_name !== false,
          can_edit_channel_description:
            data.channel_permissions.can_edit_channel_description !== false,
          can_add_admins: data.channel_permissions.can_add_admins !== false,
          can_remove_admins: data.channel_permissions.can_remove_admins !== false,
          can_edit_admin_permissions:
            data.channel_permissions.can_edit_admin_permissions !== false,
        }
      : undefined,
  };
}

export async function fetchChannelFeed(channelId: string): Promise<{
  channel: Chat;
  posts: Message[];
  can_view_full_feed: boolean;
  can_comment: boolean;
  can_react: boolean;
  can_post: boolean;
  is_subscribed: boolean;
}> {
  const res = await apiGet(`/channels/${encodeURIComponent(channelId)}/feed?limit=50`);
  const data = await parseJsonOrThrow<{
    channel: ApiChat;
    posts: ApiMessage[];
  }>(res, 'Failed to load channel feed');
  return {
    channel: mapApiChatToChat(data.channel),
    posts: data.posts.map(mapApiMessageToMessage),
    can_view_full_feed: data.channel.can_view_full_feed ?? false,
    can_comment: data.channel.can_comment ?? false,
    can_react: data.channel.can_react ?? false,
    can_post: data.channel.can_post ?? false,
    is_subscribed: data.channel.is_subscribed ?? false,
  };
}

export async function fetchDiscussionThread(channelId: string, postId: string) {
  const res = await apiGet(
    `/channels/${encodeURIComponent(channelId)}/discussion/${encodeURIComponent(postId)}?limit=50`
  );
  const data = await parseJsonOrThrow<ApiDiscussionResponse>(res, 'Failed to load discussion');
  return {
    channel: mapApiChatToChat(data.channel),
    discussion_chat_id: data.discussion_chat_id,
    thread_root_message_id: data.thread_root_message_id,
    can_comment: data.can_comment,
    post: data.post ? mapApiMessageToMessage(data.post) : null,
    messages: data.messages.map(mapApiMessageToMessage),
  };
}

export async function createChannel(payload: {
  name: string;
  description?: string;
  visibility: 'public' | 'private';
  access_type: 'free' | 'paid';
  subscription_price_cents?: number;
  subscription_period_days?: number;
  preview_post_count?: number;
  allow_comments?: boolean;
  allow_reactions?: boolean;
}): Promise<Chat> {
  const res = await apiPost('/channels', payload);
  const data = await parseJsonOrThrow<ApiChat>(res, 'Failed to create channel');
  return mapApiChatToChat(data);
}

export async function updateChannel(
  channelId: string,
  payload: {
    name?: string;
    description?: string;
    avatar_url?: string;
    visibility?: 'public' | 'private';
    access_type?: 'free' | 'paid';
    subscription_price_cents?: number;
    subscription_period_days?: number;
    preview_post_count?: number;
    allow_comments?: boolean;
    allow_reactions?: boolean;
    disable_comments_new?: boolean;
    disable_comments_all?: boolean;
    disable_voice_comments?: boolean;
    disable_media_comments?: boolean;
    comment_cooldown_sec?: number;
    slug?: string;
  }
): Promise<Chat> {
  const res = await apiPatch(`/channels/${encodeURIComponent(channelId)}`, payload);
  const data = await parseJsonOrThrow<ApiChat>(res, 'Failed to update channel');
  return mapApiChatToChat(data);
}

export async function subscribeToChannel(channelId: string): Promise<Chat> {
  const res = await apiPost(`/channels/${encodeURIComponent(channelId)}/subscribe`);
  const data = await parseJsonOrThrow<ApiChat>(res, 'Failed to subscribe');
  return mapApiChatToChat(data);
}

export async function mockCheckoutChannel(channelId: string): Promise<Chat> {
  const res = await apiPost(`/channels/${encodeURIComponent(channelId)}/checkout/mock`);
  const data = await parseJsonOrThrow<{ channel: ApiChat }>(res, 'Failed to complete checkout');
  return mapApiChatToChat(data.channel);
}

export async function publishChannelPost(
  channelId: string,
  payload: {
    content?: string | null;
    msg_type?: string;
    media?: {
      url?: string;
      duration_ms?: number;
      waveform?: number[];
      thumbnail_url?: string;
      is_round?: boolean;
      width?: number;
      height?: number;
      file_name?: string;
      file_size?: number;
      mime_type?: string;
    };
  }
): Promise<Message> {
  const res = await apiPost(`/channels/${encodeURIComponent(channelId)}/posts`, payload);
  const data = await parseJsonOrThrow<ApiMessage>(res, 'Failed to publish post');
  return mapApiMessageToMessage(data);
}

export async function sendDiscussionMessage(
  channelId: string,
  postId: string,
  payload: {
    content?: string | null;
    msg_type?: string;
    reply_to_id?: string | null;
    media?: {
      url?: string;
      waveform?: number[];
      duration_ms?: number;
      thumbnail_url?: string;
      is_round?: boolean;
      width?: number;
      height?: number;
      file_name?: string;
      file_size?: number;
      mime_type?: string;
    };
  }
): Promise<Message> {
  const res = await apiPost(
    `/channels/${encodeURIComponent(channelId)}/discussion/${encodeURIComponent(postId)}/messages`,
    payload
  );
  const data = await parseJsonOrThrow<ApiMessage>(res, 'Failed to send comment');
  return mapApiMessageToMessage(data);
}

export async function toggleChannelReaction(
  channelId: string,
  postId: string,
  emoji: string
): Promise<ApiReaction[]> {
  const res = await apiPost(
    `/channels/${encodeURIComponent(channelId)}/posts/${encodeURIComponent(postId)}/reactions`,
    { emoji }
  );
  const data = await parseJsonOrThrow<{ reactions: ApiReaction[] }>(
    res,
    'Failed to toggle reaction'
  );
  return data.reactions;
}

export async function fetchChannelMembers(
  channelId: string,
  params?: {
    role?: 'admin' | 'subscriber';
    query?: string;
    limit?: number;
    cursor?: string | null;
    include_banned?: boolean;
  }
): Promise<{ items: ChannelMemberItem[]; next_cursor: string | null }> {
  const q = new URLSearchParams();
  if (params?.role) q.set('role', params.role);
  if (params?.query?.trim()) q.set('q', params.query.trim());
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.cursor) q.set('cursor', params.cursor);
  if (params?.include_banned) q.set('include_banned', 'true');

  const suffix = q.toString();
  const res = await apiGet(
    `/channels/${encodeURIComponent(channelId)}/members${suffix ? `?${suffix}` : ''}`
  );
  const data = await parseJsonOrThrow<ApiChannelMemberListResponse>(
    res,
    'Failed to load channel members'
  );
  return {
    items: data.items.map(mapApiChannelMember),
    next_cursor: data.next_cursor ?? null,
  };
}

export async function updateChannelMemberRolePermissions(
  channelId: string,
  memberId: string,
  payload: {
    role?: 'admin' | 'member';
    can_post?: boolean;
    can_manage_admins?: boolean;
    can_edit_channel?: boolean;
    can_moderate_subscribers?: boolean;
    can_edit_channel_avatar?: boolean;
    can_edit_channel_name?: boolean;
    can_edit_channel_description?: boolean;
    can_add_admins?: boolean;
    can_remove_admins?: boolean;
    can_edit_admin_permissions?: boolean;
  }
): Promise<Chat> {
  const res = await apiPatch(
    `/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberId)}`,
    payload
  );
  const data = await parseJsonOrThrow<{ channel: ApiChat }>(
    res,
    'Failed to update channel member permissions'
  );
  return mapApiChatToChat(data.channel);
}

export async function removeChannelMember(channelId: string, memberId: string): Promise<Chat> {
  const res = await apiDelete(
    `/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberId)}`
  );
  const data = await parseJsonOrThrow<{ channel: ApiChat }>(res, 'Failed to remove channel member');
  return mapApiChatToChat(data.channel);
}

export async function banChannelMember(channelId: string, memberId: string): Promise<Chat> {
  const res = await apiPost(
    `/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberId)}/ban`
  );
  const data = await parseJsonOrThrow<{ channel: ApiChat }>(res, 'Failed to ban channel member');
  return mapApiChatToChat(data.channel);
}

export async function unbanChannelMember(channelId: string, memberId: string): Promise<Chat> {
  const res = await apiDelete(
    `/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberId)}/ban`
  );
  const data = await parseJsonOrThrow<{ channel: ApiChat }>(res, 'Failed to unban channel member');
  return mapApiChatToChat(data.channel);
}
