/**
 * Client-side LineSync orchestration slice.
 *
 * Stage 4: fetch server cache-node tail and merge it into the local durable event log.
 */

import { LineSyncEventDao } from '../db';
import type { LineSyncEventRow } from '../db/types';
import { apiGet } from './apiClient';
import {
  parseLinePatch,
  parseLinePatchAck,
  parseLinePatchRequest,
  parseLineSummary,
  parseLineSyncPeerMessage,
  parseMessageCreateEvent,
  type BlobRef,
  type BlobLocationPeer,
  type LinePatch,
  type LinePatchAck,
  type LinePatchRequest,
  type LineSummary,
  type LineSyncMessageEvent,
} from './lineSyncProtocol';
import { WebSocketService } from './WebSocketService';
import { SignalingService } from './SignalingService';
import { parseLineTailWebSocketPayload } from './lineSyncWebSocketPayload';

export const LINE_SYNC_MVP_NODE_ID = 'local-mvp-node';

export type PeerPatchDeliveryResult =
  | { ok: true }
  | { ok: false; reason: 'timeout' | 'not_connected' | 'rejected' | 'partial' };

/** Server LineSync cache tail: smaller window for 1:1 than groups (see relay / LINE_SYNC_TAIL_COUNT on server). */
export const LINE_SYNC_PRIVATE_TAIL_LIMIT = 5;

/** Group / multi-participant line: pull a wider tail than private (matches product «окно N» target; C2). */
export const LINE_SYNC_GROUP_TAIL_LIMIT = 15;


export type LineSyncCacheEventDto = {
  event_id: string;
  line_id: string;
  event_type: string;
  payload_json: unknown;
  created_at: string;
  expires_at: string | null;
};

export type LineSyncTailResponse = {
  line_id: string;
  events: LineSyncCacheEventDto[];
};

export type FetchServerTailResult = {
  fetched: number;
  inserted: number;
  ignored: number;
  rejected: number;
};

export type { ParseLineTailWebSocketResult } from './lineSyncWebSocketPayload';
export { parseLineTailWebSocketPayload } from './lineSyncWebSocketPayload';

function parseIsoMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function rowFromServerEvent(event: LineSyncCacheEventDto): LineSyncEventRow | null {
  if (event.event_type !== 'message.create') {
    return null;
  }

  const parsed = parseMessageCreateEvent(event.payload_json);
  if (!parsed.ok) {
    return null;
  }

  const payload = parsed.value;
  const createdAt = typeof payload.created_at === 'number'
    ? payload.created_at
    : parseIsoMs(event.created_at);
  if (createdAt == null) {
    return null;
  }

  return {
    event_id: payload.event_id,
    line_id: payload.line_id,
    event_type: payload.type,
    payload_json: JSON.stringify(payload),
    author_user_id:
      'author_user_id' in payload && typeof payload.author_user_id === 'string'
        ? payload.author_user_id
        : null,
    created_at: createdAt,
    logical_clock: payload.logical_clock,
    signature: payload.signature,
    sync_state: 'server_tail',
    server_message_id: payload.event_id.startsWith('msg:')
      ? payload.event_id.slice('msg:'.length)
      : null,
  };
}

function rowFromMessageEvent(event: LineSyncMessageEvent, syncState: string): LineSyncEventRow | null {
  if (event.type !== 'message.create') {
    return null;
  }
  return {
    event_id: event.event_id,
    line_id: event.line_id,
    event_type: event.type,
    payload_json: JSON.stringify(event),
    author_user_id: event.author_user_id,
    created_at: event.created_at,
    logical_clock: event.logical_clock,
    signature: event.signature,
    sync_state: syncState,
    server_message_id: event.event_id.startsWith('msg:')
      ? event.event_id.slice('msg:'.length)
      : null,
  };
}

