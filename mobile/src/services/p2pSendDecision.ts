export type P2PDecisionChatMember = {
  user_id?: string | null;
};

export type P2PDecisionChatSnapshot = {
  chat_type?: string | null;
  members?: P2PDecisionChatMember[] | null;
} | null | undefined;

export type P2PSendSkipReason =
  | 'disabled'
  | 'not_text'
  | 'not_private_or_missing_peer';

export type P2PSendDecision =
  | { attemptPeer: true; recipientUserId: string }
  | { attemptPeer: false; reason: P2PSendSkipReason };

export function resolvePrivateChatPeerId(
  chat: P2PDecisionChatSnapshot,
  currentUserId: string | null | undefined,
): string | null {
  if (!currentUserId || !chat || chat.chat_type !== 'private') return null;

  const peers = chat.members?.filter((member) => member.user_id !== currentUserId) ?? [];

  return peers.length === 1 && peers[0].user_id ? peers[0].user_id : null;
}

export function decideP2PTextAttempt(input: {
  enabled: boolean;
  msgType: string;
  chat: P2PDecisionChatSnapshot;
  currentUserId: string | null | undefined;
}): P2PSendDecision {
  if (!input.enabled) {
    return { attemptPeer: false, reason: 'disabled' };
  }

  if (input.msgType !== 'text') {
    return { attemptPeer: false, reason: 'not_text' };
  }

  const recipientUserId = resolvePrivateChatPeerId(input.chat, input.currentUserId);
  if (!recipientUserId) {
    return { attemptPeer: false, reason: 'not_private_or_missing_peer' };
  }

  return { attemptPeer: true, recipientUserId };
}
