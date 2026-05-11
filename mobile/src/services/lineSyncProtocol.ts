/**
 * LineSync — protocol types, structural validators, and ACL helpers (spec slice).
 * Shapes follow docs/p2p/08-linesync-protocol-draft.md (snake_case field names).
 */

export type NodeId = string;
export type UserId = string;
export type DeviceId = string;
export type LineId = string;
export type EventId = string;
export type Cursor = string;

export type LineType = 'private' | 'group' | 'channel';

export type LineMeta = {
  line_id: LineId;
  line_type: LineType;
  head_event_ids: EventId[];
  cursor: Cursor | null;
  updated_at: number;
  retain_last_n: number;
  ttl_seconds?: number;
};

export type LineSummary = {
  type: 'LINE_SUMMARY';
  line_id: LineId;
  node_id: NodeId;
  head_event_ids: EventId[];
  cursor: Cursor | null;
  updated_at: number;
  retain_last_n?: number;
};

export type LinePatchRequestMode = 'since_cursor' | 'last_n' | 'by_ids' | 'between_heads';

export type LinePatchRequest = {
  type: 'LINE_PATCH_REQUEST';
  line_id: LineId;
  mode: LinePatchRequestMode;
  since_cursor?: Cursor | null;
  last_n?: number;
  event_ids?: EventId[];
  known_head_event_ids?: EventId[];
  max_events: number;
};

export type LinePatch = {
  type: 'LINE_PATCH';
  line_id: LineId;
  base_cursor: Cursor | null;
  new_cursor: Cursor | null;
  events: LineSyncMessageEvent[];
  has_more?: boolean;
};

export type LinePatchAck = {
  type: 'LINE_PATCH_ACK';
  line_id: LineId;
  applied_event_ids: EventId[];
  rejected_event_ids?: Array<{
    event_id: EventId;
    reason: 'duplicate' | 'malformed' | 'forbidden' | 'unknown_parent' | 'too_large';
  }>;
  new_head_event_ids: EventId[];
  new_cursor: Cursor | null;
};

export type LineSyncPeerMessage =
  | LineSummary
  | LinePatchRequest
  | LinePatch
  | LinePatchAck;

export type MessageContentType =
  | 'text'
  | 'image'
  | 'voice'
  | 'video_note'
  | 'video'
  | 'file' // draft includes 'system' on message.create; align with product types + system
  | 'system'
  /** Several media slots in one message; per-slot kind is always `blob_refs[i].kind`. */
  | 'media_album';

export type BlobKind = 'image' | 'voice' | 'video_note' | 'video' | 'file';

export type BlobLocationPeer = {
  type: 'peer';
  node_id: NodeId;
  user_id?: UserId;
  caps?: string[];
};

export type BlobLocationServer = {
  type: 'server';
  url: string;
  expires_at?: number;
};

export type BlobLocation = BlobLocationPeer | BlobLocationServer;

export type BlobRef = {
  blob_id: string;
  kind: BlobKind;
  size_bytes: number;
  mime_type?: string;
  sha256: string;
  locations: BlobLocation[];
};

export type MessageCreateEvent = {
  type: 'message.create';
  event_id: EventId;
  line_id: LineId;
  author_user_id: UserId;
  author_device_id: DeviceId;
  created_at: number;
  logical_clock: number;
  parent_event_ids: EventId[];
  content_type: MessageContentType;
  content?: string;
  blob_refs?: BlobRef[];
  reply_to_event_id?: EventId | null;
  signature: string;
};

export type MessageEditEvent = {
  type: 'message.edit';
  event_id: EventId;
  line_id: LineId;
  target_event_id: EventId;
  editor_user_id: UserId;
  editor_device_id: DeviceId;
  edited_at: number;
  edit_revision: number;
  new_content?: string;
  new_blob_refs?: BlobRef[];
  reason?: string;
  signature: string;
};

export type MessageDeleteMode = 'for_me' | 'for_everyone';

export type MessageDeleteEvent = {
  type: 'message.delete';
  event_id: EventId;
  line_id: LineId;
  target_event_id: EventId;
  deleter_user_id: UserId;
  deleter_device_id: DeviceId;
  deleted_at: number;
  delete_mode: MessageDeleteMode;
  reason?: string;
  signature: string;
};

/** Minimal LineEvent union for this implementation slice. */
export type LineSyncMessageEvent = MessageCreateEvent | MessageEditEvent | MessageDeleteEvent;

export type BlobMirrorUp = {
  type: 'BLOB_MIRROR_UP';
  line_id: LineId;
  blob_id: string;
  sha256: string;
  node_id: NodeId;
  user_id: UserId;
  expires_at?: number;
};

