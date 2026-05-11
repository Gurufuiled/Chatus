import assert from 'node:assert/strict';
import type { Chat } from '../stores/types';
import { chatStore } from '../stores/chatStore';
import {
  buildLineSyncAclContextForBlobRequest,
  mayServeBlobRequestForPeer,
} from './lineSyncBlobAcl';

function stubChat(partial: Partial<Chat> & Pick<Chat, 'id' | 'chat_type'>): Chat {
  return {
    name: null,
    avatar_url: null,
    created_by: null,
    last_message_id: null,
    pinned_message_id: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count: 0,
    is_muted: 0,
    is_pinned: 0,
    is_archived: 0,
    draft: null,
    created_at: 0,
    updated_at: 0,
    ...partial,
  } as Chat;
}

chatStore.setState({ chats: [] });

assert.equal(buildLineSyncAclContextForBlobRequest('missing', 'u1'), null);
assert.equal(mayServeBlobRequestForPeer('missing', 'u1'), false);

chatStore.setState({
  chats: [
    stubChat({
      id: 'priv1',
      chat_type: 'private',
      members: [{ user_id: 'a' }, { user_id: 'b' }],
    }),
  ],
});
const privCtx = buildLineSyncAclContextForBlobRequest('priv1', 'a');
assert.equal(privCtx?.line_type, 'private');
assert.equal(mayServeBlobRequestForPeer('priv1', 'a'), true);
assert.equal(mayServeBlobRequestForPeer('priv1', 'intruder'), false);

chatStore.setState({
  chats: [
    stubChat({
      id: 'grp1',
      chat_type: 'group',
      members: [{ user_id: 'm1', role: 'member' }],
    }),
  ],
});
assert.equal(mayServeBlobRequestForPeer('grp1', 'm1'), true);
assert.equal(mayServeBlobRequestForPeer('grp1', 'outsider'), false);

chatStore.setState({
  chats: [
    stubChat({
      id: 'ch1',
      chat_type: 'channel',
      members: [{ user_id: 'sub1', role: 'subscriber' }],
    }),
  ],
});
assert.equal(mayServeBlobRequestForPeer('ch1', 'sub1'), true);

// Private: not exactly two distinct participants → no context (stale / broken snapshot).
chatStore.setState({
  chats: [
    stubChat({
      id: 'priv-bad-1',
      chat_type: 'private',
      members: [{ user_id: 'only' }],
    }),
  ],
});
assert.equal(buildLineSyncAclContextForBlobRequest('priv-bad-1', 'only'), null);
assert.equal(mayServeBlobRequestForPeer('priv-bad-1', 'only'), false);

chatStore.setState({
  chats: [
    stubChat({
      id: 'priv-bad-2',
      chat_type: 'private',
      members: [
        { user_id: 'a' },
        { user_id: 'b' },
        { user_id: 'c' },
      ],
    }),
  ],
});
assert.equal(buildLineSyncAclContextForBlobRequest('priv-bad-2', 'a'), null);

chatStore.setState({
  chats: [
    stubChat({
      id: 'priv-bad-3',
      chat_type: 'private',
      // Same id twice → one distinct id after Set → cannot form a two-party private line.
      members: [{ user_id: 'a' }, { user_id: 'a' }],
    }),
  ],
});
assert.equal(buildLineSyncAclContextForBlobRequest('priv-bad-3', 'a'), null);

// Discussion: same ACL branch as channel (line_type still `channel` in ctx).
chatStore.setState({
  chats: [
    stubChat({
      id: 'disc1',
      chat_type: 'discussion',
      members: [{ user_id: 'd1', role: 'subscriber' }],
    }),
  ],
});
const discCtx = buildLineSyncAclContextForBlobRequest('disc1', 'd1');
assert.equal(discCtx?.line_type, 'channel');
assert.equal(discCtx?.channel_role, 'subscriber');
assert.equal(mayServeBlobRequestForPeer('disc1', 'd1'), true);
assert.equal(mayServeBlobRequestForPeer('disc1', 'nope'), false);

// Channel owner / admin also allowed to request blobs (not only subscriber).
chatStore.setState({
  chats: [
    stubChat({
      id: 'ch-owner',
      chat_type: 'channel',
      members: [{ user_id: 'owner1', role: 'owner' }],
    }),
  ],
});
assert.equal(mayServeBlobRequestForPeer('ch-owner', 'owner1'), true);

chatStore.setState({
  chats: [
    stubChat({
      id: 'ch-admin',
      chat_type: 'channel',
      members: [{ user_id: 'adm1', role: 'admin' }],
      channel_permissions: {
        can_post: false,
        can_manage_admins: false,
        can_edit_channel: false,
        can_moderate_subscribers: false,
        can_edit_channel_avatar: false,
        can_edit_channel_name: false,
        can_edit_channel_description: false,
        can_add_admins: false,
        can_remove_admins: false,
        can_edit_admin_permissions: false,
      },
    }),
  ],
});
assert.equal(mayServeBlobRequestForPeer('ch-admin', 'adm1'), true);

chatStore.setState({ chats: [] });
