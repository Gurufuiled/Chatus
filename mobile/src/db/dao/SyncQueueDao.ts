/**
 * SyncQueueDao - CRUD operations for sync_queue table.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

export class SyncQueueDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async insert(row: Omit<SyncQueueRow, 'id'>): Promise<number> {
    const result = await this.db.runAsync(
      `INSERT INTO sync_queue (user_id, action, payload, entity_id, retry_count, max_retries, status, created_at, next_retry_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.user_id ?? null,
      row.action,
      row.payload,
      row.entity_id ?? null,
      row.retry_count ?? 0,
      row.max_retries ?? 5,
      row.status ?? 'pending',
      row.created_at,
      row.next_retry_at ?? null
    );
    return Number(result.lastInsertRowId);
  }

  async getById(id: number): Promise<SyncQueueRow | null> {
    const row = await this.db.getFirstAsync<SyncQueueRow>(
      'SELECT * FROM sync_queue WHERE id = ?',
      id
    );
    return row ?? null;
  }

  async update(row: Partial<SyncQueueRow> & { id: number }): Promise<void> {
    const existing = await this.getById(row.id);
    if (!existing) return;

    const updates: string[] = [];
    const values: unknown[] = [];

    const fields = [
      'user_id', 'action', 'payload', 'entity_id', 'retry_count', 'max_retries',
      'status', 'created_at', 'next_retry_at'
    ] as const;
    for (const f of fields) {
      if (row[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(row[f] ?? null);
      }
    }
    if (updates.length === 0) return;

    values.push(row.id);
    await this.db.runAsync(
      `UPDATE sync_queue SET ${updates.join(', ')} WHERE id = ?`,
      values as (string | number | null)[]
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
  }

  async getPending(userId: string): Promise<SyncQueueRow[]> {
    return this.db.getAllAsync<SyncQueueRow>(
      "SELECT * FROM sync_queue WHERE user_id = ? AND status = 'pending' ORDER BY next_retry_at ASC",
      userId
    );
  }

  async getReadyForRetry(userId: string, now: number): Promise<SyncQueueRow[]> {
    return this.db.getAllAsync<SyncQueueRow>(
      "SELECT * FROM sync_queue WHERE user_id = ? AND status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY created_at ASC",
      userId,
      now
    );
  }

  async getNextRetryAt(userId: string): Promise<number | null> {
    const row = await this.db.getFirstAsync<{ next_retry_at: number | null }>(
      `SELECT COALESCE(MIN(next_retry_at), MIN(created_at)) AS next_retry_at
       FROM sync_queue
       WHERE user_id = ? AND status = 'pending'`,
      userId
    );
    return row?.next_retry_at ?? null;
  }

  /** Schedules retry with exponential backoff: next_retry_at = now + 2^retryCount * 1000 ms */
  async scheduleRetry(id: number, retryCount: number): Promise<void> {
    const nextRetryAt = Date.now() + Math.pow(2, retryCount) * 1000;
    await this.db.runAsync(
      'UPDATE sync_queue SET next_retry_at = ?, retry_count = ? WHERE id = ?',
      nextRetryAt,
      retryCount,
      id
    );
  }

  /** Sets status = 'failed'. Caller must ensure the item has exceeded max_retries. */
  async markFailed(id: number): Promise<void> {
    await this.db.runAsync(
      "UPDATE sync_queue SET status = 'failed' WHERE id = ?",
      id
    );
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM sync_queue WHERE user_id = ? OR user_id IS NULL',
      userId
    );
  }
}
