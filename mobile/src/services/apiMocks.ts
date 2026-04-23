/**
 * Mock API responses for development without backend.
 * Enable via EXPO_PUBLIC_USE_MOCKS=true in .env
 */

const MOCK_USER_ID = 'mock-current-user';
const MOCK_PEER_ID = 'mock-peer-user';

const mockChats = [
  {
    id: 'mock-chat-1',
    chat_type: 'private',
    name: 'Alice',
    avatar_url: null,
    created_by_id: MOCK_USER_ID,
    last_message_id: 'mock-msg-2',
    pinned_message_id: null,
    last_message_at: Date.now() - 60000,
    last_message_preview: 'Hello! How are you?',
    unread_count: 1,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    draft: null,
    created_at: Date.now() - 86400000,
    updated_at: Date.now(),
    members: [{ user_id: MOCK_PEER_ID }],
  },
  {
    id: 'mock-chat-2',
    chat_type: 'private',
    name: 'Bob',
    avatar_url: null,
    created_by_id: MOCK_USER_ID,
    last_message_id: 'mock-msg-4',
    pinned_message_id: null,
    last_message_at: Date.now() - 3600000,
    last_message_preview: 'See you tomorrow',
    unread_count: 0,
    is_muted: false,
    is_pinned: true,
    is_archived: false,
    draft: null,
    created_at: Date.now() - 172800000,
    updated_at: Date.now(),
    members: [{ user_id: 'mock-peer-2' }],
  },
];

const mockChannels = [
  {
    id: 'mock-channel-free',
    chat_type: 'channel',
    name: 'Telegram Design Notes',
    description: 'Product experiments, UX notes, and release announcements.',
    avatar_url: null,
    visibility: 'public',
    access_type: 'free',
    subscription_price_cents: null,
    subscription_period_days: null,
    linked_discussion_chat_id: 'mock-discussion-free',
    invite_token: 'telegram-design-notes',
    slug: 'telegram_design',
    allow_comments: true,
    allow_reactions: true,
    preview_post_count: 3,
    subscriber_count: 1280,
    active_subscriber_count: 1280,
    access_status: 'active',
    subscription_expires_at: null,
    pending_earnings_cents: 0,
    available_payout_cents: 0,
    paid_out_cents: 0,
    created_by_id: MOCK_USER_ID,
    last_message_id: 'mock-channel-post-2',
    pinned_message_id: null,
    last_message_at: Date.now() - 1800000,
    last_message_preview: 'Pinned a new post about animated channel cards.',
    unread_count: 0,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    draft: null,
    created_at: Date.now() - 86400000 * 30,
    updated_at: Date.now(),
    members: [
      {
        user_id: MOCK_USER_ID,
        role: 'owner',
        access_status: 'active',
        subscription_expires_at: null,
      },
    ],
  },
  {
    id: 'mock-channel-paid',
    chat_type: 'channel',
    name: 'Premium Traders Club',
    description: 'Paid channel with a mocked checkout flow for subscription V1.',
    avatar_url: null,
    visibility: 'public',
    access_type: 'paid',
    subscription_price_cents: 999,
    subscription_period_days: 30,
    linked_discussion_chat_id: 'mock-discussion-paid',
    invite_token: 'premium-traders-club',
    allow_comments: true,
    allow_reactions: true,
    preview_post_count: 2,
    subscriber_count: 342,
    active_subscriber_count: 311,
    access_status: 'none',
    subscription_expires_at: null,
    pending_earnings_cents: 149900,
    available_payout_cents: 99000,
    paid_out_cents: 220000,
    created_by_id: 'mock-peer-2',
    last_message_id: 'mock-channel-paid-post-2',
    pinned_message_id: null,
    last_message_at: Date.now() - 7200000,
    last_message_preview: 'Market recap is ready.',
    unread_count: 0,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    draft: null,
    created_at: Date.now() - 86400000 * 14,
    updated_at: Date.now(),
    members: [
      {
        user_id: 'mock-peer-2',
        role: 'owner',
        access_status: 'active',
        subscription_expires_at: null,
      },
    ],
  },
];

