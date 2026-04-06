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
      `INSERT INTO chats (id, chat_type, name, description, avatar_url, created_by, last_message_id, pinned_message_id, last_message_at, last_message_preview, unread_count, is_muted, is_pinned, is_archived, draft, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.chat_type,
      row.name ?? null,
      row.description ?? null,
      row.avatar_url ?? null,
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
      'chat_type', 'name', 'description', 'avatar_url', 'created_by', 'last_message_id',
      'pinned_message_id', 'last_message_at', 'last_message_preview', 'unread_count', 'is_muted',
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
