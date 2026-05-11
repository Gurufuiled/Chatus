import assert from 'node:assert/strict';
import { parseBlobRef, parseMessageCreateEvent } from './lineSyncProtocol';
import {
  buildPendingLineSyncRowForUploadedMedia,
  buildMessageCreateEventFromOutgoingMessage,
  buildServerBlobRefFromUploadedMedia,
  buildPendingLineSyncRowForText,
  buildPendingLineSyncRowFromOutgoingMessage,
  buildPeerOnlyBlobRefFromLocalMedia,
  buildPendingLineSyncRowForPeerMedia,
  buildPendingLineSyncRowForPeerMediaMultiple,
  LINE_SYNC_MVP_AUTHOR_DEVICE_ID,
  LINE_SYNC_SYNC_STATE_P2P_DELIVERED,
  messageIdToLineSyncEventId,
  shouldLinkLineSyncOptimisticEchoToServer,
} from './lineSyncEventBuilder';

assert.equal(LINE_SYNC_SYNC_STATE_P2P_DELIVERED, 'p2p_delivered');

const baseMsg = {
  id: 'temp-100',
  chat_id: 'chat-1',
  sender_id: 'user-9',
  msg_type: 'text',
  content: 'hello line',
  reply_to_id: null as string | null,
  created_at: 1700000000001,
};

const ev = buildMessageCreateEventFromOutgoingMessage(baseMsg, {
  authorDeviceId: 'dev-install-1',
});
assert.equal(ev.type, 'message.create');
assert.equal(ev.event_id, 'msg:temp-100');
assert.equal(ev.line_id, 'chat-1');
assert.equal(ev.author_user_id, 'user-9');
assert.equal(ev.author_device_id, 'dev-install-1');
assert.equal(ev.content_type, 'text');
assert.equal(ev.content, 'hello line');
assert.deepEqual(ev.parent_event_ids, []);
assert.match(ev.signature, /^unsigned:/);
assert.equal(ev.logical_clock, ev.created_at);

const parsedEv = parseMessageCreateEvent(ev);
assert.equal(parsedEv.ok, true);
if (parsedEv.ok) {
  assert.equal(parsedEv.value.content, 'hello line');
  assert.equal(parsedEv.value.reply_to_event_id, undefined);
}

const replied = parseMessageCreateEvent({
  ...buildMessageCreateEventFromOutgoingMessage({
    ...baseMsg,
    id: 'temp-101',
    reply_to_id: 'server-msg-42',
  }),
});
assert.equal(replied.ok, true);
if (replied.ok) {
  assert.equal(replied.value.reply_to_event_id, 'msg:server-msg-42');
}

const row = buildPendingLineSyncRowFromOutgoingMessage({
  ...baseMsg,
  id: 'temp-102',
});
assert.equal(row.event_type, 'message.create');
assert.equal(row.sync_state, 'pending');
const payloadOk = parseMessageCreateEvent(JSON.parse(row.payload_json));
assert.equal(payloadOk.ok, true);
if (payloadOk.ok) {
  assert.equal(payloadOk.value.event_id, 'msg:temp-102');
  assert.equal(payloadOk.value.signature, `unsigned:${messageIdToLineSyncEventId('temp-102')}`);
}

assert.equal(buildPendingLineSyncRowForText({ ...baseMsg, msg_type: 'image' }), null);

assert.equal(
  shouldLinkLineSyncOptimisticEchoToServer({ msgType: 'text', matchedByClientTempId: true }),
  true
);
assert.equal(
  shouldLinkLineSyncOptimisticEchoToServer({ msgType: 'text', matchedByClientTempId: false }),
  false
);
assert.equal(
  shouldLinkLineSyncOptimisticEchoToServer({ msgType: 'video_note', matchedByClientTempId: true }),
  true
);

