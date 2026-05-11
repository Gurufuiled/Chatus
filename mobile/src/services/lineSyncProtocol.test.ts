import assert from 'node:assert/strict';
import {
  canAnnounceBlobMirror,
  canCreateLineMessage,
  canDeleteForEveryone,
  canEditLineMessage,
  canRequestLineBlob,
  parseBlobMirrorDown,
  parseBlobMirrorUp,
  parseBlobAnnounce,
  parseBlobChunk,
  parseBlobRef,
  parseBlobRequest,
  parseLineSyncBlobMessage,
  parseLinePatch,
  parseLinePatchAck,
  parseLinePatchRequest,
  parseLineSummary,
  parseLineSyncMessageEvent,
  parseLineSyncPeerMessage,
  parseMessageCreateEvent,
  parseMessageDeleteEvent,
  parseMessageEditEvent,
} from './lineSyncProtocol';

const baseCreate = {
  type: 'message.create' as const,
  event_id: 'e1',
  line_id: 'line-a',
  author_user_id: 'u1',
  author_device_id: 'd1',
  created_at: 1,
  logical_clock: 1,
  parent_event_ids: [] as string[],
  content_type: 'text' as const,
  signature: 'sig',
};

assert.equal(parseMessageCreateEvent(baseCreate).ok, true);

assert.equal(parseMessageCreateEvent({ ...baseCreate, type: 'x' }).ok, false);
assert.equal(parseMessageCreateEvent({ ...baseCreate, parent_event_ids: [1] }).ok, false);
assert.equal(parseMessageCreateEvent({ ...baseCreate, signature: '' }).ok, false);

const locPeer = { type: 'peer' as const, node_id: 'n1', user_id: 'u1' };
const locServer = { type: 'server' as const, url: 'https://example.com/b', expires_at: 99 };
const blobRaw = {
  blob_id: 'b1',
  kind: 'image' as const,
  size_bytes: 10,
  sha256: 'deadbeef',
  locations: [locPeer, locServer],
};

const blobParsed = parseBlobRef(blobRaw, '$');
assert.equal(blobParsed.ok, true);
if (blobParsed.ok) {
  assert.deepEqual(blobParsed.value.locations, [locPeer, locServer]);
}

const h64a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const h64b = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const mediaAlbumParseOk = parseMessageCreateEvent({
  ...baseCreate,
  content_type: 'media_album',
  blob_refs: [
    {
      blob_id: 'b-img',
      kind: 'image',
      size_bytes: 10,
      sha256: h64a,
      locations: [locPeer],
    },
    {
      blob_id: 'b-vid',
      kind: 'video',
      size_bytes: 20,
      sha256: h64b,
      locations: [locPeer],
    },
  ],
});
assert.equal(mediaAlbumParseOk.ok, true);

const mediaAlbumParseShort = parseMessageCreateEvent({
  ...baseCreate,
  content_type: 'media_album',
  blob_refs: [
    {
      blob_id: 'b-img',
      kind: 'image',
      size_bytes: 10,
      sha256: h64a,
      locations: [locPeer],
    },
  ],
});
assert.equal(mediaAlbumParseShort.ok, false);

assert.equal(parseMessageCreateEvent({ ...baseCreate, content_type: 'media_album' }).ok, false);

const withBlob = parseMessageCreateEvent({
  ...baseCreate,
  blob_refs: [blobRaw],
});
assert.equal(withBlob.ok, true);

const editOk = parseMessageEditEvent({
  type: 'message.edit',
  event_id: 'e2',
  line_id: 'line-a',
  target_event_id: 'e1',
  editor_user_id: 'u1',
  editor_device_id: 'd1',
  edited_at: 2,
  edit_revision: 1,
  signature: 'sig',
});
assert.equal(editOk.ok, true);

const delOk = parseMessageDeleteEvent({
  type: 'message.delete',
  event_id: 'e3',
  line_id: 'line-a',
  target_event_id: 'e1',
  deleter_user_id: 'u1',
  deleter_device_id: 'd1',
  deleted_at: 3,
  delete_mode: 'for_everyone',
  signature: 'sig',
});
assert.equal(delOk.ok, true);
if (delOk.ok) {
  const badMode = { ...delOk.value, delete_mode: 'invalid' as unknown };
  assert.equal(parseMessageDeleteEvent(badMode).ok, false);
}

