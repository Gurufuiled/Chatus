import { apiRequest } from './apiClient';
import type { ChatSummary, ChannelPermissions } from '@/types/chat';
import type { MappedMessage, MappedMessageReaction } from '@/types/message';

export type ChannelPostMedia = {
  media_type?: string;
  url?: string;
  duration_ms?: number;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  waveform?: number[];
};

export type ChannelDetail = {
  channel: ChatSummary;
  preview_posts: MappedMessage[];
  can_view_full_feed: boolean;
  can_comment: boolean;
  can_react: boolean;
  can_post: boolean;
  is_subscribed: boolean;
  linked_discussion_chat_id: string | null;
  channel_permissions?: Partial<ChannelPermissions>;
};

export type ChannelFeedResult = {
  channel: ChatSummary;
  posts: MappedMessage[];
  can_view_full_feed: boolean;
  can_comment: boolean;
  can_react: boolean;
  can_post: boolean;
  is_subscribed: boolean;
};

export type DiscussionThreadResult = {
  channel: ChatSummary;
  discussion_chat_id: string;
  thread_root_message_id: string;
  can_comment: boolean;
  post: MappedMessage | null;
  messages: MappedMessage[];
};

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
}): Promise<ChatSummary> {
  return apiRequest<ChatSummary>('/channels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

type ApiChannelDetailResponse = ChatSummary & {
  preview_posts: MappedMessage[];
  can_view_full_feed?: boolean;
  can_comment?: boolean;
  can_react?: boolean;
  can_post?: boolean;
  is_subscribed?: boolean;
  linked_discussion_chat_id?: string | null;
  channel_permissions?: Partial<ChannelPermissions>;
};

function mapChannelDetailResponse(data: ApiChannelDetailResponse): ChannelDetail {
  const {
    preview_posts,
    can_view_full_feed,
    can_comment,
    can_react,
    can_post,
    is_subscribed,
    linked_discussion_chat_id,
    channel_permissions,
    ...channelFields
  } = data;

  return {
    channel: channelFields,
    preview_posts: preview_posts ?? [],
    can_view_full_feed: can_view_full_feed ?? false,
    can_comment: can_comment ?? false,
    can_react: can_react ?? false,
    can_post: can_post ?? false,
    is_subscribed: is_subscribed ?? false,
    linked_discussion_chat_id: linked_discussion_chat_id ?? null,
    channel_permissions,
  };
}

export async function fetchChannelDetail(channelId: string): Promise<ChannelDetail> {
  const data = await apiRequest<ApiChannelDetailResponse>(
    `/channels/${encodeURIComponent(channelId)}`,
  );
  return mapChannelDetailResponse(data);
}

function mapChannelFeedResponse(data: {
  channel: ChatSummary & {
    can_view_full_feed?: boolean;
    can_comment?: boolean;
    can_react?: boolean;
    can_post?: boolean;
    is_subscribed?: boolean;
    channel_permissions?: Partial<ChannelPermissions>;
  };
  posts: MappedMessage[];
}): ChannelFeedResult {
  const { channel, posts } = data;
  return {
    channel,
    posts: posts ?? [],
    can_view_full_feed: channel.can_view_full_feed ?? false,
    can_comment: channel.can_comment ?? false,
    can_react: channel.can_react ?? false,
    can_post: channel.can_post ?? false,
    is_subscribed: channel.is_subscribed ?? false,
  };
}

export async function fetchChannelFeed(channelId: string): Promise<ChannelFeedResult> {
  const data = await apiRequest<Parameters<typeof mapChannelFeedResponse>[0]>(
    `/channels/${encodeURIComponent(channelId)}/feed?limit=50`,
  );
  return mapChannelFeedResponse(data);
}

export async function fetchDiscussionThread(
  channelId: string,
  postId: string,
): Promise<DiscussionThreadResult> {
  return apiRequest<DiscussionThreadResult>(
    `/channels/${encodeURIComponent(channelId)}/discussion/${encodeURIComponent(postId)}?limit=50`,
  );
}

export async function subscribeToChannel(
  channelId: string,
  inviteToken?: string,
): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(`/channels/${encodeURIComponent(channelId)}/subscribe`, {
    method: 'POST',
    body: JSON.stringify(inviteToken ? { invite_token: inviteToken } : {}),
  });
}

export async function unsubscribeFromChannel(channelId: string): Promise<void> {
  await apiRequest<unknown>(`/channels/${encodeURIComponent(channelId)}/unsubscribe`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function mockCheckoutChannel(channelId: string): Promise<ChatSummary> {
  const data = await apiRequest<{ channel: ChatSummary }>(
    `/channels/${encodeURIComponent(channelId)}/checkout/mock`,
    { method: 'POST' },
  );
  return data.channel;
}

export async function publishChannelPost(
  channelId: string,
  payload: {
    content?: string | null;
    msg_type?: string;
    media?: ChannelPostMedia | ChannelPostMedia[];
  },
): Promise<MappedMessage> {
  return apiRequest<MappedMessage>(`/channels/${encodeURIComponent(channelId)}/posts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
      duration_ms?: number;
      thumbnail_url?: string;
      width?: number;
      height?: number;
      file_name?: string;
      file_size?: number;
      mime_type?: string;
    };
  },
): Promise<MappedMessage> {
  return apiRequest<MappedMessage>(
    `/channels/${encodeURIComponent(channelId)}/discussion/${encodeURIComponent(postId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function toggleChannelReaction(
  channelId: string,
  postId: string,
  emoji: string,
): Promise<MappedMessageReaction[]> {
  const data = await apiRequest<{ reactions: MappedMessageReaction[] }>(
    `/channels/${encodeURIComponent(channelId)}/posts/${encodeURIComponent(postId)}/reactions`,
    {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    },
  );
  return data.reactions;
}

export async function updateChannel(
  channelId: string,
  payload: {
    name?: string;
    description?: string;
    visibility?: 'public' | 'private';
    slug?: string;
    clear_slug?: boolean;
    allow_comments?: boolean;
    allow_reactions?: boolean;
  },
): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(`/channels/${encodeURIComponent(channelId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export type ChannelMemberItem = {
  user_id: string;
  role: string;
  access_status: string;
  subscription_expires_at: number | null;
  joined_at: number;
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

type ApiChannelMemberListItem = {
  user_id: string;
  role: string;
  access_status: string;
  subscription_expires_at?: number | null;
  joined_at: number;
  is_banned?: boolean;
  user?: ChannelMemberItem['user'];
};

function mapApiChannelMember(item: ApiChannelMemberListItem): ChannelMemberItem {
  return {
    user_id: item.user_id,
    role: item.role,
    access_status: item.access_status,
    subscription_expires_at: item.subscription_expires_at ?? null,
    joined_at: item.joined_at,
    is_banned: item.is_banned === true,
    user: item.user,
  };
}

export async function fetchChannelMembers(
  channelId: string,
  params?: {
    role?: 'admin' | 'subscriber';
    query?: string;
    limit?: number;
    cursor?: string | null;
    include_banned?: boolean;
  },
): Promise<{ items: ChannelMemberItem[]; next_cursor: string | null }> {
  const q = new URLSearchParams();
  if (params?.role) q.set('role', params.role);
  if (params?.query?.trim()) q.set('q', params.query.trim());
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.cursor) q.set('cursor', params.cursor);
  if (params?.include_banned) q.set('include_banned', 'true');

  const suffix = q.toString();
  const data = await apiRequest<{
    items: ApiChannelMemberListItem[];
    next_cursor?: string | null;
  }>(
    `/channels/${encodeURIComponent(channelId)}/members${suffix ? `?${suffix}` : ''}`,
  );

  return {
    items: (data.items ?? []).map(mapApiChannelMember),
    next_cursor: data.next_cursor ?? null,
  };
}