const inboundRow = buildPendingLineSyncRowForText({
  ...baseMsg,
  id: 'srv-77',
  sender_id: 'peer-1',
});
assert.ok(inboundRow);
const inboundParsed = parseMessageCreateEvent(JSON.parse(inboundRow!.payload_json));
assert.equal(inboundParsed.ok, true);
if (inboundParsed.ok) {
  assert.equal(inboundParsed.value.event_id, 'msg:srv-77');
  assert.equal(inboundParsed.value.author_user_id, 'peer-1');
}

const defaultDev = buildMessageCreateEventFromOutgoingMessage(baseMsg);
assert.equal(defaultDev.author_device_id, LINE_SYNC_MVP_AUTHOR_DEVICE_ID);

const imageEv = parseMessageCreateEvent(
  buildMessageCreateEventFromOutgoingMessage({
    ...baseMsg,
    msg_type: 'image',
    content: null,
    id: 'temp-img',
  })
);
assert.equal(imageEv.ok, true);
if (imageEv.ok) {
  assert.equal(imageEv.value.content_type, 'image');
  assert.equal(imageEv.value.blob_refs, undefined);
}

const locPeer = { type: 'peer' as const, node_id: 'n1', user_id: 'u1' };
const blobSynthetic = parseMessageCreateEvent({
  ...JSON.parse(JSON.stringify(ev)),
  event_id: 'msg:blob-msg',
  content_type: 'image',
  blob_refs: [
    {
      blob_id: 'b1',
      kind: 'image',
      size_bytes: 10,
      sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      locations: [locPeer],
    },
  ],
});
assert.equal(blobSynthetic.ok, true);
if (blobSynthetic.ok && blobSynthetic.value.blob_refs?.[0]) {
  const blobParsed = parseBlobRef(blobSynthetic.value.blob_refs[0], '$');
  assert.equal(blobParsed.ok, true);
}

const uploadedBlob = buildServerBlobRefFromUploadedMedia({
  kind: 'image',
  url: 'https://api.example/uploads/a.jpg',
  sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  sizeBytes: 123,
  mimeType: 'image/jpeg',
});
assert.ok(uploadedBlob);
assert.equal(uploadedBlob!.locations[0]?.type, 'server');

const mediaRow = buildPendingLineSyncRowForUploadedMedia(
  {
    ...baseMsg,
    id: 'temp-media',
    msg_type: 'image',
    content: 'caption',
  },
  [
    {
      kind: 'image',
      url: 'https://api.example/uploads/a.jpg',
      sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      sizeBytes: 123,
      mimeType: 'image/jpeg',
    },
  ]
);
assert.ok(mediaRow);
const mediaParsed = parseMessageCreateEvent(JSON.parse(mediaRow!.payload_json));
assert.equal(mediaParsed.ok, true);
if (mediaParsed.ok) {
  assert.equal(mediaParsed.value.content_type, 'image');
  assert.equal(mediaParsed.value.blob_refs?.[0]?.sha256, uploadedBlob!.sha256);
}

const mixedUploadRow = buildPendingLineSyncRowForUploadedMedia(
  {
    ...baseMsg,
    id: 'temp-mix-upload',
    msg_type: 'image',
    content: null,
  },
  [
    {
      kind: 'image',
      url: 'https://api.example/uploads/a.jpg',
      sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      sizeBytes: 10,
    },
    {
      kind: 'video',
      url: 'https://api.example/uploads/v.mp4',
      sha256: 'beeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeed',
      sizeBytes: 20,
    },
  ],
);
assert.ok(mixedUploadRow);
const mixedUploadParsed = parseMessageCreateEvent(JSON.parse(mixedUploadRow!.payload_json));
assert.equal(mixedUploadParsed.ok, true);
if (mixedUploadParsed.ok) {
  assert.equal(mixedUploadParsed.value.content_type, 'media_album');
}