const mockMessagesByChat: Record<string, Array<Record<string, unknown>>> = {
  'mock-chat-1': [
    {
      id: 'mock-msg-1',
      chat_id: 'mock-chat-1',
      sender_id: MOCK_PEER_ID,
      msg_type: 'text',
      content: 'Hello!',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 120000,
      updated_at: Date.now() - 120000,
    },
    {
      id: 'mock-msg-2',
      chat_id: 'mock-chat-1',
      sender_id: MOCK_USER_ID,
      msg_type: 'text',
      content: 'Hello! How are you?',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 60000,
      updated_at: Date.now() - 60000,
    },
  ],
  'mock-chat-2': [
    {
      id: 'mock-msg-3',
      chat_id: 'mock-chat-2',
      sender_id: 'mock-peer-2',
      msg_type: 'text',
      content: 'Remind me, what time?',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 7200000,
      updated_at: Date.now() - 7200000,
    },
    {
      id: 'mock-msg-4',
      chat_id: 'mock-chat-2',
      sender_id: MOCK_USER_ID,
      msg_type: 'text',
      content: 'See you tomorrow',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 3600000,
      updated_at: Date.now() - 3600000,
    },
  ],
  'mock-channel-free': [
    {
      id: 'mock-channel-post-1',
      chat_id: 'mock-channel-free',
      sender_id: MOCK_USER_ID,
      msg_type: 'text',
      content: 'Welcome to the channel. This week we are refining the Telegram-like channel feed.',
      reply_to_id: null,
      thread_root_message_id: null,
      is_channel_post: true,
      view_count: 730,
      comment_count: 3,
      reactions: [
        { emoji: '🔥', count: 5, reacted_by_me: true },
        { emoji: '👍', count: 2, reacted_by_me: false },
      ],
      is_edited: 0,
      is_deleted: 0,
      status: 'sent',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 7200000,
      updated_at: Date.now() - 7200000,
    },
    {
      id: 'mock-channel-post-2',
      chat_id: 'mock-channel-free',
      sender_id: MOCK_USER_ID,
      msg_type: 'text',
      content: 'Pinned a new post about animated channel cards.',
      reply_to_id: null,
      thread_root_message_id: null,
      is_channel_post: true,
      view_count: 410,
      comment_count: 1,
      reactions: [{ emoji: '❤️', count: 7, reacted_by_me: false }],
      is_edited: 0,
      is_deleted: 0,
      status: 'sent',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 1800000,
      updated_at: Date.now() - 1800000,
    },
  ],
  'mock-discussion-free': [
    {
      id: 'mock-discussion-message-1',
      chat_id: 'mock-discussion-free',
      sender_id: MOCK_PEER_ID,
      msg_type: 'text',
      content: 'The feed spacing feels much closer to Telegram now.',
      reply_to_id: null,
      thread_root_message_id: 'mock-channel-post-1',
      is_channel_post: 0,
      view_count: 0,
      comment_count: 0,
      is_edited: 0,
      is_deleted: 0,
      status: 'sent',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 5400000,
      updated_at: Date.now() - 5400000,
    },
    {
      id: 'mock-discussion-message-2',
      chat_id: 'mock-discussion-free',
      sender_id: 'mock-peer-2',
      msg_type: 'text',
      content: 'Need one more pass on paid unlock copy.',
      reply_to_id: null,
      thread_root_message_id: 'mock-channel-post-1',
      is_channel_post: 0,
      view_count: 0,
      comment_count: 0,
      is_edited: 0,
      is_deleted: 0,
      status: 'sent',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 3600000,
      updated_at: Date.now() - 3600000,
    },
  ],
  'mock-channel-paid': [
    {
      id: 'mock-channel-paid-post-1',
      chat_id: 'mock-channel-paid',
      sender_id: 'mock-peer-2',
      msg_type: 'text',
      content: 'Premium channel preview: weekly strategy memo is ready.',
      reply_to_id: null,
      thread_root_message_id: null,
      is_channel_post: true,
      view_count: 112,
      comment_count: 0,
      reactions: [{ emoji: '👏', count: 4, reacted_by_me: false }],
      is_edited: 0,
      is_deleted: 0,
      status: 'sent',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 14400000,
      updated_at: Date.now() - 14400000,
    },
    {
      id: 'mock-channel-paid-post-2',
      chat_id: 'mock-channel-paid',
      sender_id: 'mock-peer-2',
      msg_type: 'text',
      content: 'Market recap is ready.',
      reply_to_id: null,
      thread_root_message_id: null,
      is_channel_post: true,
      view_count: 84,
      comment_count: 0,
      reactions: [],
      is_edited: 0,
      is_deleted: 0,
      status: 'sent',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 7200000,
      updated_at: Date.now() - 7200000,
    },
  ],
  'mock-discussion-paid': [],
};