const mirrorUp = parseBlobMirrorUp({
  type: 'BLOB_MIRROR_UP',
  line_id: 'line-a',
  blob_id: 'b1',
  sha256: 'cafe',
  node_id: 'n9',
  user_id: 'u2',
});
assert.equal(mirrorUp.ok, true);

const mirrorDown = parseBlobMirrorDown({
  type: 'BLOB_MIRROR_DOWN',
  line_id: 'line-a',
  blob_id: 'b1',
  node_id: 'n9',
});
assert.equal(mirrorDown.ok, true);

assert.equal(
  parseBlobAnnounce({
    type: 'BLOB_ANNOUNCE',
    line_id: 'line-a',
    blob_id: 'b1',
    sha256: 'cafe',
    node_id: 'n9',
    user_id: 'u2',
  }).ok,
  true
);

assert.equal(
  parseBlobRequest({
    type: 'BLOB_REQUEST',
    line_id: 'line-a',
    blob_id: 'b1',
    requester_node_id: 'n2',
    requester_user_id: 'u2',
    sha256: 'cafe',
    preferred_chunk_size: 32768,
  }).ok,
  true
);

assert.equal(
  parseBlobChunk({
    type: 'BLOB_CHUNK',
    line_id: 'line-a',
    blob_id: 'b1',
    sha256: 'cafe',
    node_id: 'n9',
    chunk_index: 0,
    total_chunks: 1,
    bytes_base64: 'AA==',
  }).ok,
  true
);
assert.equal(parseLineSyncBlobMessage({ type: 'BLOB_REQUEST' }).ok, false);
assert.equal(parseLineSyncBlobMessage(mirrorUp.ok ? mirrorUp.value : {}).ok, true);

assert.equal(parseLineSyncMessageEvent(baseCreate).ok, true);
assert.equal(parseLineSyncMessageEvent({ type: 'member.join' }).ok, false);

const summary = {
  type: 'LINE_SUMMARY' as const,
  line_id: 'line-a',
  node_id: 'node-1',
  head_event_ids: ['e1'],
  cursor: '1',
  updated_at: 1,
  retain_last_n: 10,
};
assert.equal(parseLineSummary(summary).ok, true);
assert.equal(parseLineSummary({ ...summary, head_event_ids: [1] }).ok, false);

assert.equal(
  parseLinePatchRequest({
    type: 'LINE_PATCH_REQUEST',
    line_id: 'line-a',
    mode: 'last_n',
    last_n: 10,
    max_events: 20,
  }).ok,
  true
);
assert.equal(
  parseLinePatchRequest({
    type: 'LINE_PATCH_REQUEST',
    line_id: 'line-a',
    mode: 'unknown',
    max_events: 20,
  }).ok,
  false
);

assert.equal(
  parseLinePatch({
    type: 'LINE_PATCH',
    line_id: 'line-a',
    base_cursor: null,
    new_cursor: '1',
    events: [baseCreate],
  }).ok,
  true
);
assert.equal(
  parseLinePatch({
    type: 'LINE_PATCH',
    line_id: 'line-b',
    base_cursor: null,
    new_cursor: '1',
    events: [baseCreate],
  }).ok,
  false
);

assert.equal(
  parseLinePatchAck({
    type: 'LINE_PATCH_ACK',
    line_id: 'line-a',
    applied_event_ids: ['e1'],
    new_head_event_ids: ['e1'],
    new_cursor: '1',
  }).ok,
  true
);
assert.equal(parseLineSyncPeerMessage(summary).ok, true);
assert.equal(parseLineSyncPeerMessage({ type: 'NOPE' }).ok, false);

const priv: Parameters<typeof canCreateLineMessage>[0] = {
  line_type: 'private',
  actor_user_id: 'a',
  private_participant_ids: ['a', 'b'],
};
assert.equal(canCreateLineMessage(priv), true);
assert.equal(
  canCreateLineMessage({ ...priv, actor_user_id: 'c' }),
  false,
);
assert.equal(
  canCreateLineMessage({ ...priv, private_participant_ids: ['a'] }),
  false,
);

const grp: Parameters<typeof canCreateLineMessage>[0] = {
  line_type: 'group',
  actor_user_id: 'm1',
  is_group_participant: true,
};
assert.equal(canCreateLineMessage(grp), true);
assert.equal(canCreateLineMessage({ ...grp, is_group_participant: false }), false);