export type BlobMirrorDown = {
  type: 'BLOB_MIRROR_DOWN';
  line_id: LineId;
  blob_id: string;
  node_id: NodeId;
};

export type BlobRequest = {
  type: 'BLOB_REQUEST';
  line_id: LineId;
  blob_id: string;
  requester_node_id: NodeId;
  requester_user_id: UserId;
  sha256?: string;
  preferred_chunk_size?: number;
};

export type BlobChunk = {
  type: 'BLOB_CHUNK';
  line_id: LineId;
  blob_id: string;
  sha256: string;
  node_id: NodeId;
  chunk_index: number;
  total_chunks: number;
  bytes_base64: string;
};

export type BlobAnnounce = Omit<BlobMirrorUp, 'type'> & { type: 'BLOB_ANNOUNCE' };

export type LineSyncBlobMessage =
  | BlobAnnounce
  | BlobMirrorUp
  | BlobMirrorDown
  | BlobRequest
  | BlobChunk;

export type LineSyncParseIssue = { path: string; message: string };

export type LineSyncParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: LineSyncParseIssue[] };

const CONTENT_TYPES: ReadonlySet<MessageContentType> = new Set([
  'text',
  'image',
  'voice',
  'video_note',
  'video',
  'file',
  'system',
  'media_album',
]);

const BLOB_KINDS: ReadonlySet<BlobKind> = new Set([
  'image',
  'voice',
  'video_note',
  'video',
  'file',
]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function issue(path: string, message: string): LineSyncParseIssue {
  return { path, message };
}

function requireString(obj: Record<string, unknown>, key: string, path: string): string | null {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    return null;
  }
  return v;
}

function requireNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return null;
  }
  return v;
}

function parseEventIds(value: unknown, path: string): LineSyncParseResult<EventId[]> {
  if (!Array.isArray(value)) {
    return { ok: false, issues: [issue(path, 'expected array of event ids')] };
  }
  const ids: EventId[] = [];
  for (let i = 0; i < value.length; i++) {
    const e = value[i];
    if (typeof e !== 'string' || e.length === 0) {
      return { ok: false, issues: [issue(`${path}[${i}]`, 'expected non-empty string')] };
    }
    ids.push(e);
  }
  return { ok: true, value: ids };
}

function parseBlobLocation(raw: unknown, path: string): LineSyncParseResult<BlobLocation> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue(path, 'expected object')] };
  }
  const t = raw.type;
  if (t === 'peer') {
    const node_id = requireString(raw, 'node_id', path);
    if (!node_id) {
      return { ok: false, issues: [issue(`${path}.node_id`, 'expected non-empty string')] };
    }
    const loc: BlobLocationPeer = { type: 'peer', node_id };
    if (raw.user_id !== undefined) {
      if (typeof raw.user_id !== 'string' || raw.user_id.length === 0) {
        return { ok: false, issues: [issue(`${path}.user_id`, 'expected non-empty string')] };
      }
      loc.user_id = raw.user_id;
    }
    if (raw.caps !== undefined) {
      if (!Array.isArray(raw.caps) || !raw.caps.every((c) => typeof c === 'string')) {
        return { ok: false, issues: [issue(`${path}.caps`, 'expected string[]')] };
      }
      loc.caps = raw.caps as string[];
    }
    return { ok: true, value: loc };
  }
  if (t === 'server') {
    const url = requireString(raw, 'url', path);
    if (!url) {
      return { ok: false, issues: [issue(`${path}.url`, 'expected non-empty string')] };
    }
    const loc: BlobLocationServer = { type: 'server', url };
    if (raw.expires_at !== undefined) {
      const exp = requireNumber(raw, 'expires_at');
      if (exp === null) {
        return { ok: false, issues: [issue(`${path}.expires_at`, 'expected finite number')] };
      }
      loc.expires_at = exp;
    }
    return { ok: true, value: loc };
  }
  return { ok: false, issues: [issue(`${path}.type`, "expected 'peer' | 'server'")] };
}

