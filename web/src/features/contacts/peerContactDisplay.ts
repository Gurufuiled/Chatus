import type { ChatSummary } from '@/types/chat';
import type { PeerContactCustomization } from '@/types/peerContact';

/** Resolve the other participant in a private chat. */
export function getPrivateChatPeerUserId(
  chat: Pick<ChatSummary, 'chat_type' | 'members'>,
  meId: string | null | undefined,
): string | null {
  if (chat.chat_type !== 'private' || !meId) return null;
  const peer = chat.members?.find((m) => m.user_id && m.user_id !== meId);
  return peer?.user_id ?? null;
}

/** Local first+last name override shown only to the current user. */
export function formatPeerLocalDisplayName(
  contact: Pick<PeerContactCustomization, 'first_name' | 'last_name'> | null | undefined,
): string | null {
  if (!contact) return null;
  const name = [contact.first_name?.trim(), contact.last_name?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name.length > 0 ? name : null;
}

export function splitContactDisplayName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const space = trimmed.indexOf(' ');
  if (space < 0) return { firstName: trimmed, lastName: '' };
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim(),
  };
}
