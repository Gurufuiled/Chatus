import assert from 'node:assert/strict';
import { decideP2PTextAttempt, resolvePrivateChatPeerId } from './p2pSendDecision';

const privateChat = {
  chat_type: 'private',
  members: [{ user_id: 'me' }, { user_id: 'peer-1' }],
};

assert.equal(resolvePrivateChatPeerId(privateChat, 'me'), 'peer-1');

assert.deepEqual(
  decideP2PTextAttempt({
    enabled: true,
    msgType: 'text',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { attemptPeer: true, recipientUserId: 'peer-1' },
);

assert.deepEqual(
  decideP2PTextAttempt({
    enabled: false,
    msgType: 'text',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { attemptPeer: false, reason: 'disabled' },
);

assert.deepEqual(
  decideP2PTextAttempt({
    enabled: true,
    msgType: 'image',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { attemptPeer: false, reason: 'not_text' },
);

assert.deepEqual(
  decideP2PTextAttempt({
    enabled: true,
    msgType: 'text',
    chat: { chat_type: 'group', members: privateChat.members },
    currentUserId: 'me',
  }),
  { attemptPeer: false, reason: 'not_private_or_missing_peer' },
);

assert.deepEqual(
  decideP2PTextAttempt({
    enabled: true,
    msgType: 'text',
    chat: undefined,
    currentUserId: 'me',
  }),
  { attemptPeer: false, reason: 'not_private_or_missing_peer' },
);

assert.deepEqual(
  decideP2PTextAttempt({
    enabled: true,
    msgType: 'text',
    chat: privateChat,
    currentUserId: null,
  }),
  { attemptPeer: false, reason: 'not_private_or_missing_peer' },
);

assert.deepEqual(
  decideP2PTextAttempt({
    enabled: true,
    msgType: 'text',
    chat: { chat_type: 'channel', members: privateChat.members },
    currentUserId: 'me',
  }),
  { attemptPeer: false, reason: 'not_private_or_missing_peer' },
);

assert.equal(
  resolvePrivateChatPeerId(
    {
      chat_type: 'private',
      members: [{ user_id: 'me' }, { user_id: 'peer-1' }, { user_id: 'peer-2' }],
    },
    'me',
  ),
  null,
);

assert.equal(
  resolvePrivateChatPeerId(
    {
      chat_type: 'private',
      members: [{ user_id: 'me' }, { user_id: 'peer-1' }, {}],
    },
    'me',
  ),
  null,
);

assert.equal(
  resolvePrivateChatPeerId({ chat_type: 'private', members: [{ user_id: 'me' }] }, 'me'),
  null,
);

assert.equal(resolvePrivateChatPeerId({ chat_type: 'private', members: [] }, 'me'), null);
assert.equal(resolvePrivateChatPeerId({ chat_type: 'private', members: null }, 'me'), null);
