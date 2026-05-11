import assert from 'node:assert/strict';
import { decideP2PTextAttempt } from './p2pSendDecision';
import { resolvePrivateTextTransportRoute } from './privateTextTransportRouting';

const privateChat = {
  chat_type: 'private' as const,
  members: [{ user_id: 'me' }, { user_id: 'peer-1' }],
};

const matrix: Array<{
  label: string;
  input: Parameters<typeof resolvePrivateTextTransportRoute>[0];
}> = [
  {
    label: 'enabled private text',
    input: {
      enabled: true,
      msgType: 'text',
      chat: privateChat,
      currentUserId: 'me',
    },
  },
  {
    label: 'disabled',
    input: {
      enabled: false,
      msgType: 'text',
      chat: privateChat,
      currentUserId: 'me',
    },
  },
  {
    label: 'not text',
    input: {
      enabled: true,
      msgType: 'image',
      chat: privateChat,
      currentUserId: 'me',
    },
  },
  {
    label: 'group chat',
    input: {
      enabled: true,
      msgType: 'text',
      chat: { chat_type: 'group', members: privateChat.members },
      currentUserId: 'me',
    },
  },
  {
    label: 'missing chat',
    input: {
      enabled: true,
      msgType: 'text',
      chat: undefined,
      currentUserId: 'me',
    },
  },
  {
    label: 'no current user',
    input: {
      enabled: true,
      msgType: 'text',
      chat: privateChat,
      currentUserId: null,
    },
  },
];

for (const { label, input } of matrix) {
  const d = decideP2PTextAttempt(input);
  const r = resolvePrivateTextTransportRoute(input);
  if (d.attemptPeer === false) {
    assert.equal(r.mode, 'server_direct', label);
    assert.equal(r.skipReason, d.reason, label);
  } else {
    assert.equal(r.mode, 'peer_first', label);
    assert.equal(r.recipientUserId, d.recipientUserId, label);
  }
}
