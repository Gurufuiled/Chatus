/**
 * LineSyncEventDao — local durable LineSync event log.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { LineSyncEventRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';
import { messageIdToLineSyncEventId } from '../../services/lineSyncEventBuilder';
import type { BlobLocationPeer, BlobRef, MessageCreateEvent } from '../../services/lineSyncProtocol';

export class LineSyncEventDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  /**
   * Idempotent insert: duplicate event_id is ignored (SQLite INSERT OR IGNORE).
   * @returns true if a row was inserted, false if ignored (duplicate event_id).
   */
  async insert(row: LineSyncEventRow): Promise<boolean> {
    const result = await this.db.runAsync(
      `INSERT OR IGNORE INTO line_sync_events (
        event_id, line_id, event_type, payload_json, author_user_id,
        created_at, logical_clock, signature, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.event_id,
      row.line_id,
      row.event_type,
      row.payload_json,
      row.author_user_id ?? null,
      row.created_at,
      row.logical_clock,
      row.signature ?? null,
      row.sync_state ?? 'pending'
    );
    return result.changes > 0;
  }

  async getByEventId(eventId: string): Promise<LineSyncEventRow | null> {
    const row = await this.db.getFirstAsync<LineSyncEventRow>(
      'SELECT * FROM line_sync_events WHERE event_id = ?',
      eventId
    );
    return row ?? null;
  }

  /** Timeline order (oldest first). */
  async getByLineId(lineId: string): Promise<LineSyncEventRow[]> {
    return this.db.getAllAsync<LineSyncEventRow>(
      'SELECT * FROM line_sync_events WHERE line_id = ? ORDER BY created_at ASC, logical_clock ASC',
      lineId
    );
  }

  /** Events at or after cursor time (same sort as getByLineId). */
  async getSinceCreatedAt(lineId: string, createdAtInclusive: number): Promise<LineSyncEventRow[]> {
    return this.db.getAllAsync<LineSyncEventRow>(
      `SELECT * FROM line_sync_events
       WHERE line_id = ? AND created_at >= ?
       ORDER BY created_at ASC, logical_clock ASC`,
      lineId,
      createdAtInclusive
    );
  }

  /**
   * MVP heads: newest row per line (linear projection). DAG multi-head joins later when parent links exist in DB.
   */
  async getHeadsByLineId(lineId: string): Promise<LineSyncEventRow[]> {
    const row = await this.db.getFirstAsync<LineSyncEventRow>(
      `SELECT * FROM line_sync_events WHERE line_id = ?
       ORDER BY created_at DESC, logical_clock DESC
       LIMIT 1`,
      lineId
    );
    return row ? [row] : [];
  }

  async markSyncState(eventId: string, syncState: string): Promise<void> {
    await this.db.runAsync(
      'UPDATE line_sync_events SET sync_state = ? WHERE event_id = ?',
      syncState,
      eventId
    );
  }

  /** Удалить событие по PK (например откат peer-first перед fallback upload). */
  async deleteByEventId(eventId: string): Promise<number> {
    const result = await this.db.runAsync('DELETE FROM line_sync_events WHERE event_id = ?', eventId);
    return result.changes ?? 0;
  }

  /**
   * After server echo (`new_message` with stable id), link optimistic row `event_id = msg:<tempId>`
   * without changing PK or inserting a duplicate event.
   *
   * - Missing row → `'missing'` (caller may omit warning; event was never logged).
   * - Idempotent if `server_message_id` already equals `serverMessageId` → `'already_linked'`.
   * - Conflicting stored id → `'conflict'` (no mutation).
   * - Successfully set → `'linked'`.
   */
  async linkServerMessageIdForOptimisticTemp(
    clientTempId: string,
    serverMessageId: string
  ): Promise<'linked' | 'already_linked' | 'missing' | 'conflict'> {
    const trimmedTemp = clientTempId.trim();
    const trimmedServer = serverMessageId.trim();
    if (!trimmedTemp || !trimmedServer) return 'missing';

    const eventId = messageIdToLineSyncEventId(trimmedTemp);
    const row = await this.getByEventId(eventId);
    if (!row || row.event_type !== 'message.create') return 'missing';

    const existing =
      typeof row.server_message_id === 'string' ? row.server_message_id.trim() : row.server_message_id;
    if (existing === trimmedServer) return 'already_linked';
    if (existing != null && existing !== '') return 'conflict';

    await this.db.runAsync(
      'UPDATE line_sync_events SET server_message_id = ? WHERE event_id = ?',
      trimmedServer,
      eventId
    );
    return 'linked';
  }

  /**
   * Adds/updates one peer mirror location inside existing message.create blob_refs.
   * This preserves the original event id/content and only enriches BlobRef locations.
   */
  async mergeBlobPeerLocation(args: {
    lineId: string;
    blobId: string;
    sha256: string;
    location: BlobLocationPeer;
  }): Promise<number> {
    const rows = await this.getByLineId(args.lineId);
    let changed = 0;

    for (const row of rows) {
      if (row.event_type !== 'message.create') continue;

      let event: MessageCreateEvent;
      try {
        event = JSON.parse(row.payload_json) as MessageCreateEvent;
      } catch {
        continue;
      }
      if (!Array.isArray(event.blob_refs)) continue;

      let rowChanged = false;
      const blobRefs = event.blob_refs.map((blobRef) => {
        if (blobRef.blob_id !== args.blobId || blobRef.sha256 !== args.sha256) {
          return blobRef;
        }

        const locations = blobRef.locations.filter(
          (location) =>
            !(location.type === 'peer' && location.node_id === args.location.node_id)
        );
        locations.push(args.location);
        rowChanged = true;
        return {
          ...blobRef,
          locations,
        };
      });

      if (!rowChanged) continue;

      await this.db.runAsync(
        'UPDATE line_sync_events SET payload_json = ? WHERE event_id = ?',
        JSON.stringify({ ...event, blob_refs: blobRefs }),
        row.event_id
      );
      changed += 1;
    }

    return changed;
  }

  async removeBlobPeerLocation(args: {
    lineId: string;
    blobId: string;
    nodeId: string;
  }): Promise<number> {
    const rows = await this.getByLineId(args.lineId);
    let changed = 0;

    for (const row of rows) {
      if (row.event_type !== 'message.create') continue;

      let event: MessageCreateEvent;
      try {
        event = JSON.parse(row.payload_json) as MessageCreateEvent;
      } catch {
        continue;
      }
      if (!Array.isArray(event.blob_refs)) continue;

      let rowChanged = false;
      const blobRefs = event.blob_refs.map((blobRef) => {
        if (blobRef.blob_id !== args.blobId) return blobRef;
        const locations = blobRef.locations.filter((location) => {
          const remove = location.type === 'peer' && location.node_id === args.nodeId;
          if (remove) rowChanged = true;
          return !remove;
        });
        return { ...blobRef, locations };
      });

      if (!rowChanged) continue;

      await this.db.runAsync(
        'UPDATE line_sync_events SET payload_json = ? WHERE event_id = ?',
        JSON.stringify({ ...event, blob_refs: blobRefs }),
        row.event_id
      );
      changed += 1;
    }

    return changed;
  }

  async findBlobRef(lineId: string, blobId: string): Promise<BlobRef | null> {
    const rows = await this.getByLineId(lineId);
    for (const row of rows) {
      if (row.event_type !== 'message.create') continue;

      let event: MessageCreateEvent;
      try {
        event = JSON.parse(row.payload_json) as MessageCreateEvent;
      } catch {
        continue;
      }
      const blobRef = event.blob_refs?.find((item) => item.blob_id === blobId);
      if (blobRef) return blobRef;
    }
    return null;
  }

  async findBlobRefByServerUrls(lineId: string, urls: string[]): Promise<BlobRef | null> {
    const candidates = new Set(urls.map((url) => url.trim()).filter(Boolean));
    if (candidates.size === 0) return null;

    const rows = await this.getByLineId(lineId);
    for (const row of rows) {
      if (row.event_type !== 'message.create') continue;

      let event: MessageCreateEvent;
      try {
        event = JSON.parse(row.payload_json) as MessageCreateEvent;
      } catch {
        continue;
      }

      const blobRef = event.blob_refs?.find((item) =>
        item.locations.some((location) => location.type === 'server' && candidates.has(location.url))
      );
      if (blobRef) return blobRef;
    }
    return null;
  }
}
