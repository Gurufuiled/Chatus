import type { ChatSummary } from '@/types/chat';
import type { MappedMessage } from '@/types/message';

export type ChannelCommentSettings = Pick<
  ChatSummary,
  'disable_comments_all' | 'disable_comments_new' | 'disable_comments_new_since'
>;

/** Mirrors server `resolveCommentAccessForPost` / mobile ChannelFeedScreen. */
export function canCommentOnPost(
  post: MappedMessage,
  channel: ChannelCommentSettings | null | undefined,
  globalCanComment: boolean,
): boolean {
  if (!globalCanComment) return false;
  if (!channel) return true;
  if (channel.disable_comments_all) return false;
  if (
    channel.disable_comments_new &&
    channel.disable_comments_new_since &&
    post.created_at >= channel.disable_comments_new_since
  ) {
    return false;
  }
  return true;
}

export function isChannelPreviewRequired(
  channel: ChatSummary,
  currentUserId: string | null,
): boolean {
  if (channel.chat_type !== 'channel') return false;
  if (channel.can_view_full_feed) return false;
  const creatorId = channel.created_by_id ?? channel.created_by;
  if (creatorId && creatorId === currentUserId) return false;
  return channel.access_status !== 'active';
}

export function formatMemberCount(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} участник`;
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
    return `${count} участника`;
  }
  return `${count} участников`;
}

export function formatSubscriberCount(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} подписчик`;
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
    return `${count} подписчика`;
  }
  return `${count} подписчиков`;
}

export function formatViewCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
