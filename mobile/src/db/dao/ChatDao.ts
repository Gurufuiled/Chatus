/**
 * ChatDao - CRUD operations for chats table.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { ChatRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

export class ChatDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async insert(row: ChatRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO chats (id, chat_type, name, description, avatar_url, visibility, access_type, subscription_price_cents, subscription_period_days, linked_discussion_chat_id, invite_token, allow_comments, allow_reactions, preview_post_count, subscriber_count, active_subscriber_count, access_status, subscription_expires_at, pending_earnings_cents, available_payout_cents, paid_out_cents, created_by, last_message_id, pinned_message_id, last_message_at, last_message_preview, unread_count, is_muted, is_pinned, is_archived, draft, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.chat_type,
      row.name ?? null,
      row.description ?? null,
      row.avatar_url ?? null,
      row.visibility ?? 'public',
      row.access_type ?? 'free',
      row.subscription_price_cents ?? null,
      row.subscription_period_days ?? null,
      row.linked_discussion_chat_id ?? null,
      row.invite_token ?? null,
      row.allow_comments ?? 1,
      row.allow_reactions ?? 1,
      row.preview_post_count ?? 3,
      row.subscriber_count ?? 0,
      row.active_subscriber_count ?? 0,
      row.access_status ?? 'active',
      row.subscription_expires_at ?? null,
      row.pending_earnings_cents ?? 0,
      row.available_payout_cents ?? 0,
      row.paid_out_cents ?? 0,
      row.created_by ?? null,
      row.last_message_id ?? null,
      row.pinned_message_id ?? null,
      row.last_message_at ?? null,
      row.last_message_preview ?? null,
      row.unread_count ?? 0,
      row.is_muted ?? 0,
      row.is_pinned ?? 0,
      row.is_archived ?? 0,
      row.draft ?? null,
      row.created_at,
      row.updated_at
    );
  }

  async getById(id: string): Promise<ChatRow | null> {
    const row = await this.db.getFirstAsync<ChatRow>(
      'SELECT * FROM chats WHERE id = ?',
      id
    );
    return row ?? null;
  }

  async update(row: Partial<ChatRow> & { id: string }): Promise<void> {
    const existing = await this.getById(row.id);
    if (!existing) return;

    const updates: string[] = [];
    const values: unknown[] = [];

    const fields = [
      'chat_type', 'name', 'description', 'avatar_url', 'visibility', 'access_type',
      'subscription_price_cents', 'subscription_period_days', 'linked_discussion_chat_id',
      'invite_token', 'allow_comments', 'allow_reactions', 'preview_post_count',
      'subscriber_count', 'active_subscriber_count', 'access_status', 'subscription_expires_at',
      'pending_earnings_cents', 'available_payout_cents', 'paid_out_cents', 'created_by',
      'last_message_id', 'pinned_message_id', 'last_message_at', 'last_message_preview', 'unread_count', 'is_muted',
      'is_pinned', 'is_archived', 'draft', 'created_at', 'updated_at'
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
      `UPDATE chats SET ${updates.join(', ')} WHERE id = ?`,
      values as (string | number | null)[]
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM chats WHERE id = ?', id);
  }

  async getAllSorted(): Promise<ChatRow[]> {
    return this.db.getAllAsync<ChatRow>(
      'SELECT * FROM chats ORDER BY is_pinned DESC, last_message_at DESC'
    );
  }
}
