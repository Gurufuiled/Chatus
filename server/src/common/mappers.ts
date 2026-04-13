import type {
  User,
  Chat,
  Message,
  Media,
  ChatMember,
  MessageReaction,
} from '@prisma/client';

// --- Helpers ---

export function dateToUnixMs(d: Date | null | undefined): number | null {
  if (d == null) return null;
  return d.getTime();
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, '');
}

export function toSnakeCase<T = unknown>(
  obj: T,
): T extends Date ? number : T extends (infer U)[] ? unknown[] : unknown {
  if (obj === null || obj === undefined) {
    return obj as T extends Date
      ? number
      : T extends (infer U)[]
        ? unknown[]
        : unknown;
  }
  if (obj instanceof Date) {
    return obj.getTime() as T extends Date ? number : never;
  }
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
    return Buffer.from(obj).toString('base64') as T extends Date
      ? number
      : T extends (infer U)[]
        ? unknown[]
        : unknown;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item)) as T extends Date
      ? number
      : T extends (infer U)[]
        ? unknown[]
        : unknown;
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[camelToSnake(key)] = toSnakeCase(value);
    }
    return result as T extends Date
      ? number
      : T extends (infer U)[]
        ? unknown[]
        : unknown;
  }
  return obj as T extends Date
    ? number
    : T extends (infer U)[]
      ? unknown[]
      : unknown;
}

// --- Mappers ---

export type MappedUser = {
  id: string;
  loginus_id: string | null;
  username: string | null;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_online: boolean;
  last_seen: number | null;
  created_at: number;
  updated_at: number;
};

export function mapUser(user: User): MappedUser {
  return {
    id: user.id,
    loginus_id: user.loginusId ?? null,
    username: user.username ?? null,
    handle: user.handle ?? null,
    display_name: user.displayName ?? null,
    avatar_url: user.avatarUrl ?? null,
    phone: user.phone ?? null,
    is_online: user.isOnline,
    last_seen: dateToUnixMs(user.lastSeen),
    created_at: dateToUnixMs(user.createdAt) ?? 0,
    updated_at: dateToUnixMs(user.updatedAt) ?? 0,
  };
}

export type MappedChatMember = {
  chat_id: string;
  user_id: string;
  role: string;
  access_status: string;
  subscription_expires_at: number | null;
  tag: string | null;
  tag_color: string | null;
  joined_at: number;
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

export function mapChatMember(member: ChatMember & { user?: User | null }): MappedChatMember {
  return {
    chat_id: member.chatId,
    user_id: member.userId,
    role: member.role,
    access_status: member.accessStatus,
    subscription_expires_at: dateToUnixMs(member.subscriptionExpiresAt),
    tag: member.tag ?? null,
    tag_color: member.tagColor ?? null,
    joined_at: dateToUnixMs(member.joinedAt) ?? 0,
    user:
      'user' in member && member.user
        ? {
            id: member.user.id,
            username: member.user.username ?? null,
            handle: member.user.handle ?? null,
            display_name: member.user.displayName ?? null,
            avatar_url: member.user.avatarUrl ?? null,
            is_online: member.user.isOnline,
            last_seen: dateToUnixMs(member.user.lastSeen),
          }
        : undefined,
  };
}

export type MappedChat = {
  id: string;
  chat_type: string;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  visibility: string;
  access_type: string;
  subscription_price_cents: number | null;
  subscription_period_days: number | null;
  linked_discussion_chat_id: string | null;
  invite_token: string | null;
  allow_comments: boolean;
  allow_reactions: boolean;
  preview_post_count: number;
  subscriber_count: number;
  active_subscriber_count: number;
  access_status: string | null;
  subscription_expires_at: number | null;
  pending_earnings_cents: number;
  available_payout_cents: number;
  paid_out_cents: number;
  peer_display_name?: string | null;
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
  members?: MappedChatMember[];
  last_message?: MappedMessage;
};

type ChatMemberWithUser = import('@prisma/client').ChatMember & { user?: User };

export function mapChat(
  chat: Chat & { members?: ChatMemberWithUser[]; lastMessage?: Message | null },
  opts?: {
    includeMembers?: boolean;
    includeLastMessage?: boolean;
    currentUserId?: string;
  },
): MappedChat {
  const peer =
    chat.chatType === 'private' && opts?.currentUserId && chat.members?.length
      ? chat.members.find((m) => m.userId !== opts.currentUserId)
      : undefined;
  const currentMembership =
    opts?.currentUserId && chat.members?.length
      ? chat.members.find((m) => m.userId === opts.currentUserId)
      : undefined;

  const base: MappedChat = {
    id: chat.id,
    chat_type: chat.chatType,
    name: chat.name ?? null,
    description: chat.description ?? null,
    avatar_url:
      chat.chatType === 'private'
        ? peer?.user?.avatarUrl ?? null
        : chat.avatarUrl ?? null,
    visibility: chat.visibility,
    access_type: chat.accessType,
    subscription_price_cents: chat.subscriptionPriceCents ?? null,
    subscription_period_days: chat.subscriptionPeriodDays ?? null,
    linked_discussion_chat_id: chat.linkedDiscussionChatId ?? null,
    invite_token: chat.inviteToken ?? null,
    allow_comments: chat.allowComments,
    allow_reactions: chat.allowReactions,
    preview_post_count: chat.previewPostCount,
    subscriber_count: chat.subscriberCount,
    active_subscriber_count: chat.activeSubscriberCount,
    access_status: currentMembership?.accessStatus ?? null,
    subscription_expires_at: dateToUnixMs(currentMembership?.subscriptionExpiresAt),
    pending_earnings_cents: chat.pendingEarningsCents,
    available_payout_cents: chat.availablePayoutCents,
    paid_out_cents: chat.paidOutCents,
    peer_display_name: null,
    created_by_id: chat.createdById,
    last_message_id: chat.lastMessageId ?? null,
    pinned_message_id: chat.pinnedMessageId ?? null,
    last_message_at: dateToUnixMs(chat.lastMessageAt),
    last_message_preview: chat.lastMessagePreview ?? null,
    unread_count: chat.unreadCount,
    is_muted: chat.isMuted,
    is_pinned: chat.isPinned,
    is_archived: chat.isArchived,
    draft: chat.draft ?? null,
    created_at: dateToUnixMs(chat.createdAt) ?? 0,
    updated_at: dateToUnixMs(chat.updatedAt) ?? 0,
  };
  if (
    chat.chatType === 'private' &&
    opts?.currentUserId &&
    chat.members?.length
  ) {
    base.peer_display_name =
      peer?.user?.displayName ??
      peer?.user?.username ??
      peer?.user?.handle ??
      'Unknown';
  }
  if (opts?.includeMembers && chat.members) {
    base.members = chat.members.map(mapChatMember);
  }
  if (opts?.includeLastMessage && chat.lastMessage) {
    base.last_message = mapMessage(chat.lastMessage);
  }
  return base;
}

export type MappedMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  msg_type: string;
  content: string | null;
  reply_to_id: string | null;
  thread_root_message_id: string | null;
  is_channel_post: boolean;
  view_count: number;
  comment_count: number;
  forwarded_from_message_id: string | null;
  forwarded_from_name: string | null;
  forwarded_from_chat_id: string | null;
  forwarded_from_sender_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  status: string;
  transport: string | null;
  created_at: number;
  updated_at: number;
  media?: MappedMedia[];
  reactions?: MappedMessageReaction[];
};