export function parseBlobRef(raw: unknown, path: string): LineSyncParseResult<BlobRef> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue(path, 'expected object')] };
  }
  const blob_id = requireString(raw, 'blob_id', path);
  if (!blob_id) {
    return { ok: false, issues: [issue(`${path}.blob_id`, 'expected non-empty string')] };
  }
  const kind = raw.kind;
  if (typeof kind !== 'string' || !BLOB_KINDS.has(kind as BlobKind)) {
    return { ok: false, issues: [issue(`${path}.kind`, 'invalid blob kind')] };
  }
  const size = requireNumber(raw, 'size_bytes');
  if (size === null || size < 0) {
    return { ok: false, issues: [issue(`${path}.size_bytes`, 'expected non-negative finite number')] };
  }
  const sha256 = requireString(raw, 'sha256', path);
  if (!sha256) {
    return { ok: false, issues: [issue(`${path}.sha256`, 'expected non-empty string')] };
  }
  if (!Array.isArray(raw.locations)) {
    return { ok: false, issues: [issue(`${path}.locations`, 'expected array')] };
  }
  const locations: BlobLocation[] = [];
  for (let i = 0; i < raw.locations.length; i++) {
    const locRes = parseBlobLocation(raw.locations[i], `${path}.locations[${i}]`);
    if (locRes.ok === false) {
      return { ok: false, issues: locRes.issues };
    }
    locations.push(locRes.value);
  }
  const ref: BlobRef = {
    blob_id,
    kind: kind as BlobKind,
    size_bytes: size,
    sha256,
    locations,
  };
  if (raw.mime_type !== undefined) {
    if (typeof raw.mime_type !== 'string') {
      return { ok: false, issues: [issue(`${path}.mime_type`, 'expected string')] };
    }
    ref.mime_type = raw.mime_type;
  }
  return { ok: true, value: ref };
}

export function parseMessageCreateEvent(raw: unknown): LineSyncParseResult<MessageCreateEvent> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'message.create') {
    return { ok: false, issues: [issue('type', "expected 'message.create'")] };
  }
  const event_id = requireString(raw, 'event_id', '$');
  const line_id = requireString(raw, 'line_id', '$');
  const author_user_id = requireString(raw, 'author_user_id', '$');
  const author_device_id = requireString(raw, 'author_device_id', '$');
  const signature = requireString(raw, 'signature', '$');
  if (!event_id || !line_id || !author_user_id || !author_device_id || !signature) {
    return {
      ok: false,
      issues: [issue('$', 'missing required string field(s) on message.create')],
    };
  }
  const created_at = requireNumber(raw, 'created_at');
  const logical_clock = requireNumber(raw, 'logical_clock');
  if (created_at === null || logical_clock === null) {
    return { ok: false, issues: [issue('$', 'created_at and logical_clock must be finite numbers')] };
  }
  const parents = parseEventIds(raw.parent_event_ids, 'parent_event_ids');
  if (parents.ok === false) {
    return { ok: false, issues: parents.issues };
  }
  const ct = raw.content_type;
  if (typeof ct !== 'string' || !CONTENT_TYPES.has(ct as MessageContentType)) {
    return { ok: false, issues: [issue('content_type', 'invalid content_type')] };
  }
  const ev: MessageCreateEvent = {
    type: 'message.create',
    event_id,
    line_id,
    author_user_id,
    author_device_id,
    created_at,
    logical_clock,
    parent_event_ids: parents.value,
    content_type: ct as MessageContentType,
    signature,
  };
  if (raw.content !== undefined) {
    if (typeof raw.content !== 'string') {
      return { ok: false, issues: [issue('content', 'expected string')] };
    }
    ev.content = raw.content;
  }
  if (raw.blob_refs !== undefined) {
    if (!Array.isArray(raw.blob_refs)) {
      return { ok: false, issues: [issue('blob_refs', 'expected array')] };
    }
    const refs: BlobRef[] = [];
    for (let i = 0; i < raw.blob_refs.length; i++) {
      const r = parseBlobRef(raw.blob_refs[i], `blob_refs[${i}]`);
      if (r.ok === false) {
        return { ok: false, issues: r.issues };
      }
      refs.push(r.value);
    }
    ev.blob_refs = refs;
  }
  if (raw.reply_to_event_id !== undefined && raw.reply_to_event_id !== null) {
    if (typeof raw.reply_to_event_id !== 'string' || raw.reply_to_event_id.length === 0) {
      return { ok: false, issues: [issue('reply_to_event_id', 'expected non-empty string or null')] };
    }
    ev.reply_to_event_id = raw.reply_to_event_id;
  }

  if (ev.content_type === 'media_album') {
    const refs = ev.blob_refs;
    if (!refs || refs.length < 2) {
      return {
        ok: false,
        issues: [
          issue(
            'blob_refs',
            'media_album requires at least two blob_refs; slot types are blob_refs[i].kind',
          ),
        ],
      };
    }
  }

  return { ok: true, value: ev };
}