const chOwner: Parameters<typeof canCreateLineMessage>[0] = {
  line_type: 'channel',
  actor_user_id: 'o1',
  channel_role: 'owner',
};
assert.equal(canCreateLineMessage(chOwner), true);

const chAdminPost: Parameters<typeof canCreateLineMessage>[0] = {
  line_type: 'channel',
  actor_user_id: 'a1',
  channel_role: 'admin',
  permissions: { can_post: true },
};
assert.equal(canCreateLineMessage(chAdminPost), true);
assert.equal(
  canCreateLineMessage({
    ...chAdminPost,
    permissions: { can_post: false },
  }),
  false,
);

const chSub: Parameters<typeof canCreateLineMessage>[0] = {
  line_type: 'channel',
  actor_user_id: 's1',
  channel_role: 'subscriber',
};
assert.equal(canCreateLineMessage(chSub), false);
assert.equal(
  canAnnounceBlobMirror({ ...chSub, line_type: 'channel', channel_role: 'subscriber' }),
  true,
);
assert.equal(
  canRequestLineBlob({ ...chSub, line_type: 'channel', channel_role: 'subscriber' }),
  true,
);

const editCtx: Parameters<typeof canEditLineMessage>[0] = {
  line_type: 'private',
  actor_user_id: 'a',
  target_author_user_id: 'a',
  private_participant_ids: ['a', 'b'],
};
assert.equal(canEditLineMessage(editCtx), true);
assert.equal(
  canEditLineMessage({ ...editCtx, actor_user_id: 'b' }),
  false,
);
assert.equal(
  canEditLineMessage({
    ...editCtx,
    private_participant_ids: ['x', 'y'],
  }),
  false,
);

assert.equal(
  canEditLineMessage({
    line_type: 'group',
    actor_user_id: 'mod',
    target_author_user_id: 'u9',
    is_group_participant: false,
    group_role: 'owner',
  }),
  false,
);
assert.equal(
  canEditLineMessage({
    line_type: 'group',
    actor_user_id: 'mod',
    target_author_user_id: 'u9',
    is_group_participant: true,
    group_role: 'owner',
  }),
  true,
);
assert.equal(
  canEditLineMessage({
    line_type: 'group',
    actor_user_id: 'mod',
    target_author_user_id: 'u9',
    is_group_participant: true,
    group_role: 'admin',
    permissions: { can_edit_others: true },
  }),
  true,
);
assert.equal(
  canEditLineMessage({
    line_type: 'group',
    actor_user_id: 'mod',
    target_author_user_id: 'u9',
    is_group_participant: true,
    group_role: 'admin',
    permissions: { can_edit_others: false },
  }),
  false,
);
assert.equal(
  canEditLineMessage({
    line_type: 'group',
    actor_user_id: 'u9',
    target_author_user_id: 'u9',
    is_group_participant: false,
  }),
  false,
);

assert.equal(
  canEditLineMessage({
    line_type: 'channel',
    actor_user_id: 'admin-author',
    target_author_user_id: 'admin-author',
    channel_role: 'admin',
  }),
  true,
);
assert.equal(
  canEditLineMessage({
    line_type: 'channel',
    actor_user_id: 'subscriber-author',
    target_author_user_id: 'subscriber-author',
    channel_role: 'subscriber',
  }),
  false,
);

assert.equal(
  canDeleteForEveryone({
    line_type: 'private',
    actor_user_id: 'b',
    target_author_user_id: 'a',
    private_participant_ids: ['a', 'b'],
  }),
  false,
);
assert.equal(
  canDeleteForEveryone({
    line_type: 'private',
    actor_user_id: 'a',
    target_author_user_id: 'a',
    private_participant_ids: ['a', 'b'],
  }),
  true,
);
assert.equal(
  canDeleteForEveryone({
    line_type: 'group',
    actor_user_id: 'owner',
    target_author_user_id: 'u9',
    is_group_participant: false,
    group_role: 'owner',
  }),
  false,
);
assert.equal(
  canDeleteForEveryone({
    line_type: 'group',
    actor_user_id: 'u9',
    target_author_user_id: 'u9',
    is_group_participant: false,
  }),
  false,
);