const mockCurrentUser = {
  id: MOCK_USER_ID,
  loginus_id: null,
  username: 'me',
  handle: 'myhandle',
  display_name: 'Me',
  avatar_url: null,
  phone: null,
  is_online: true,
  last_seen: null,
  created_at: Date.now() - 86400000,
  updated_at: Date.now(),
};

const mockUsers = [
  {
    id: MOCK_PEER_ID,
    loginus_id: null,
    username: 'alice',
    handle: 'alice',
    display_name: 'Alice',
    avatar_url: null,
    phone: null,
    is_online: true,
    last_seen: null,
    created_at: Date.now() - 86400000,
    updated_at: Date.now(),
  },
  {
    id: 'mock-peer-2',
    loginus_id: null,
    username: 'bob',
    handle: 'bob',
    display_name: 'Bob',
    avatar_url: null,
    phone: null,
    is_online: false,
    last_seen: Date.now() - 3600000,
    created_at: Date.now() - 172800000,
    updated_at: Date.now(),
  },
  {
    id: 'mock-peer-3',
    loginus_id: null,
    username: 'charlie',
    handle: 'charlie',
    display_name: 'Charlie',
    avatar_url: null,
    phone: null,
    is_online: true,
    last_seen: null,
    created_at: Date.now() - 259200000,
    updated_at: Date.now(),
  },
];

let dynamicChats = [
  ...mockChannels.filter((channel) => channel.access_status === 'active'),
  ...mockChats,
];
let dynamicChannels = [...mockChannels];
let dynamicMessages: Record<string, Array<Record<string, unknown>>> = JSON.parse(
  JSON.stringify(mockMessagesByChat)
);

type MockFeedbackWire = {
  id: string;
  type: 'bug' | 'suggestion';
  status: 'open' | 'closed';
  title: string;
  body: string;
  author_id: string;
  created_at: number;
  author: {
    id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };
};

let mockFeedbackBug: MockFeedbackWire[] = [];
let mockFeedbackSuggestion: MockFeedbackWire[] = [];

function createMockResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mockApiGet(path: string): Promise<Response> {
  // GET /chats
  if (path === '/chats' || path.startsWith('/chats?')) {
    return createMockResponse(dynamicChats);
  }

  if (path === '/channels' || path === '/channels/catalog') {
    return createMockResponse(dynamicChannels);
  }

  if (path.startsWith('/channels/search')) {
    const query = new URL(`http://local${path}`).searchParams.get('q')?.trim().toLowerCase() ?? '';
    if (!query) {
      return createMockResponse([]);
    }
    return createMockResponse(
      dynamicChannels.filter((channel) =>
        [channel.name, channel.description, channel.invite_token]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
    );
  }

  const linkSlugMatch = path.match(/^\/channels\/link\/slug\/([^/?]+)$/);
  if (linkSlugMatch) {
    const slug = decodeURIComponent(linkSlugMatch[1]).trim().toLowerCase();
    const channel = dynamicChannels.find(
      (c) =>
        (c as { slug?: string }).slug === slug &&
        (c as { visibility?: string }).visibility === 'public',
    ) as (typeof dynamicChannels)[number] | undefined;
    if (!channel) {
      return new Response(JSON.stringify({ message: 'Channel not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const isSub =
      channel.access_type === 'free' || channel.access_status === 'active';
    const ch = { ...channel, invite_token: null };
    return createMockResponse({
      link_kind: 'slug',
      channel_id: channel.id,
      visibility: 'public',
      channel: ch,
      is_subscribed: isSub,
      can_subscribe: channel.access_type === 'free',
      subscribe_requires_invite: false,
    });
  }

  const linkInviteMatch = path.match(/^\/channels\/link\/invite\/(.+)$/);
  if (linkInviteMatch) {
    const token = decodeURIComponent(linkInviteMatch[1]).trim();
    const channel = dynamicChannels.find(
      (c) => (c as { invite_token?: string }).invite_token === token,
    ) as (typeof dynamicChannels)[number] | undefined;
    if (!channel) {
      return new Response(JSON.stringify({ message: 'Invite link is invalid or expired' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const isSub =
      channel.access_type === 'free' || channel.access_status === 'active';
    const vis = (channel as { visibility?: string }).visibility ?? 'public';
    return createMockResponse({
      link_kind: 'invite',
      channel_id: channel.id,
      visibility: vis,
      channel,
      is_subscribed: isSub,
      can_subscribe: channel.access_type === 'free',
      subscribe_requires_invite: vis === 'private',
    });
  }

  const channelMatch = path.match(/^\/channels\/([^/?]+)$/);
  if (channelMatch) {
    const channelId = channelMatch[1];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (!channel) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const previewPosts = dynamicMessages[channelId] ?? [];
    return createMockResponse({
      ...channel,
      preview_posts:
        channel.access_type === 'paid' && channel.access_status !== 'active'
          ? previewPosts.slice(0, channel.preview_post_count ?? 2)
          : previewPosts,
      can_view_full_feed: channel.access_type === 'free' || channel.access_status === 'active',
      can_comment: true,
      can_react: true,
      can_post: channel.created_by_id === MOCK_USER_ID,
      is_subscribed:
        channel.access_type === 'free' || channel.access_status === 'active',
    });
  }

  const channelFeedMatch = path.match(/^\/channels\/([^/]+)\/feed(?:\?|$)/);
  if (channelFeedMatch) {
    const channelId = channelFeedMatch[1];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (!channel) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const posts = dynamicMessages[channelId] ?? [];
    return createMockResponse({
      channel: {
        ...channel,
        can_view_full_feed: channel.access_type === 'free' || channel.access_status === 'active',
        can_comment: true,
        can_react: true,
        can_post: channel.created_by_id === MOCK_USER_ID,
        is_subscribed:
          channel.access_type === 'free' || channel.access_status === 'active',
      },
      posts:
        channel.access_type === 'paid' && channel.access_status !== 'active'
          ? posts.slice(0, channel.preview_post_count ?? 2)
          : posts,
    });
  }

  const discussionMatch = path.match(/^\/channels\/([^/]+)\/discussion\/([^/?]+)(?:\?|$)/);
  if (discussionMatch) {
    const channelId = discussionMatch[1];
    const postId = discussionMatch[2];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (!channel) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const discussionChatId = channel.linked_discussion_chat_id ?? '';
    const messages = (dynamicMessages[discussionChatId] ?? []).filter(
      (item) => item.thread_root_message_id === postId
    );
    return createMockResponse({
      channel,
      discussion_chat_id: discussionChatId,
      thread_root_message_id: postId,
      can_comment: true,
      messages,
    });
  }

  // GET /chats/:id/messages?limit=30&before=?
  const messagesMatch = path.match(/^\/chats\/([^/]+)\/messages\?/);
  if (messagesMatch) {
    const chatId = messagesMatch[1];
    const msgs = dynamicMessages[chatId] ?? [];
    return createMockResponse(msgs);
  }

  // GET /users/me
  if (path === '/users/me') {
    return createMockResponse(mockCurrentUser);
  }

  // GET /users/search?q=...
  if (path.startsWith('/users/search')) {
    const url = new URL(path, 'http://localhost');
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim().replace(/^@+/, '');
    if (!q) return createMockResponse([]);
    const filtered = mockUsers.filter(
      (u) =>
        (u.username?.toLowerCase().includes(q) ?? false) ||
        (u.display_name?.toLowerCase().includes(q) ?? false) ||
        (u.handle?.toLowerCase().includes(q) ?? false)
    );
    return createMockResponse(filtered);
  }

  if (path.startsWith('/feedback')) {
    const url = new URL(path, 'http://localhost');
    const fbType = url.searchParams.get('type');
    const inbox =
      (mockCurrentUser.handle ?? '').trim().toLowerCase() === 'admin';
    if (fbType === 'bug') {
      const list = inbox
        ? mockFeedbackBug
        : mockFeedbackBug.filter((e) => e.author_id === mockCurrentUser.id);
      return createMockResponse(list);
    }
    if (fbType === 'suggestion') {
      const list = inbox
        ? mockFeedbackSuggestion
        : mockFeedbackSuggestion.filter((e) => e.author_id === mockCurrentUser.id);
      return createMockResponse(list);
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mockApiPatch(
  path: string,
  body?: unknown
): Promise<Response> {
  // PATCH /users/me
  if (path === '/users/me' && body && typeof body === 'object') {
    const b = body as { display_name?: string; avatar_url?: string; handle?: string };
    Object.assign(mockCurrentUser, {
      display_name: b.display_name ?? mockCurrentUser.display_name,
      avatar_url: b.avatar_url ?? mockCurrentUser.avatar_url,
      handle: b.handle ?? mockCurrentUser.handle,
      updated_at: Date.now(),
    });
    return createMockResponse(mockCurrentUser);
  }

  const channelMatch = path.match(/^\/channels\/([^/]+)$/);
  if (channelMatch && body && typeof body === 'object') {
    const channelId = channelMatch[1];
    const index = dynamicChannels.findIndex((item) => item.id === channelId);
    if (index >= 0) {
      dynamicChannels[index] = {
        ...dynamicChannels[index],
        ...(body as Record<string, unknown>),
        updated_at: Date.now(),
      };
      return createMockResponse(dynamicChannels[index]);
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mockApiPost(
  path: string,
  body?: unknown
): Promise<Response> {
  if (path === '/feedback' && body && typeof body === 'object') {
    const b = body as { type?: string; title?: string; body?: string };
    const t = b.type === 'suggestion' ? 'suggestion' : 'bug';
    const entry: MockFeedbackWire = {
      id: `mock-fb-${Date.now()}`,
      type: t,
      status: 'open',
      title: String(b.title ?? '').trim() || '(empty)',
      body: String(b.body ?? '').trim() || '(empty)',
      author_id: mockCurrentUser.id,
      created_at: Date.now(),
      author: {
        id: mockCurrentUser.id,
        display_name: mockCurrentUser.display_name ?? null,
        handle: mockCurrentUser.handle ?? null,
        avatar_url: mockCurrentUser.avatar_url ?? null,
      },
    };
    if (t === 'bug') {
      mockFeedbackBug = [entry, ...mockFeedbackBug];
    } else {
      mockFeedbackSuggestion = [entry, ...mockFeedbackSuggestion];
    }
    return createMockResponse(entry);
  }

  // POST /chats
  if (path === '/chats' && body && typeof body === 'object') {
    const b = body as { chat_type?: string; member_ids?: string[] };
    const memberIds = b.member_ids ?? [];
    const peerId = memberIds[0] ?? 'mock-new-peer';
    const peer = mockUsers.find((u) => u.id === peerId) ?? {
      id: peerId,
      username: peerId,
      display_name: peerId,
    };

    const peerName = peer.display_name ?? peer.username ?? peerId;
    const newChat = {
      id: `mock-chat-${Date.now()}`,
      chat_type: b.chat_type ?? 'private',
      name: peerName,
      avatar_url: null,
      created_by_id: MOCK_USER_ID,
      last_message_id: null,
      pinned_message_id: null,
      last_message_at: null,
      last_message_preview: null,
      unread_count: 0,
      is_muted: false,
      is_pinned: false,
      is_archived: false,
      draft: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      members: [{ user_id: peerId }],
    };

    dynamicChats = [newChat, ...dynamicChats];
    dynamicMessages[newChat.id] = [];

    return createMockResponse(newChat);
  }

  if (path === '/channels' && body && typeof body === 'object') {
    const b = body as {
      name?: string;
      description?: string;
      visibility?: 'public' | 'private';
      access_type?: 'free' | 'paid';
      subscription_price_cents?: number;
      subscription_period_days?: number;
      allow_comments?: boolean;
      allow_reactions?: boolean;
      preview_post_count?: number;
    };

    const channelId = `mock-channel-${Date.now()}`;
    const discussionId = `mock-discussion-${Date.now()}`;
    const newChannel = {
      id: channelId,
      chat_type: 'channel',
      name: b.name ?? 'New channel',
      description: b.description ?? null,
      avatar_url: null,
      visibility: b.visibility ?? 'public',
      access_type: b.access_type ?? 'free',
      subscription_price_cents:
        b.access_type === 'paid' ? b.subscription_price_cents ?? 499 : null,
      subscription_period_days:
        b.access_type === 'paid' ? b.subscription_period_days ?? 30 : null,
      linked_discussion_chat_id: discussionId,
      invite_token: `invite-${Date.now()}`,
      allow_comments: b.allow_comments !== false,
      allow_reactions: b.allow_reactions !== false,
      preview_post_count: b.preview_post_count ?? 3,
      subscriber_count: 1,
      active_subscriber_count: 1,
      access_status: 'active',
      subscription_expires_at: null,
      pending_earnings_cents: 0,
      available_payout_cents: 0,
      paid_out_cents: 0,
      created_by_id: MOCK_USER_ID,
      last_message_id: null,
      pinned_message_id: null,
      last_message_at: null,
      last_message_preview: null,
      unread_count: 0,
      is_muted: false,
      is_pinned: false,
      is_archived: false,
      draft: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      members: [
        {
          user_id: MOCK_USER_ID,
          role: 'owner',
          access_status: 'active',
          subscription_expires_at: null,
        },
      ],
    };
    dynamicChannels = [newChannel, ...dynamicChannels];
    dynamicChats = [newChannel, ...dynamicChats];
    dynamicMessages[channelId] = [];
    dynamicMessages[discussionId] = [];
    return createMockResponse(newChannel);
  }

  const subscribeMatch = path.match(/^\/channels\/([^/]+)\/subscribe$/);
  if (subscribeMatch) {
    const channelId = subscribeMatch[1];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (channel) {
      channel.access_status = 'active';
      channel.subscriber_count += 1;
      channel.active_subscriber_count += 1;
      channel.members = [
        ...(channel.members ?? []),
        {
          user_id: MOCK_USER_ID,
          role: 'member',
          access_status: 'active',
          subscription_expires_at: null,
        },
      ];
      dynamicChats = [channel, ...dynamicChats.filter((item) => item.id !== channel.id)];
      return createMockResponse(channel);
    }
  }

  const unsubscribeMatch = path.match(/^\/channels\/([^/]+)\/unsubscribe$/);
  if (unsubscribeMatch) {
    const channelId = unsubscribeMatch[1];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (channel) {
      channel.members = (channel.members ?? []).filter((m) => m.user_id !== MOCK_USER_ID);
      channel.subscriber_count = Math.max(0, (channel.subscriber_count ?? 1) - 1);
      channel.active_subscriber_count = Math.max(0, (channel.active_subscriber_count ?? 1) - 1);
      dynamicChats = dynamicChats.filter((c) => c.id !== channelId);
      dynamicChannels = dynamicChannels.map((c) =>
        c.id === channelId ? { ...c, members: channel.members, subscriber_count: channel.subscriber_count } : c,
      );
      return createMockResponse({ ok: true });
    }
  }

  const checkoutMatch = path.match(/^\/channels\/([^/]+)\/checkout\/mock$/);
  if (checkoutMatch) {
    const channelId = checkoutMatch[1];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (channel) {
      channel.access_status = 'active';
      channel.subscription_expires_at = Date.now() + 30 * 86400000;
      channel.subscriber_count += 1;
      channel.active_subscriber_count += 1;
      channel.members = [
        ...(channel.members ?? []),
        {
          user_id: MOCK_USER_ID,
          role: 'member',
          access_status: 'active',
          subscription_expires_at: channel.subscription_expires_at,
        },
      ];
      dynamicChats = [channel, ...dynamicChats.filter((item) => item.id !== channel.id)];
      return createMockResponse({ checkout_state: 'paid', channel });
    }
  }

  const publishMatch = path.match(/^\/channels\/([^/]+)\/posts$/);
  if (publishMatch && body && typeof body === 'object') {
    const channelId = publishMatch[1];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (channel) {
      const b = body as {
        content?: string;
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
      };
      const post = {
        id: `mock-channel-post-${Date.now()}`,
        chat_id: channelId,
        sender_id: MOCK_USER_ID,
        msg_type: b.msg_type ?? 'text',
        content: b.content ?? null,
        reply_to_id: null,
        thread_root_message_id: null,
        is_channel_post: true,
        view_count: 0,
        comment_count: 0,
        reactions: [],
        is_edited: 0,
        is_deleted: 0,
        status: 'sent',
        transport: 'server',
        server_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        media: b.media
          ? [
              {
                remote_url: b.media.url ?? null,
                duration_ms: b.media.duration_ms ?? null,
                waveform: b.media.waveform ?? null,
                thumbnail_url: b.media.thumbnail_url ?? null,
                is_round: b.media.is_round ?? false,
                width: b.media.width ?? null,
                height: b.media.height ?? null,
                file_name: b.media.file_name ?? null,
                file_size: b.media.file_size ?? null,
              },
            ]
          : undefined,
      };
      dynamicMessages[channelId] = [post, ...(dynamicMessages[channelId] ?? [])];
      channel.last_message_id = post.id;
      channel.last_message_at = post.created_at;
      channel.last_message_preview =
        post.content ??
        (post.msg_type === 'image'
          ? 'Фото'
          : post.msg_type === 'video'
            ? 'Видео'
            : post.msg_type === 'voice'
              ? 'Голосовое сообщение'
              : post.msg_type === 'video_note'
                ? 'Видеосообщение'
                : post.msg_type === 'file'
                  ? post.media?.[0]?.file_name ?? 'Файл'
                  : 'Новый пост');
      channel.updated_at = Date.now();
      return createMockResponse(post);
    }
  }

  const discussionMessageMatch = path.match(/^\/channels\/([^/]+)\/discussion\/([^/]+)\/messages$/);
  if (discussionMessageMatch && body && typeof body === 'object') {
    const channelId = discussionMessageMatch[1];
    const postId = discussionMessageMatch[2];
    const channel = dynamicChannels.find((item) => item.id === channelId);
    if (channel) {
      const discussionChatId = channel.linked_discussion_chat_id ?? '';
      const b = body as { content?: string; msg_type?: string; reply_to_id?: string | null };
      const message = {
        id: `mock-discussion-msg-${Date.now()}`,
        chat_id: discussionChatId,
        sender_id: MOCK_USER_ID,
        msg_type: b.msg_type ?? 'text',
        content: b.content ?? null,
        reply_to_id: b.reply_to_id ?? null,
        thread_root_message_id: postId,
        is_channel_post: false,
        view_count: 0,
        comment_count: 0,
        reactions: [],
        is_edited: 0,
        is_deleted: 0,
        status: 'sent',
        transport: 'server',
        server_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      dynamicMessages[discussionChatId] = [message, ...(dynamicMessages[discussionChatId] ?? [])];
      const channelPosts = dynamicMessages[channelId] ?? [];
      const postIndex = channelPosts.findIndex((item) => item.id === postId);
      if (postIndex >= 0) {
        const previous = Number(channelPosts[postIndex].comment_count ?? 0);
        channelPosts[postIndex] = {
          ...channelPosts[postIndex],
          comment_count: previous + 1,
        };
      }
      return createMockResponse(message);
    }
  }

  const reactionMatch = path.match(/^\/channels\/([^/]+)\/posts\/([^/]+)\/reactions$/);
  if (reactionMatch && body && typeof body === 'object') {
    const channelId = reactionMatch[1];
    const postId = reactionMatch[2];
    const b = body as { emoji?: string };
    const posts = dynamicMessages[channelId] ?? [];
    const postIndex = posts.findIndex((item) => item.id === postId);
    if (postIndex >= 0 && b.emoji) {
      const currentReactions = Array.isArray(posts[postIndex].reactions)
        ? [...(posts[postIndex].reactions as Array<{ emoji: string; count: number; reacted_by_me: boolean }>)]
        : [];
      const reactionIndex = currentReactions.findIndex((item) => item.emoji === b.emoji);
      if (reactionIndex >= 0) {
        currentReactions[reactionIndex] = {
          ...currentReactions[reactionIndex],
          count: currentReactions[reactionIndex].count + (currentReactions[reactionIndex].reacted_by_me ? -1 : 1),
          reacted_by_me: !currentReactions[reactionIndex].reacted_by_me,
        };
        if (currentReactions[reactionIndex].count <= 0) {
          currentReactions.splice(reactionIndex, 1);
        }
      } else {
        currentReactions.push({ emoji: b.emoji, count: 1, reacted_by_me: true });
      }
      posts[postIndex] = {
        ...posts[postIndex],
        reactions: currentReactions,
      };
      return createMockResponse({ reactions: currentReactions });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