export type MappedMessageReaction = {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
};

export function mapMessage(
  message: Message & { media?: Media[]; reactions?: MessageReaction[] },
  opts?: {
    includeMedia?: boolean;
    includeReactions?: boolean;
    currentUserId?: string;
  },
): MappedMessage {
  const base: MappedMessage = {
    id: message.id,
    chat_id: message.chatId,
    sender_id: message.senderId,
    msg_type: message.msgType,
    content: message.content ?? null,
    reply_to_id: message.replyToId ?? null,
    thread_root_message_id: message.threadRootMessageId ?? null,
    is_channel_post: message.isChannelPost,
    view_count: message.viewCount,
    comment_count: message.commentCount,
    forwarded_from_message_id: message.forwardedFromMessageId ?? null,
    forwarded_from_name: message.forwardedFromName ?? null,
    forwarded_from_chat_id: message.forwardedFromChatId ?? null,
    forwarded_from_sender_id: message.forwardedFromSenderId ?? null,
    is_edited: message.isEdited,
    is_deleted: message.isDeleted,
    status: message.status,
    transport: message.transport ?? null,
    created_at: dateToUnixMs(message.createdAt) ?? 0,
    updated_at: dateToUnixMs(message.updatedAt) ?? 0,
  };
  if (opts?.includeMedia && message.media) {
    base.media = message.media.map(mapMedia);
  }
  if (opts?.includeReactions) {
    const grouped = new Map<string, { count: number; reacted_by_me: boolean }>();
    for (const reaction of message.reactions ?? []) {
      const existing = grouped.get(reaction.emoji) ?? {
        count: 0,
        reacted_by_me: false,
      };
      existing.count += 1;
      if (opts.currentUserId && reaction.userId === opts.currentUserId) {
        existing.reacted_by_me = true;
      }
      grouped.set(reaction.emoji, existing);
    }
    base.reactions = [...grouped.entries()].map(([emoji, reaction]) => ({
      emoji,
      count: reaction.count,
      reacted_by_me: reaction.reacted_by_me,
    }));
  }
  return base;
}

export type MappedMedia = {
  id: string;
  message_id: string;
  media_type: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  remote_url: string | null;
  thumbnail_url: string | null;
  waveform: string | null;
  is_round: boolean;
  created_at: number;
};

export function mapMedia(media: Media): MappedMedia {
  return {
    id: media.id,
    message_id: media.messageId,
    media_type: media.mediaType,
    file_name: media.fileName ?? null,
    mime_type: media.mimeType ?? null,
    file_size: media.fileSize ?? null,
    width: media.width ?? null,
    height: media.height ?? null,
    duration_ms: media.durationMs ?? null,
    remote_url: media.remoteUrl ?? null,
    thumbnail_url: media.thumbnailUrl ?? null,
    waveform: media.waveform
      ? Buffer.from(media.waveform).toString('base64')
      : null,
    is_round: media.isRound,
    created_at: dateToUnixMs(media.createdAt) ?? 0,
  };
}