function rowToMessageEvent(row: LineSyncEventRow): LineSyncMessageEvent | null {
  try {
    const parsed = parseMessageCreateEvent(JSON.parse(row.payload_json) as unknown);
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

function cursorFromRow(row: LineSyncEventRow | null | undefined): string | null {
  return row ? String(row.created_at) : null;
}

class LineSyncServiceClass {
  private readonly dao = new LineSyncEventDao();
  private readonly pendingPatchAckByEventId = new Map<
    string,
    {
      lineId: string;
      peerUserId: string;
      resolve: (result: PeerPatchDeliveryResult) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor() {
    SignalingService.addLineSyncRawListener((raw) => {
      void this.handleRawPeerMessage(raw);
    });
    SignalingService.addSocketCloseListener(() => {
      this.rejectAllPendingPatchAcks('not_connected');
    });
  }

  async fetchServerTail(lineId: string, limit = 10): Promise<FetchServerTailResult> {
    const trimmedLineId = lineId.trim();
    if (!trimmedLineId) {
      return { fetched: 0, inserted: 0, ignored: 0, rejected: 0 };
    }

    const res = await apiGet(
      `/lines/${encodeURIComponent(trimmedLineId)}/events/tail?limit=${encodeURIComponent(String(limit))}`
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `LineSync tail fetch failed: ${res.status}`);
    }

    const body = (await res.json()) as LineSyncTailResponse;
    const events = Array.isArray(body.events) ? body.events : [];
    return this.mergeCacheTailEvents(trimmedLineId, events);
  }

  /**
   * Applies `line_tail` frames from the chat WebSocket (same cache shape as HTTP tail).
   * No-op if payload is malformed, non-empty `error` is set, or `line_id` is missing after trim.
   */
  async mergeLineTailWebSocketMessage(msg: unknown): Promise<FetchServerTailResult | null> {
    const parsed = parseLineTailWebSocketPayload(msg);
    if (parsed.ok === true) {
      return this.mergeCacheTailEvents(parsed.lineId, parsed.events);
    }
    if (parsed.reason === 'server_error') {
      const detail = parsed.serverErrorMessage?.trim();
      console.warn('[LineSync] line_tail:', detail && detail.length > 0 ? detail : 'server_error');
    }
    return null;
  }

  private async mergeCacheTailEvents(
    trimmedLineId: string,
    events: unknown[]
  ): Promise<FetchServerTailResult> {
    let inserted = 0;
    let ignored = 0;
    let rejected = 0;

    for (const raw of events) {
      const event = raw as LineSyncCacheEventDto;
      const row = rowFromServerEvent(event);
      if (!row || row.line_id !== trimmedLineId) {
        rejected += 1;
        continue;
      }
      const didInsert = await this.dao.insert(row);
      if (didInsert) {
        inserted += 1;
      } else {
        ignored += 1;
      }
    }

    return {
      fetched: events.length,
      inserted,
      ignored,
      rejected,
    };
  }

  requestServerTailOverWebSocket(lineId: string, limit = 10): string | null {
    const trimmedLineId = lineId.trim();
    if (!trimmedLineId || !WebSocketService.isConnected()) {
      return null;
    }
    const requestId = `line-tail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    WebSocketService.sendEvent('line_tail_request', {
      request_id: requestId,
      line_id: trimmedLineId,
      limit,
    });
    return requestId;
  }

  async buildSummary(lineId: string, retainLastN = 10): Promise<LineSummary> {
    const heads = await this.dao.getHeadsByLineId(lineId);
    const head = heads[0] ?? null;
    return {
      type: 'LINE_SUMMARY',
      line_id: lineId,
      node_id: LINE_SYNC_MVP_NODE_ID,
      head_event_ids: heads.map((row) => row.event_id),
      cursor: cursorFromRow(head),
      updated_at: Date.now(),
      retain_last_n: retainLastN,
    };
  }

  async buildPatch(request: LinePatchRequest): Promise<LinePatch> {
    const maxEvents = Math.max(1, Math.min(request.max_events, 100));
    let rows: LineSyncEventRow[];

    if (request.mode === 'by_ids' && request.event_ids?.length) {
      const found: LineSyncEventRow[] = [];
      for (const id of request.event_ids.slice(0, maxEvents)) {
        const row = await this.dao.getByEventId(id);
        if (row && row.line_id === request.line_id) {
          found.push(row);
        }
      }
      rows = found;
    } else if (request.mode === 'since_cursor' && request.since_cursor) {
      const since = Number(request.since_cursor);
      rows = Number.isFinite(since)
        ? await this.dao.getSinceCreatedAt(request.line_id, since)
        : await this.dao.getByLineId(request.line_id);
    } else {
      const all = await this.dao.getByLineId(request.line_id);
      rows = all.slice(-Math.min(request.last_n ?? maxEvents, maxEvents));
    }

    const selected = rows.slice(0, maxEvents);
    const events = selected
      .map(rowToMessageEvent)
      .filter((event): event is LineSyncMessageEvent => event !== null);
    const last = selected[selected.length - 1] ?? null;
    return {
      type: 'LINE_PATCH',
      line_id: request.line_id,
      base_cursor: request.since_cursor ?? null,
      new_cursor: cursorFromRow(last),
      events,
      has_more: rows.length > selected.length,
    };
  }

  async applyPatch(rawPatch: unknown): Promise<LinePatchAck | null> {
    const parsed = parseLinePatch(rawPatch);
    if (!parsed.ok) {
      return null;
    }

    const patch = parsed.value;
    const applied: string[] = [];
    const rejected: NonNullable<LinePatchAck['rejected_event_ids']> = [];

    for (const event of patch.events) {
      const row = rowFromMessageEvent(event, 'peer_patch');
      if (!row) {
        rejected.push({ event_id: event.event_id, reason: 'malformed' });
        continue;
      }
      try {
        const inserted = await this.dao.insert(row);
        if (inserted) {
          applied.push(row.event_id);
        } else {
          rejected.push({ event_id: row.event_id, reason: 'duplicate' });
        }
      } catch {
        rejected.push({ event_id: row.event_id, reason: 'malformed' });
      }
    }

    const heads = await this.dao.getHeadsByLineId(patch.line_id);
    return {
      type: 'LINE_PATCH_ACK',
      line_id: patch.line_id,
      applied_event_ids: applied,
      rejected_event_ids: rejected.length ? rejected : undefined,
      new_head_event_ids: heads.map((row) => row.event_id),
      new_cursor: cursorFromRow(heads[0]),
    };
  }

  async mergePeerBlobLocation(args: {
    lineId: string;
    blobId: string;
    sha256: string;
    nodeId: string;
    userId?: string;
    caps?: string[];
  }): Promise<number> {
    const location: BlobLocationPeer = {
      type: 'peer',
      node_id: args.nodeId,
      ...(args.userId ? { user_id: args.userId } : {}),
      ...(args.caps?.length ? { caps: args.caps } : {}),
    };
    return this.dao.mergeBlobPeerLocation({
      lineId: args.lineId,
      blobId: args.blobId,
      sha256: args.sha256,
      location,
    });
  }

  async removePeerBlobLocation(args: {
    lineId: string;
    blobId: string;
    nodeId: string;
  }): Promise<number> {
    return this.dao.removeBlobPeerLocation(args);
  }

  async findBlobRef(lineId: string, blobId: string): Promise<BlobRef | null> {
    return this.dao.findBlobRef(lineId, blobId);
  }

  async findBlobRefByServerUrls(lineId: string, urls: string[]): Promise<BlobRef | null> {
    return this.dao.findBlobRefByServerUrls(lineId, urls);
  }

  async sendSummaryToPeer(
    targetUserId: string,
    lineId: string,
    retainLastN?: number,
  ): Promise<LineSummary | null> {
    try {
      await SignalingService.whenConnected(15000);
    } catch {
      return null;
    }
    const summary = await this.buildSummary(lineId, retainLastN ?? 10);
    SignalingService.sendLineSync(targetUserId, summary);
    return summary;
  }

  /**
   * Отправляет `LINE_PATCH` собеседнику и ждёт `LINE_PATCH_ACK` с подтверждением `primaryEventId`
   * в `applied_event_ids` (или отказ в `rejected_event_ids`).
   */
  async sendPatchAndWaitForPeerAck(args: {
    targetUserId: string;
    lineId: string;
    patch: LinePatch;
    primaryEventId: string;
    timeoutMs: number;
  }): Promise<PeerPatchDeliveryResult> {
    try {
      await SignalingService.whenConnected(Math.min(args.timeoutMs, 15000));
    } catch {
      return { ok: false, reason: 'not_connected' };
    }

    if (!SignalingService.isConnected()) {
      return { ok: false, reason: 'not_connected' };
    }

    if (this.pendingPatchAckByEventId.has(args.primaryEventId)) {
      return { ok: false, reason: 'partial' };
    }

    return new Promise<PeerPatchDeliveryResult>((resolve) => {
      const timer = setTimeout(() => {
        this.settlePendingPatchAck(args.primaryEventId, { ok: false, reason: 'timeout' });
      }, args.timeoutMs);

      this.pendingPatchAckByEventId.set(args.primaryEventId, {
        lineId: args.lineId,
        peerUserId: args.targetUserId,
        resolve,
        timer,
      });

      SignalingService.sendLineSync(args.targetUserId, args.patch);
    });
  }

  private rejectAllPendingPatchAcks(reason: 'not_connected'): void {
    const entries = [...this.pendingPatchAckByEventId.entries()];
    for (const [eventId, pending] of entries) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, reason });
      this.pendingPatchAckByEventId.delete(eventId);
    }
  }

  private settlePendingPatchAck(eventId: string, result: PeerPatchDeliveryResult): void {
    const pending = this.pendingPatchAckByEventId.get(eventId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingPatchAckByEventId.delete(eventId);
    pending.resolve(result);
  }

  private handleInboundPatchAck(fromUserId: string, ack: LinePatchAck): void {
    for (const rejection of ack.rejected_event_ids ?? []) {
      const pending = this.pendingPatchAckByEventId.get(rejection.event_id);
      if (!pending || pending.peerUserId !== fromUserId || pending.lineId !== ack.line_id) {
        continue;
      }
      this.settlePendingPatchAck(rejection.event_id, { ok: false, reason: 'rejected' });
    }
    for (const eventId of ack.applied_event_ids) {
      const pending = this.pendingPatchAckByEventId.get(eventId);
      if (!pending || pending.peerUserId !== fromUserId || pending.lineId !== ack.line_id) {
        continue;
      }
      this.settlePendingPatchAck(eventId, { ok: true });
    }
  }

  private async handleRawPeerMessage(raw: string): Promise<void> {
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const fromUserId = typeof envelope.from_user_id === 'string' ? envelope.from_user_id : null;
    const parsed = parseLineSyncPeerMessage(envelope.message);
    if (!fromUserId || !parsed.ok) {
      return;
    }

    const message = parsed.value;
    if (message.type === 'LINE_SUMMARY') {
      const summary = parseLineSummary(message);
      if (!summary.ok) return;
      const localHeads = await this.dao.getHeadsByLineId(summary.value.line_id);
      const missingHead = summary.value.head_event_ids.some(
        (eventId) => !localHeads.some((row) => row.event_id === eventId)
      );
      if (!missingHead && localHeads.length > 0) return;

      SignalingService.sendLineSync(fromUserId, {
        type: 'LINE_PATCH_REQUEST',
        line_id: summary.value.line_id,
        mode: 'last_n',
        last_n: summary.value.retain_last_n ?? 10,
        known_head_event_ids: localHeads.map((row) => row.event_id),
        max_events: 50,
      } satisfies LinePatchRequest);
      return;
    }

    if (message.type === 'LINE_PATCH_REQUEST') {
      const request = parseLinePatchRequest(message);
      if (!request.ok) return;
      const patch = await this.buildPatch(request.value);
      SignalingService.sendLineSync(fromUserId, patch);
      return;
    }

    if (message.type === 'LINE_PATCH') {
      const ack = await this.applyPatch(message);
      if (ack) {
        SignalingService.sendLineSync(fromUserId, ack);
      }
      return;
    }

    if (message.type === 'LINE_PATCH_ACK') {
      const ackRes = parseLinePatchAck(message);
      if (!ackRes.ok) return;
      this.handleInboundPatchAck(fromUserId, ackRes.value);
    }
  }
}

export const LineSyncService = new LineSyncServiceClass();
