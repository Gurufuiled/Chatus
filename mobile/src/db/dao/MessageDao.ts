/**
 * MessageDao - CRUD operations for messages table.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MessageRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';
import { normalizeMessageFlag } from '../../utils/messageFlags';
import { normalizeMessageTransport } from '../../utils/messageTransport';

export class MessageDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  private normalizeRow(row: MessageRow): MessageRow {
    return {
      ...row,
      transport: normalizeMessageTransport(row.transport),
      is_edited: normalizeMessageFlag(row.is_edited),
      is_deleted: normalizeMessageFlag(row.is_deleted),
    };
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
      normalizeMessageTransport(row.transport),
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
    return row ? this.normalizeRow(row) : null;
  }

  async getByServerId(serverId: string): Promise<MessageRow | null> {
    const row = await this.db.getFirstAsync<MessageRow>(
      'SELECT * FROM messages WHERE server_id = ?',
      serverId
    );
    return row ? this.normalizeRow(row) : null;
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
        values.push(f === 'transport' ? normalizeMessageTransport(row[f]) : (row[f] ?? null));
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

  private async repointMessageIdReferences(oldId: string, newId: string): Promise<void> {
    await this.db.runAsync(
      'UPDATE messages SET reply_to_id = ? WHERE reply_to_id = ?',
      newId,
      oldId,
    );
    await this.db.runAsync(
      'UPDATE messages SET thread_root_message_id = ? WHERE thread_root_message_id = ?',
      newId,
      oldId,
    );
    await this.db.runAsync('UPDATE media SET message_id = ? WHERE message_id = ?', newId, oldId);
    await this.db.runAsync(
      'UPDATE chats SET last_message_id = ? WHERE last_message_id = ?',
      newId,
      oldId,
    );
    await this.db.runAsync(
      'UPDATE chats SET pinned_message_id = ? WHERE pinned_message_id = ?',
      newId,
      oldId,
    );
    await this.db.runAsync(
      `INSERT OR IGNORE INTO locally_hidden_messages (chat_id, message_id, created_at)
       SELECT chat_id, ?, created_at FROM locally_hidden_messages WHERE message_id = ?`,
      newId,
      oldId,
    );
    await this.db.runAsync(
      'DELETE FROM locally_hidden_messages WHERE message_id = ?',
      oldId,
    );
  }

  async replaceId(oldId: string, row: MessageRow): Promise<void> {
    const normalized: MessageRow = {
      ...row,
      transport: normalizeMessageTransport(row.transport),
      is_edited: normalizeMessageFlag(row.is_edited),
      is_deleted: normalizeMessageFlag(row.is_deleted),
    };

    if (oldId === normalized.id) {
      await this.update(normalized);
      return;
    }

    const existing = await this.getById(oldId);
    if (!existing) {
      const byNewId = await this.getById(normalized.id);
      if (!byNewId) {
        await this.insert(normalized);
      }
      return;
    }

    const targetExists = await this.getById(normalized.id);
    if (targetExists) {
      await this.db.withTransactionAsync(async () => {
        await this.repointMessageIdReferences(oldId, normalized.id);
        await this.delete(oldId);
      });
      return;
    }

    await this.db.withTransactionAsync(async () => {
      await this.repointMessageIdReferences(oldId, normalized.id);
      await this.db.runAsync(
        `UPDATE messages SET
          id = ?, chat_id = ?, sender_id = ?, msg_type = ?, content = ?,
          reply_to_id = ?, thread_root_message_id = ?, is_channel_post = ?,
          view_count = ?, comment_count = ?, is_edited = ?, is_deleted = ?,
          status = ?, transport = ?, server_id = ?, created_at = ?, updated_at = ?
         WHERE id = ?`,
        normalized.id,
        normalized.chat_id,
        normalized.sender_id,
        normalized.msg_type,
        normalized.content ?? null,
        normalized.reply_to_id ?? null,
        normalized.thread_root_message_id ?? null,
        normalized.is_channel_post ?? 0,
        normalized.view_count ?? 0,
        normalized.comment_count ?? 0,
        normalized.is_edited ?? 0,
        normalized.is_deleted ?? 0,
        normalized.status ?? 'sending',
        normalized.transport,
        normalized.server_id ?? null,
        normalized.created_at,
        normalized.updated_at,
        oldId,
      );
    });
  }

  async getByChatId(chatId: string, limit?: number): Promise<MessageRow[]> {
    const sql = limit
      ? 'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC';
    const args = limit ? [chatId, limit] : [chatId];
    const rows = await this.db.getAllAsync<MessageRow>(sql, ...args);
    return rows.map((row) => this.normalizeRow(row));
  }

  async getPendingOrFailed(): Promise<MessageRow[]> {
    const rows = await this.db.getAllAsync<MessageRow>(
      "SELECT * FROM messages WHERE status IN ('sending','failed')"
    );
    return rows.map((row) => this.normalizeRow(row));
  }
}