export function parseMessageEditEvent(raw: unknown): LineSyncParseResult<MessageEditEvent> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'message.edit') {
    return { ok: false, issues: [issue('type', "expected 'message.edit'")] };
  }
  const event_id = requireString(raw, 'event_id', '$');
  const line_id = requireString(raw, 'line_id', '$');
  const target_event_id = requireString(raw, 'target_event_id', '$');
  const editor_user_id = requireString(raw, 'editor_user_id', '$');
  const editor_device_id = requireString(raw, 'editor_device_id', '$');
  const signature = requireString(raw, 'signature', '$');
  if (!event_id || !line_id || !target_event_id || !editor_user_id || !editor_device_id || !signature) {
    return { ok: false, issues: [issue('$', 'missing required string field(s) on message.edit')] };
  }
  const edited_at = requireNumber(raw, 'edited_at');
  const edit_revision = requireNumber(raw, 'edit_revision');
  if (edited_at === null || edit_revision === null || edit_revision < 0) {
    return {
      ok: false,
      issues: [issue('$', 'edited_at must be number; edit_revision non-negative number')],
    };
  }
  const ev: MessageEditEvent = {
    type: 'message.edit',
    event_id,
    line_id,
    target_event_id,
    editor_user_id,
    editor_device_id,
    edited_at,
    edit_revision,
    signature,
  };
  if (raw.new_content !== undefined) {
    if (typeof raw.new_content !== 'string') {
      return { ok: false, issues: [issue('new_content', 'expected string')] };
    }
    ev.new_content = raw.new_content;
  }
  if (raw.new_blob_refs !== undefined) {
    if (!Array.isArray(raw.new_blob_refs)) {
      return { ok: false, issues: [issue('new_blob_refs', 'expected array')] };
    }
    const refs: BlobRef[] = [];
    for (let i = 0; i < raw.new_blob_refs.length; i++) {
      const r = parseBlobRef(raw.new_blob_refs[i], `new_blob_refs[${i}]`);
      if (r.ok === false) {
        return { ok: false, issues: r.issues };
      }
      refs.push(r.value);
    }
    ev.new_blob_refs = refs;
  }
  if (raw.reason !== undefined) {
    if (typeof raw.reason !== 'string') {
      return { ok: false, issues: [issue('reason', 'expected string')] };
    }
    ev.reason = raw.reason;
  }
  return { ok: true, value: ev };
}

export function parseMessageDeleteEvent(raw: unknown): LineSyncParseResult<MessageDeleteEvent> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'message.delete') {
    return { ok: false, issues: [issue('type', "expected 'message.delete'")] };
  }
  const event_id = requireString(raw, 'event_id', '$');
  const line_id = requireString(raw, 'line_id', '$');
  const target_event_id = requireString(raw, 'target_event_id', '$');
  const deleter_user_id = requireString(raw, 'deleter_user_id', '$');
  const deleter_device_id = requireString(raw, 'deleter_device_id', '$');
  const signature = requireString(raw, 'signature', '$');
  if (!event_id || !line_id || !target_event_id || !deleter_user_id || !deleter_device_id || !signature) {
    return { ok: false, issues: [issue('$', 'missing required string field(s) on message.delete')] };
  }
  const deleted_at = requireNumber(raw, 'deleted_at');
  if (deleted_at === null) {
    return { ok: false, issues: [issue('deleted_at', 'expected finite number')] };
  }
  const mode = raw.delete_mode;
  if (mode !== 'for_me' && mode !== 'for_everyone') {
    return { ok: false, issues: [issue('delete_mode', "expected 'for_me' | 'for_everyone'")] };
  }
  const ev: MessageDeleteEvent = {
    type: 'message.delete',
    event_id,
    line_id,
    target_event_id,
    deleter_user_id,
    deleter_device_id,
    deleted_at,
    delete_mode: mode,
    signature,
  };
  if (raw.reason !== undefined) {
    if (typeof raw.reason !== 'string') {
      return { ok: false, issues: [issue('reason', 'expected string')] };
    }
    ev.reason = raw.reason;
  }
  return { ok: true, value: ev };
}

