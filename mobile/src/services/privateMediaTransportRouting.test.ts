import assert from 'node:assert/strict';
import { resolvePrivateChatPeerId } from './p2pSendDecision';
import {
  P2P_PEER_FIRST_MEDIA_MSG_TYPES,
  resolvePrivateMediaTransportRoute,
} from './privateMediaTransportRouting';

const privateChat = {
  chat_type: 'private' as const,
  members: [{ user_id: 'me' }, { user_id: 'peer-1' }],
};

assert.ok(P2P_PEER_FIRST_MEDIA_MSG_TYPES.has('image'));
assert.ok(P2P_PEER_FIRST_MEDIA_MSG_TYPES.has('voice'));

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: true,
    msgType: 'image',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { mode: 'peer_first', recipientUserId: 'peer-1' },
);

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: true,
    msgType: 'voice',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { mode: 'peer_first', recipientUserId: 'peer-1' },
);

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: true,
    msgType: 'video_note',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { mode: 'peer_first', recipientUserId: 'peer-1' },
);

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: true,
    msgType: 'video',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { mode: 'peer_first', recipientUserId: 'peer-1' },
);

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: true,
    msgType: 'file',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { mode: 'peer_first', recipientUserId: 'peer-1' },
);

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: false,
    msgType: 'image',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { mode: 'server_direct', skipReason: 'disabled' },
);

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: true,
    msgType: 'text',
    chat: privateChat,
    currentUserId: 'me',
  }),
  { mode: 'server_direct', skipReason: 'unsupported_type' },
);

assert.deepEqual(
  resolvePrivateMediaTransportRoute({
    enabled: true,
    msgType: 'image',
    chat: undefined,
    currentUserId: 'me',
  }),
  { mode: 'server_direct', skipReason: 'not_private_or_missing_peer' },
);

assert.equal(resolvePrivateChatPeerId(privateChat, 'me'), 'peer-1');
