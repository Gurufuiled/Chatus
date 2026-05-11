import assert from 'node:assert/strict';
import { getGroupLineSyncPeerUserId, getOtherGroupMemberUserIds } from './groupLineSyncPeer';

assert.equal(getGroupLineSyncPeerUserId(null, 'u1'), null);
assert.equal(getGroupLineSyncPeerUserId({ chat_type: 'private', members: [] }, 'u1'), null);
assert.equal(
  getGroupLineSyncPeerUserId(
    { chat_type: 'group', members: [{ user_id: 'self' }] },
    'self',
  ),
  null,
);
assert.equal(
  getGroupLineSyncPeerUserId(
    {
      chat_type: 'group',
      members: [{ user_id: 'zebra' }, { user_id: 'self' }, { user_id: 'alpha' }],
    },
    'self',
  ),
  'alpha',
);
assert.deepEqual(
  getOtherGroupMemberUserIds(
    {
      chat_type: 'group',
      members: [{ user_id: 'zebra' }, { user_id: 'self' }, { user_id: 'alpha' }],
    },
    'self',
  ),
  ['zebra', 'alpha'],
);

assert.deepEqual(getOtherGroupMemberUserIds({ chat_type: 'private', members: [] }, 'u1'), []);
assert.equal(
  getGroupLineSyncPeerUserId(
    {
      chat_type: 'group',
      members: [{ user_id: 'b' }, { user_id: 'a' }],
    },
    'a',
  ),
  'b',
);