export function parseBlobMirrorUp(raw: unknown): LineSyncParseResult<BlobMirrorUp> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'BLOB_MIRROR_UP') {
    return { ok: false, issues: [issue('type', "expected 'BLOB_MIRROR_UP'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  const blob_id = requireString(raw, 'blob_id', '$');
  const sha256 = requireString(raw, 'sha256', '$');
  const node_id = requireString(raw, 'node_id', '$');
  const user_id = requireString(raw, 'user_id', '$');
  if (!line_id || !blob_id || !sha256 || !node_id || !user_id) {
    return { ok: false, issues: [issue('$', 'missing required fields on BLOB_MIRROR_UP')] };
  }
  const msg: BlobMirrorUp = { type: 'BLOB_MIRROR_UP', line_id, blob_id, sha256, node_id, user_id };
  if (raw.expires_at !== undefined) {
    const exp = requireNumber(raw, 'expires_at');
    if (exp === null) {
      return { ok: false, issues: [issue('expires_at', 'expected finite number')] };
    }
    msg.expires_at = exp;
  }
  return { ok: true, value: msg };
}

export function parseBlobAnnounce(raw: unknown): LineSyncParseResult<BlobAnnounce> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'BLOB_ANNOUNCE') {
    return { ok: false, issues: [issue('type', "expected 'BLOB_ANNOUNCE'")] };
  }
  const mirror = parseBlobMirrorUp({ ...raw, type: 'BLOB_MIRROR_UP' });
  if (mirror.ok === false) {
    return { ok: false, issues: mirror.issues };
  }
  return { ok: true, value: { ...mirror.value, type: 'BLOB_ANNOUNCE' } };
}

export function parseBlobMirrorDown(raw: unknown): LineSyncParseResult<BlobMirrorDown> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'BLOB_MIRROR_DOWN') {
    return { ok: false, issues: [issue('type', "expected 'BLOB_MIRROR_DOWN'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  const blob_id = requireString(raw, 'blob_id', '$');
  const node_id = requireString(raw, 'node_id', '$');
  if (!line_id || !blob_id || !node_id) {
    return { ok: false, issues: [issue('$', 'missing required fields on BLOB_MIRROR_DOWN')] };
  }
  return { ok: true, value: { type: 'BLOB_MIRROR_DOWN', line_id, blob_id, node_id } };
}

export function parseBlobRequest(raw: unknown): LineSyncParseResult<BlobRequest> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'BLOB_REQUEST') {
    return { ok: false, issues: [issue('type', "expected 'BLOB_REQUEST'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  const blob_id = requireString(raw, 'blob_id', '$');
  const requester_node_id = requireString(raw, 'requester_node_id', '$');
  const requester_user_id = requireString(raw, 'requester_user_id', '$');
  if (!line_id || !blob_id || !requester_node_id || !requester_user_id) {
    return { ok: false, issues: [issue('$', 'missing required fields on BLOB_REQUEST')] };
  }
  const msg: BlobRequest = {
    type: 'BLOB_REQUEST',
    line_id,
    blob_id,
    requester_node_id,
    requester_user_id,
  };
  if (raw.sha256 !== undefined) {
    if (typeof raw.sha256 !== 'string' || raw.sha256.length === 0) {
      return { ok: false, issues: [issue('sha256', 'expected non-empty string')] };
    }
    msg.sha256 = raw.sha256;
  }
  if (raw.preferred_chunk_size !== undefined) {
    const size = requireNumber(raw, 'preferred_chunk_size');
    if (size === null || size < 1) {
      return { ok: false, issues: [issue('preferred_chunk_size', 'expected positive number')] };
    }
    msg.preferred_chunk_size = Math.floor(size);
  }
  return { ok: true, value: msg };
}

export function parseBlobChunk(raw: unknown): LineSyncParseResult<BlobChunk> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'BLOB_CHUNK') {
    return { ok: false, issues: [issue('type', "expected 'BLOB_CHUNK'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  const blob_id = requireString(raw, 'blob_id', '$');
  const sha256 = requireString(raw, 'sha256', '$');
  const node_id = requireString(raw, 'node_id', '$');
  const bytes_base64 = requireString(raw, 'bytes_base64', '$');
  const chunk_index = requireNumber(raw, 'chunk_index');
  const total_chunks = requireNumber(raw, 'total_chunks');
  if (!line_id || !blob_id || !sha256 || !node_id || !bytes_base64) {
    return { ok: false, issues: [issue('$', 'missing required string fields on BLOB_CHUNK')] };
  }
  if (chunk_index === null || total_chunks === null || chunk_index < 0 || total_chunks < 1) {
    return { ok: false, issues: [issue('$', 'invalid chunk indexes')] };
  }
  return {
    ok: true,
    value: {
      type: 'BLOB_CHUNK',
      line_id,
      blob_id,
      sha256,
      node_id,
      chunk_index: Math.floor(chunk_index),
      total_chunks: Math.floor(total_chunks),
      bytes_base64,
    },
  };
}

export function parseLineSyncBlobMessage(raw: unknown): LineSyncParseResult<LineSyncBlobMessage> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  switch (raw.type) {
    case 'BLOB_ANNOUNCE':
      return parseBlobAnnounce(raw);
    case 'BLOB_MIRROR_UP':
      return parseBlobMirrorUp(raw);
    case 'BLOB_MIRROR_DOWN':
      return parseBlobMirrorDown(raw);
    case 'BLOB_REQUEST':
      return parseBlobRequest(raw);
    case 'BLOB_CHUNK':
      return parseBlobChunk(raw);
    default:
      return { ok: false, issues: [issue('type', 'unknown LineSync blob message type')] };
  }
}

export function parseLineSyncMessageEvent(raw: unknown): LineSyncParseResult<LineSyncMessageEvent> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  const t = raw.type;
  if (t === 'message.create') {
    return parseMessageCreateEvent(raw);
  }
  if (t === 'message.edit') {
    return parseMessageEditEvent(raw);
  }
  if (t === 'message.delete') {
    return parseMessageDeleteEvent(raw);
  }
  return { ok: false, issues: [issue('type', 'unknown message event type')] };
}

export function parseLineSummary(raw: unknown): LineSyncParseResult<LineSummary> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'LINE_SUMMARY') {
    return { ok: false, issues: [issue('type', "expected 'LINE_SUMMARY'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  const node_id = requireString(raw, 'node_id', '$');
  if (!line_id || !node_id) {
    return { ok: false, issues: [issue('$', 'missing required string field(s) on LINE_SUMMARY')] };
  }
  const heads = parseEventIds(raw.head_event_ids, 'head_event_ids');
  if (heads.ok === false) {
    return { ok: false, issues: heads.issues };
  }
  const updated_at = requireNumber(raw, 'updated_at');
  if (updated_at === null) {
    return { ok: false, issues: [issue('updated_at', 'expected finite number')] };
  }
  if (raw.cursor !== undefined && raw.cursor !== null && typeof raw.cursor !== 'string') {
    return { ok: false, issues: [issue('cursor', 'expected string or null')] };
  }
  const cursor: string | null = typeof raw.cursor === 'string' ? raw.cursor : null;
  const summary: LineSummary = {
    type: 'LINE_SUMMARY',
    line_id,
    node_id,
    head_event_ids: heads.value,
    cursor,
    updated_at,
  };
  if (raw.retain_last_n !== undefined) {
    const retain = requireNumber(raw, 'retain_last_n');
    if (retain === null || retain < 1) {
      return { ok: false, issues: [issue('retain_last_n', 'expected positive number')] };
    }
    summary.retain_last_n = Math.floor(retain);
  }
  return { ok: true, value: summary };
}

export function parseLinePatchRequest(raw: unknown): LineSyncParseResult<LinePatchRequest> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'LINE_PATCH_REQUEST') {
    return { ok: false, issues: [issue('type', "expected 'LINE_PATCH_REQUEST'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  if (!line_id) {
    return { ok: false, issues: [issue('line_id', 'expected non-empty string')] };
  }
  const mode = raw.mode;
  if (
    mode !== 'since_cursor' &&
    mode !== 'last_n' &&
    mode !== 'by_ids' &&
    mode !== 'between_heads'
  ) {
    return { ok: false, issues: [issue('mode', 'invalid patch request mode')] };
  }
  const max_events = requireNumber(raw, 'max_events');
  if (max_events === null || max_events < 1) {
    return { ok: false, issues: [issue('max_events', 'expected positive number')] };
  }
  const req: LinePatchRequest = {
    type: 'LINE_PATCH_REQUEST',
    line_id,
    mode,
    max_events: Math.floor(max_events),
  };
  const sinceCursor = raw.since_cursor as string | null | undefined;
  if (sinceCursor !== undefined) {
    if (sinceCursor !== null && typeof sinceCursor !== 'string') {
      return { ok: false, issues: [issue('since_cursor', 'expected string or null')] };
    }
    req.since_cursor = sinceCursor;
  }
  if (raw.last_n !== undefined) {
    const lastN = requireNumber(raw, 'last_n');
    if (lastN === null || lastN < 1) {
      return { ok: false, issues: [issue('last_n', 'expected positive number')] };
    }
    req.last_n = Math.floor(lastN);
  }
  if (raw.event_ids !== undefined) {
    const eventIds = parseEventIds(raw.event_ids, 'event_ids');
    if (eventIds.ok === false) {
      return { ok: false, issues: eventIds.issues };
    }
    req.event_ids = eventIds.value;
  }
  if (raw.known_head_event_ids !== undefined) {
    const heads = parseEventIds(raw.known_head_event_ids, 'known_head_event_ids');
    if (heads.ok === false) {
      return { ok: false, issues: heads.issues };
    }
    req.known_head_event_ids = heads.value;
  }
  return { ok: true, value: req };
}

export function parseLinePatch(raw: unknown): LineSyncParseResult<LinePatch> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'LINE_PATCH') {
    return { ok: false, issues: [issue('type', "expected 'LINE_PATCH'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  if (!line_id) {
    return { ok: false, issues: [issue('line_id', 'expected non-empty string')] };
  }
  const baseCursor = raw.base_cursor as string | null | undefined;
  const newCursor = raw.new_cursor as string | null | undefined;
  if (baseCursor !== null && baseCursor !== undefined && typeof baseCursor !== 'string') {
    return { ok: false, issues: [issue('base_cursor', 'expected string or null')] };
  }
  if (newCursor !== null && newCursor !== undefined && typeof newCursor !== 'string') {
    return { ok: false, issues: [issue('new_cursor', 'expected string or null')] };
  }
  if (!Array.isArray(raw.events)) {
    return { ok: false, issues: [issue('events', 'expected array')] };
  }
  const events: LineSyncMessageEvent[] = [];
  for (let i = 0; i < raw.events.length; i++) {
    const parsed = parseLineSyncMessageEvent(raw.events[i]);
    if (parsed.ok === false) {
      return { ok: false, issues: [issue(`events[${i}]`, parsed.issues[0]?.message ?? 'invalid event')] };
    }
    if (parsed.value.line_id !== line_id) {
      return { ok: false, issues: [issue(`events[${i}].line_id`, 'event line_id mismatch')] };
    }
    events.push(parsed.value);
  }
  const patch: LinePatch = {
    type: 'LINE_PATCH',
    line_id,
    base_cursor: baseCursor == null ? null : baseCursor,
    new_cursor: newCursor == null ? null : newCursor,
    events,
  };
  if (raw.has_more !== undefined) {
    if (typeof raw.has_more !== 'boolean') {
      return { ok: false, issues: [issue('has_more', 'expected boolean')] };
    }
    patch.has_more = raw.has_more;
  }
  return { ok: true, value: patch };
}

export function parseLinePatchAck(raw: unknown): LineSyncParseResult<LinePatchAck> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  if (raw.type !== 'LINE_PATCH_ACK') {
    return { ok: false, issues: [issue('type', "expected 'LINE_PATCH_ACK'")] };
  }
  const line_id = requireString(raw, 'line_id', '$');
  if (!line_id) {
    return { ok: false, issues: [issue('line_id', 'expected non-empty string')] };
  }
  const applied = parseEventIds(raw.applied_event_ids, 'applied_event_ids');
  if (applied.ok === false) {
    return { ok: false, issues: applied.issues };
  }
  const heads = parseEventIds(raw.new_head_event_ids, 'new_head_event_ids');
  if (heads.ok === false) {
    return { ok: false, issues: heads.issues };
  }
  const ackNewCursor = raw.new_cursor as string | null | undefined;
  if (ackNewCursor !== null && ackNewCursor !== undefined && typeof ackNewCursor !== 'string') {
    return { ok: false, issues: [issue('new_cursor', 'expected string or null')] };
  }
  return {
    ok: true,
    value: {
      type: 'LINE_PATCH_ACK',
      line_id,
      applied_event_ids: applied.value,
      new_head_event_ids: heads.value,
      new_cursor: ackNewCursor == null ? null : ackNewCursor,
    },
  };
}

export function parseLineSyncPeerMessage(raw: unknown): LineSyncParseResult<LineSyncPeerMessage> {
  if (!isRecord(raw)) {
    return { ok: false, issues: [issue('$', 'expected object')] };
  }
  switch (raw.type) {
    case 'LINE_SUMMARY':
      return parseLineSummary(raw);
    case 'LINE_PATCH_REQUEST':
      return parseLinePatchRequest(raw);
    case 'LINE_PATCH':
      return parseLinePatch(raw);
    case 'LINE_PATCH_ACK':
      return parseLinePatchAck(raw);
    default:
      return { ok: false, issues: [issue('type', 'unknown LineSync peer message type')] };
  }
}

/** Channel roles used for ACL (subset of membership). */
export type ChannelActorRole = 'owner' | 'admin' | 'subscriber';

/** Group roles for moderation permissions (defaults to member when omitted). */
export type GroupActorRole = 'member' | 'admin' | 'owner';

export type LineSyncAclPermissions = {
  /** Admin (or owner) may post in a channel. Owner implied true when role is owner. */
  can_post?: boolean;
  /** May edit messages authored by other users (moderation). */
  can_edit_others?: boolean;
  /** May delete messages authored by other users. */
  can_delete_others?: boolean;
};

export type LineSyncAclContext = {
  line_type: LineType;
  actor_user_id: UserId;
  /**
   * Private line: unordered set of the two participant user ids.
   * ACL requires exactly two distinct ids for create.
   */
  private_participant_ids?: UserId[];
  /** Group: actor is a normal participant (can post). */
  is_group_participant?: boolean;
  /** Group: used with `permissions` for edit/delete of others' messages. */
  group_role?: GroupActorRole;
  /** Channel: owner / admin / subscriber. */
  channel_role?: ChannelActorRole;
  permissions?: LineSyncAclPermissions;
  /** Message author user id for the message being edited/deleted. */
  target_author_user_id?: UserId;
};

function isPrivateTwoParty(participants: UserId[] | undefined): boolean {
  if (!participants || participants.length !== 2) {
    return false;
  }
  const [a, b] = participants;
  return a.length > 0 && b.length > 0 && a !== b;
}

function actorInPrivateChat(ctx: LineSyncAclContext): boolean {
  const p = ctx.private_participant_ids;
  if (!isPrivateTwoParty(p)) {
    return false;
  }
  return p![0] === ctx.actor_user_id || p![1] === ctx.actor_user_id;
}

function actorMayParticipateInLine(ctx: LineSyncAclContext): boolean {
  switch (ctx.line_type) {
    case 'private':
      return actorInPrivateChat(ctx);
    case 'group':
      return ctx.is_group_participant === true;
    case 'channel':
      return ctx.channel_role === 'owner' || ctx.channel_role === 'admin';
    default:
      return false;
  }
}

/** Whether actor may append a `message.create` to the line (not blob mirror). */
export function canCreateLineMessage(ctx: LineSyncAclContext): boolean {
  switch (ctx.line_type) {
    case 'private':
      return actorInPrivateChat(ctx);
    case 'group':
      return ctx.is_group_participant === true;
    case 'channel': {
      const role = ctx.channel_role;
      if (role === 'owner') {
        return true;
      }
      if (role === 'admin') {
        return ctx.permissions?.can_post === true;
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Whether actor may append `message.edit` for the given target message author.
 * Does not validate signature or event graph.
 */
export function canEditLineMessage(ctx: LineSyncAclContext): boolean {
  const author = ctx.target_author_user_id;
  if (!author) {
    return false;
  }
  if (ctx.actor_user_id === author) {
    return actorMayParticipateInLine(ctx);
  }
  switch (ctx.line_type) {
    case 'private':
      return false;
    case 'group': {
      if (ctx.is_group_participant !== true) {
        return false;
      }
      const gr = ctx.group_role ?? 'member';
      if (gr === 'owner') {
        return true;
      }
      if (gr === 'admin') {
        return ctx.permissions?.can_edit_others === true;
      }
      return false;
    }
    case 'channel': {
      const role = ctx.channel_role;
      if (role === 'owner') {
        return true;
      }
      if (role === 'admin') {
        return ctx.permissions?.can_edit_others === true;
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Whether `message.delete` with `for_everyone` is allowed for the target author.
 * `for_me` is local-only and not gated here.
 */
export function canDeleteForEveryone(ctx: LineSyncAclContext): boolean {
  const author = ctx.target_author_user_id;
  if (!author) {
    return false;
  }
  if (ctx.actor_user_id === author) {
    return actorMayParticipateInLine(ctx);
  }
  switch (ctx.line_type) {
    case 'private':
      return false;
    case 'group': {
      if (ctx.is_group_participant !== true) {
        return false;
      }
      const gr = ctx.group_role ?? 'member';
      if (gr === 'owner') {
        return true;
      }
      if (gr === 'admin') {
        return ctx.permissions?.can_delete_others === true;
      }
      return false;
    }
    case 'channel': {
      const role = ctx.channel_role;
      if (role === 'owner') {
        return true;
      }
      if (role === 'admin') {
        return ctx.permissions?.can_delete_others === true;
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * After verifying blob bytes against BlobRef.sha256, whether the actor may send BLOB_MIRROR_UP.
 * Subscribers in a channel may mirror; they must not use this to justify new posts.
 */
export function canAnnounceBlobMirror(ctx: LineSyncAclContext): boolean {
  switch (ctx.line_type) {
    case 'private':
      return actorInPrivateChat(ctx);
    case 'group':
      return ctx.is_group_participant === true;
    case 'channel': {
      const role = ctx.channel_role;
      return role === 'owner' || role === 'admin' || role === 'subscriber';
    }
    default:
      return false;
  }
}

/** Whether the actor may request blob bytes for this line (membership aligned with mirror announce). */
export function canRequestLineBlob(ctx: LineSyncAclContext): boolean {
  return canAnnounceBlobMirror(ctx);
}
