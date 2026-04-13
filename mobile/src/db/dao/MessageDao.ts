/**
 * MessageDao - CRUD operations for messages table.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MessageRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

export class MessageDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async insert(row: MessageRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO messages (id, chat_id, sender_id, msg_type, content, reply_to_id, thread_root_message_id, is_channel_post, view_count, comment_count, is_edited, is_deleted, status, transport, server_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.chat_id,
      row.sender_id,
      row.msg_type,
      row.content ?? null,
      row.reply_to_id ?? null,
      row.thread_root_message_id ?? null,
      row.is_channel_post ?? 0,
      row.view_count ?? 0,
      row.comment_count ?? 0,
      row.is_edited ?? 0,
      row.is_deleted ?? 0,
      row.status ?? 'sending',
      row.transport ?? 'server',
      row.server_id ?? null,
      row.created_at,
      row.updated_at
    );
  }

  async getById(id: string): Promise<MessageRow | null> {
    const row = await this.db.getFirstAsync<MessageRow>(
      'SELECT * FROM messages WHERE id = ?',
      id
    );
    return row ?? null;
  }

  async getByServerId(serverId: string): Promise<MessageRow | null> {
    const row = await this.db.getFirstAsync<MessageRow>(
      'SELECT * FROM messages WHERE server_id = ?',
      serverId
    );
    return row ?? null;
  }

  async update(row: Partial<MessageRow> & { id: string }): Promise<void> {
    const existing = await this.getById(row.id);
    if (!existing) return;

    const updates: string[] = [];
    const values: unknown[] = [];

    const fields = [
      'chat_id', 'sender_id', 'msg_type', 'content', 'reply_to_id', 'thread_root_message_id',
      'is_channel_post', 'view_count', 'comment_count',
      'is_edited', 'is_deleted', 'status', 'transport', 'server_id',
      'created_at', 'updated_at'
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
      `UPDATE messages SET ${updates.join(', ')} WHERE id = ?`,
      values as (string | number | null)[]
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM messages WHERE id = ?', id);
  }

  async getByChatId(chatId: string, limit?: number): Promise<MessageRow[]> {
    const sql = limit
      ? 'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC';
    const args = limit ? [chatId, limit] : [chatId];
    return this.db.getAllAsync<MessageRow>(sql, ...args);
  }

  async getPendingOrFailed(): Promise<MessageRow[]> {
    return this.db.getAllAsync<MessageRow>(
      "SELECT * FROM messages WHERE status IN ('sending','failed')"
    );
  }
}
