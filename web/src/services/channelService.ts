import { apiRequest } from './apiClient';
import type { ChatSummary, ChannelPermissions } from '@/types/chat';
import type { MappedMessage, MappedMessageReaction } from '@/types/message';

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

export async function fetchChannelDetail(channelId: string): Promise<ChannelDetail> {
  return apiRequest<ChannelDetail>(`/channels/${encodeURIComponent(channelId)}`);
}

export async function fetchChannelFeed(channelId: string): Promise<ChannelFeedResult> {
  return apiRequest<ChannelFeedResult>(
    `/channels/${encodeURIComponent(channelId)}/feed?limit=50`,
  );
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
    media?: {
      media_type?: string;
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
    allow_comments?: boolean;
    allow_reactions?: boolean;
  },
): Promise<ChatSummary> {
  return apiRequest<ChatSummary>(`/channels/${encodeURIComponent(channelId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
