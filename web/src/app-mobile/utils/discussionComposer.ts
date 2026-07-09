/** Stable composer-store key for channel post discussion threads. */
export function getDiscussionComposerId(channelId: string, postId: string): string {
  return `discussion:${channelId}:${postId}`;
}
