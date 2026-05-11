/** All other members of a group chat (for peer fan-out). */
export function getOtherGroupMemberUserIds(
  chat: { chat_type?: string; members?: { user_id: string }[] } | null | undefined,
  currentUserId: string | null,
): string[] {
  if (!chat || chat.chat_type !== 'group' || !currentUserId) return [];
  return (chat.members ?? [])
    .map((m) => m.user_id)
    .filter((id): id is string => Boolean(id) && id !== currentUserId);
}

/** Stable peer choice for group LineSync handshake (sorted `user_id`, excluding self). */
export function getGroupLineSyncPeerUserId(
  chat: { chat_type?: string; members?: { user_id: string }[] } | null | undefined,
  currentUserId: string | null,
): string | null {
  if (!chat || chat.chat_type !== 'group' || !currentUserId) return null;
  const others = (chat.members ?? [])
    .map((m) => m.user_id)
    .filter((id): id is string => Boolean(id) && id !== currentUserId)
    .sort();
  return others[0] ?? null;
}
