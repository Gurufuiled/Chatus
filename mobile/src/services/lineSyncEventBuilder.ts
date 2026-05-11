/**
 * Build LineSync `message.create` payloads for the SQLite event log from stored message fields
 * (optimistic send, server push, P2P dm_deliver, etc.).
 *
 * MVP: `logical_clock` mirrors `created_at` (milliseconds). Replace with Hybrid Logical Clock or
 * server-assigned sequence when sync exists.
 *
 * TODO: `signature` is a stable placeholder (`unsigned:<event_id>`); replace with real Ed25519 (or
 * product crypto) before trusting events across devices.
 */

import type { BlobRef, MessageContentType, MessageCreateEvent } from './lineSyncProtocol';
import type { LineSyncEventRow, MessageRow } from '../db/types';

function normalizeSha256(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

/** Fields required to build one `message.create` row; matches `messages` / store message core. */
export type LineSyncMessageRowPick = Pick<
  MessageRow,
  'id' | 'chat_id' | 'sender_id' | 'msg_type' | 'content' | 'reply_to_id' | 'created_at'
>;

/**
 * Placeholder device id until a stable per-install id is sourced (e.g. secure storage).
 * Incoming events also use this MVP value when the sender device is unknown; do not use it
 * as an authorship/trust signal until real device ids and signatures are implemented.
 */
export const LINE_SYNC_MVP_AUTHOR_DEVICE_ID = 'local-mvp-device';

/** Value for `line_sync_events.sync_state` when the optimistic `message.create` was delivered to the peer over P2P (no server `messages` row for this send). */
export const LINE_SYNC_SYNC_STATE_P2P_DELIVERED = 'p2p_delivered';

/** Matches `LINE_SYNC_MVP_NODE_ID` in `LineSyncService`; kept local to avoid circular imports. */
const LINE_SYNC_BLOB_NODE_ID = 'local-mvp-node';

/** Map DB `messages.msg_type` to LineSync message.create content types. */
export function mapMsgTypeToLineSyncContentType(msgType: string): MessageContentType {
  switch (msgType) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'voice':
      return 'voice';
    case 'video_note':
      return 'video_note';
    case 'video':
      return 'video';
    case 'file':
      return 'file';
    default:
      return 'system';
  }
}

/**
 * Deterministic LineSync event id from the app message row id (temp or server-assigned).
 *
 * MVP invariant for replies: `reply_to_event_id` is always `msg:` + `messages.reply_to_id`,
 * matching this scheme for every stored message.
 * Limitation: if LineSync later uses another stable id for the same logical message,
 * replies must be normalized before setting `reply_to_event_id`.
 */
export function messageIdToLineSyncEventId(messageId: string): string {
  return `msg:${messageId}`;
}

export type BuildMessageCreateOptions = {
  authorDeviceId?: string;
  blobRefs?: BlobRef[];
  /** Overrides DB-derived content type (e.g. `media_album` when `blob_refs` mix image + video). */
  contentTypeOverride?: MessageContentType;
};

export function buildMessageCreateEventFromOutgoingMessage(
  message: LineSyncMessageRowPick,
  options?: BuildMessageCreateOptions
): MessageCreateEvent {
  const event_id = messageIdToLineSyncEventId(message.id);
  const content_type =
    options?.contentTypeOverride ?? mapMsgTypeToLineSyncContentType(message.msg_type);
  const ev: MessageCreateEvent = {
    type: 'message.create',
    event_id,
    line_id: message.chat_id,
    author_user_id: message.sender_id,
    author_device_id: options?.authorDeviceId ?? LINE_SYNC_MVP_AUTHOR_DEVICE_ID,
    created_at: message.created_at,
    logical_clock: message.created_at,
    parent_event_ids: [],
    content_type,
    signature: `unsigned:${event_id}`,
  };
  if (message.content != null) {
    ev.content = message.content;
  }
  if (message.reply_to_id) {
    ev.reply_to_event_id = messageIdToLineSyncEventId(message.reply_to_id);
  }
  if (options?.blobRefs?.length) {
    ev.blob_refs = options.blobRefs;
  }
  return ev;
}

export type UploadedLineSyncBlobInput = {
  kind: 'image' | 'voice' | 'video_note' | 'video' | 'file';
  url: string;
  sha256?: string | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
};

export function buildServerBlobRefFromUploadedMedia(
  media: UploadedLineSyncBlobInput
): BlobRef | null {
  const sha256 = normalizeSha256(media.sha256);
  const url = media.url.trim();
  const sizeBytes = media.sizeBytes;
  if (!sha256 || !url || typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return null;
  }

  return {
    blob_id: `sha256:${sha256}`,
    kind: media.kind,
    size_bytes: sizeBytes,
    ...(media.mimeType ? { mime_type: media.mimeType } : {}),
    sha256,
    locations: [{ type: 'server', url }],
  };
}

export type PeerOnlyBlobInput = {
  kind: UploadedLineSyncBlobInput['kind'];
  sha256: string;
  sizeBytes: number;
  mimeType?: string | null;
  senderUserId: string;
};

