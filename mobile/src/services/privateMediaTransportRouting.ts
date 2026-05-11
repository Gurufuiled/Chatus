import type { P2PDecisionChatSnapshot } from './p2pSendDecision';
import { resolvePrivateChatPeerId } from './p2pSendDecision';

/** Типы медиа с одним вложением в личке — peer-first. Альбом: несколько blob в одном сообщении; при **смеси** image+video клиент выставляет LineSync `content_type: media_album`, см. `08-linesync-protocol-draft.md`. */
export const P2P_PEER_FIRST_MEDIA_MSG_TYPES = new Set([
  'image',
  'voice',
  'video_note',
  'video',
  'file',
]);

export type P2PMediaSkipReason =
  | 'disabled'
  | 'unsupported_type'
  | 'not_private_or_missing_peer';

export type PrivateMediaTransportRoute =
  | { mode: 'peer_first'; recipientUserId: string }
  | { mode: 'server_direct'; skipReason: P2PMediaSkipReason };

export function resolvePrivateMediaTransportRoute(input: {
  enabled: boolean;
  msgType: string;
  chat: P2PDecisionChatSnapshot;
  currentUserId: string | null | undefined;
}): PrivateMediaTransportRoute {
  if (!input.enabled) {
    return { mode: 'server_direct', skipReason: 'disabled' };
  }
  if (!P2P_PEER_FIRST_MEDIA_MSG_TYPES.has(input.msgType)) {
    return { mode: 'server_direct', skipReason: 'unsupported_type' };
  }
  const recipientUserId = resolvePrivateChatPeerId(input.chat, input.currentUserId);
  if (!recipientUserId) {
    return { mode: 'server_direct', skipReason: 'not_private_or_missing_peer' };
  }
  return { mode: 'peer_first', recipientUserId };
}
