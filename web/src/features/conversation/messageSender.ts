import { resolveMediaUrl } from '@/services/mediaService';
import type { ChatSummary } from '@/types/chat';
import type { MappedMessage } from '@/types/message';

/** Telegram-like: consecutive messages within this gap stay in one visual run. */
export const GROUP_MSG_TIME_GAP_MS = 60_000;

const SENDER_COLORS = [
  '#E17076',
  '#7BC862',
  '#E5B03C',
  '#65AADD',
  '#A695E7',
  '#EE7AAE',
  '#6EC9CB',
  '#FAA774',
];

export type MessageSenderInfo = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
};

export function hashSenderColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length]!;
}

export function isSystemLikeMessage(message: MappedMessage): boolean {
  return message.msg_type === 'system';
}

/**
 * Resolve display name + avatar for a message sender.
 * Prefers fields on the message, then chat members cache.
 */
export function resolveMessageSender(
  chat: ChatSummary | undefined,
  message: MappedMessage,
): MessageSenderInfo {
  const member = chat?.members?.find((m) => m.user_id === message.sender_id);
  const displayName =
    message.sender_name?.trim() ||
    member?.user?.display_name?.trim() ||
    member?.user?.username?.trim() ||
    member?.user?.handle?.trim() ||
    'Участник';
  const rawAvatar =
    message.sender_avatar_url?.trim() || member?.user?.avatar_url?.trim() || null;
  return {
    userId: message.sender_id,
    displayName,
    avatarUrl: rawAvatar ? resolveMediaUrl(rawAvatar) : null,
    color: hashSenderColor(message.sender_id || displayName),
  };
}

/**
 * Whether two adjacent (chronological) messages form one Telegram-style run.
 * System messages break the chain. Incoming runs also require the same sender.
 */
export function isSameGroupMessageRun(
  earlier: MappedMessage | undefined,
  later: MappedMessage | undefined,
  meId: string | undefined,
): boolean {
  if (!earlier || !later) return false;
  if (isSystemLikeMessage(earlier) || isSystemLikeMessage(later)) return false;
  const earlierOut = !!meId && earlier.sender_id === meId;
  const laterOut = !!meId && later.sender_id === meId;
  if (earlierOut !== laterOut) return false;
  if (Math.abs(earlier.created_at - later.created_at) > GROUP_MSG_TIME_GAP_MS) return false;
  if (!laterOut) {
    return earlier.sender_id === later.sender_id;
  }
  return true;
}