/** BlobRef без server URL: только peer-локация отправителя (перед передачей файла по P2P). */
export function buildPeerOnlyBlobRefFromLocalMedia(input: PeerOnlyBlobInput): BlobRef | null {
  const sha256 = normalizeSha256(input.sha256);
  if (!sha256 || typeof input.sizeBytes !== 'number' || !Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) {
    return null;
  }

  return {
    blob_id: `sha256:${sha256}`,
    kind: input.kind,
    size_bytes: input.sizeBytes,
    ...(input.mimeType ? { mime_type: input.mimeType } : {}),
    sha256,
    locations: [
      {
        type: 'peer',
        node_id: LINE_SYNC_BLOB_NODE_ID,
        user_id: input.senderUserId,
        caps: ['blob_request'],
      },
    ],
  };
}

export function buildPendingLineSyncRowForPeerMedia(
  message: LineSyncMessageRowPick,
  blobRef: BlobRef,
): LineSyncEventRow | null {
  if (
    message.msg_type !== 'image' &&
    message.msg_type !== 'voice' &&
    message.msg_type !== 'video_note' &&
    message.msg_type !== 'video' &&
    message.msg_type !== 'file'
  ) {
    return null;
  }
  return lineSyncEventRowFromMessageCreate(
    buildMessageCreateEventFromOutgoingMessage(message, { blobRefs: [blobRef] }),
    'pending',
  );
}

export function buildPendingLineSyncRowForPeerMediaMultiple(
  message: LineSyncMessageRowPick,
  blobRefs: BlobRef[],
): LineSyncEventRow | null {
  if (blobRefs.length === 0) return null;
  if (message.msg_type !== 'image' && message.msg_type !== 'video') return null;

  const slotKinds = new Set(blobRefs.map((b) => b.kind));
  const contentTypeOverride = slotKinds.size > 1 ? ('media_album' as const) : undefined;

  return lineSyncEventRowFromMessageCreate(
    buildMessageCreateEventFromOutgoingMessage(message, {
      blobRefs,
      ...(contentTypeOverride ? { contentTypeOverride } : {}),
    }),
    'pending',
  );
}

/** Row for `line_sync_events` from a protocol-shaped create event. */
export function lineSyncEventRowFromMessageCreate(
  ev: MessageCreateEvent,
  syncState = 'pending'
): LineSyncEventRow {
  return {
    event_id: ev.event_id,
    line_id: ev.line_id,
    event_type: 'message.create',
    payload_json: JSON.stringify(ev),
    author_user_id: ev.author_user_id,
    created_at: ev.created_at,
    logical_clock: ev.logical_clock,
    signature: ev.signature,
    sync_state: syncState,
  };
}

/** Convenience: MessageRow → pending line_sync_events row. */
export function buildPendingLineSyncRowFromOutgoingMessage(
  message: LineSyncMessageRowPick,
  options?: BuildMessageCreateOptions
): LineSyncEventRow {
  return lineSyncEventRowFromMessageCreate(
    buildMessageCreateEventFromOutgoingMessage(message, options),
    'pending'
  );
}

/**
 * Text-only slice of the event log (media/deferred types — later).
 * Call sites should still apply policy (e.g. skip own server echo to avoid duplicating optimistic `msg:<tempId>`).
 */
export function buildPendingLineSyncRowForText(
  message: LineSyncMessageRowPick,
  options?: BuildMessageCreateOptions
): LineSyncEventRow | null {
  if (message.msg_type !== 'text') return null;
  return buildPendingLineSyncRowFromOutgoingMessage(message, options);
}

export function buildPendingLineSyncRowForUploadedMedia(
  message: LineSyncMessageRowPick,
  media: UploadedLineSyncBlobInput[],
  options?: Omit<BuildMessageCreateOptions, 'blobRefs'>
): LineSyncEventRow | null {
  const blobRefs = media
    .map(buildServerBlobRefFromUploadedMedia)
    .filter((ref): ref is BlobRef => ref !== null);
  if (blobRefs.length === 0) return null;

  const slotKinds = new Set(blobRefs.map((b) => b.kind));
  /** Mixed slot kinds → `media_album`; explicit `options.contentTypeOverride` wins when provided. */
  const derivedOverride = slotKinds.size > 1 ? ('media_album' as const) : undefined;
  const contentTypeOverride = options?.contentTypeOverride ?? derivedOverride;

  return buildPendingLineSyncRowFromOutgoingMessage(message, {
    ...options,
    blobRefs,
    contentTypeOverride,
  });
}

/**
 * Gate for linking optimistic `msg:<tempId>` rows to server id on own message echo:
 * must have matched optimistic bubble via server `client_temp_id`.
 */
export function shouldLinkLineSyncOptimisticEchoToServer(args: {
  msgType: string;
  matchedByClientTempId: boolean;
}): boolean {
  return (
    args.matchedByClientTempId &&
    ['text', 'image', 'voice', 'video_note', 'video', 'file'].includes(args.msgType)
  );
}