const twoImageUploadRow = buildPendingLineSyncRowForUploadedMedia(
  {
    ...baseMsg,
    id: 'temp-2img-upload',
    msg_type: 'image',
    content: null,
  },
  [
    {
      kind: 'image',
      url: 'https://api.example/uploads/a.jpg',
      sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      sizeBytes: 10,
    },
    {
      kind: 'image',
      url: 'https://api.example/uploads/b.jpg',
      sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      sizeBytes: 11,
    },
  ],
);
assert.ok(twoImageUploadRow);
const twoImgUploadParsed = parseMessageCreateEvent(JSON.parse(twoImageUploadRow!.payload_json));
assert.equal(twoImgUploadParsed.ok, true);
if (twoImgUploadParsed.ok) {
  assert.equal(twoImgUploadParsed.value.content_type, 'image');
}

assert.equal(
  buildPendingLineSyncRowForUploadedMedia({ ...baseMsg, msg_type: 'image' }, [
    { kind: 'image', url: 'https://api.example/uploads/a.jpg', sha256: null, sizeBytes: 123 },
  ]),
  null
);

const peerBlob = buildPeerOnlyBlobRefFromLocalMedia({
  kind: 'image',
  sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  sizeBytes: 999,
  mimeType: 'image/jpeg',
  senderUserId: 'user-9',
});
assert.ok(peerBlob);
const peerBlobParsed = parseBlobRef(peerBlob!, '$');
assert.equal(peerBlobParsed.ok, true);

const peerMediaRow = buildPendingLineSyncRowForPeerMedia(
  { ...baseMsg, msg_type: 'image', content: null },
  peerBlob!,
);
assert.ok(peerMediaRow);
const peerPayload = parseMessageCreateEvent(JSON.parse(peerMediaRow!.payload_json));
assert.equal(peerPayload.ok, true);
if (peerPayload.ok) {
  assert.equal(peerPayload.value.blob_refs?.[0]?.locations[0]?.type, 'peer');
}

const peerBlob2 = buildPeerOnlyBlobRefFromLocalMedia({
  kind: 'image',
  sha256: 'beeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeed',
  sizeBytes: 42,
  mimeType: 'image/png',
  senderUserId: 'user-9',
});
assert.ok(peerBlob2);
const peerAlbumRow = buildPendingLineSyncRowForPeerMediaMultiple(
  { ...baseMsg, msg_type: 'image', content: 'caption' },
  [peerBlob!, peerBlob2!],
);
assert.ok(peerAlbumRow);
const peerAlbumPayload = parseMessageCreateEvent(JSON.parse(peerAlbumRow!.payload_json));
assert.equal(peerAlbumPayload.ok, true);
if (peerAlbumPayload.ok) {
  assert.equal(peerAlbumPayload.value.blob_refs?.length, 2);
  assert.equal(peerAlbumPayload.value.blob_refs?.[1]?.locations[0]?.type, 'peer');
  assert.equal(peerAlbumPayload.value.content_type, 'image');
}

const peerBlobVideo = buildPeerOnlyBlobRefFromLocalMedia({
  kind: 'video',
  sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  sizeBytes: 333,
  mimeType: 'video/mp4',
  senderUserId: 'user-9',
});
assert.ok(peerBlobVideo);
const mixedAlbumRow = buildPendingLineSyncRowForPeerMediaMultiple(
  { ...baseMsg, msg_type: 'image', content: 'cap' },
  [peerBlob!, peerBlobVideo!],
);
assert.ok(mixedAlbumRow);
const mixedParsed = parseMessageCreateEvent(JSON.parse(mixedAlbumRow!.payload_json));
assert.equal(mixedParsed.ok, true);
if (mixedParsed.ok) {
  assert.equal(mixedParsed.value.content_type, 'media_album');
  assert.equal(mixedParsed.value.blob_refs?.[0]?.kind, 'image');
  assert.equal(mixedParsed.value.blob_refs?.[1]?.kind, 'video');
}
