/**
 * Resolves LineSync ACL for blob transport using local chat snapshot (`chatStore`).
 * Used when serving `BLOB_REQUEST`: deny if we cannot prove the requester belongs to the line.
 */

import { chatStore } from '../stores/chatStore';
import type { LineSyncAclContext } from './lineSyncProtocol';
import { canRequestLineBlob } from './lineSyncProtocol';

function mapGroupRole(role: string | undefined): 'member' | 'admin' | 'owner' {
  const r = (role ?? 'member').toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'admin') return 'admin';
  return 'member';
}

function mapChannelRole(role: string | undefined): 'owner' | 'admin' | 'subscriber' {
  const r = (role ?? 'subscriber').toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'admin') return 'admin';
  return 'subscriber';
}

/**
 * Build ACL context for `lineId` (chat id) and the requesting user. Returns `null` if the chat
 * is unknown locally or membership cannot be expressed (e.g. private chat without two members).
 */
export function buildLineSyncAclContextForBlobRequest(
  lineId: string,
  actorUserId: string,
): LineSyncAclContext | null {
  const chat = chatStore.getState().chats.find((c) => c.id === lineId);
  if (!chat) return null;

  const base = { actor_user_id: actorUserId } satisfies Pick<LineSyncAclContext, 'actor_user_id'>;

  if (chat.chat_type === 'private') {
    const ids: string[] = Array.from(new Set((chat.members ?? []).map((m) => m.user_id).filter((id) => id.length > 0)));
    if (ids.length !== 2) return null;
    return {
      ...base,
      line_type: 'private',
      private_participant_ids: ids,
    };
  }

  if (chat.chat_type === 'group') {
    const isParticipant = chat.members?.some((m) => m.user_id === actorUserId) ?? false;
    const roleStr = chat.members?.find((m) => m.user_id === actorUserId)?.role;
    return {
      ...base,
      line_type: 'group',
      is_group_participant: isParticipant,
      group_role: mapGroupRole(roleStr),
    };
  }

  if (chat.chat_type === 'channel' || chat.chat_type === 'discussion') {
    const member = chat.members?.find((m) => m.user_id === actorUserId);
    if (!member) return null;
    const channel_role = mapChannelRole(member.role);
    const perm = chat.channel_permissions;
    return {
      ...base,
      line_type: 'channel',
      channel_role,
      ...(perm
        ? {
            permissions: {
              can_post: perm.can_post,
              can_edit_others: undefined,
              can_delete_others: undefined,
            },
          }
        : {}),
    };
  }

  return null;
}

export function mayServeBlobRequestForPeer(lineId: string, requesterUserId: string): boolean {
  const ctx = buildLineSyncAclContextForBlobRequest(lineId, requesterUserId);
  return ctx != null && canRequestLineBlob(ctx);
}
