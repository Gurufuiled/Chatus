/**
 * ChatMemberDao - CRUD operations for chat_members table.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { ChatMemberRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

export class ChatMemberDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async insert(row: ChatMemberRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO chat_members (chat_id, user_id, role, tag, tag_color, joined_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      row.chat_id,
      row.user_id,
      row.role ?? 'member',
      row.tag ?? null,
      row.tag_color ?? null,
      row.joined_at
    );
  }

  async getByChatAndUser(chatId: string, userId: string): Promise<ChatMemberRow | null> {
    const row = await this.db.getFirstAsync<ChatMemberRow>(
      'SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?',
      chatId,
      userId
    );
    return row ?? null;
  }

  async getByChatId(chatId: string): Promise<ChatMemberRow[]> {
    return this.db.getAllAsync<ChatMemberRow>(
      'SELECT * FROM chat_members WHERE chat_id = ?',
      chatId
    );
  }

  async getByUserId(userId: string): Promise<ChatMemberRow[]> {
    return this.db.getAllAsync<ChatMemberRow>(
      'SELECT * FROM chat_members WHERE user_id = ?',
      userId
    );
  }

  async update(row: Partial<ChatMemberRow> & { chat_id: string; user_id: string }): Promise<void> {
    const existing = await this.getByChatAndUser(row.chat_id, row.user_id);
    if (!existing) return;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (row.role !== undefined) {
      updates.push('role = ?');
      values.push(row.role);
    }
    if (row.tag !== undefined) {
      updates.push('tag = ?');
      values.push(row.tag ?? null);
    }
    if (row.tag_color !== undefined) {
      updates.push('tag_color = ?');
      values.push(row.tag_color ?? null);
    }
    if (row.joined_at !== undefined) {
      updates.push('joined_at = ?');
      values.push(row.joined_at);
    }
    if (updates.length === 0) return;

    values.push(row.chat_id, row.user_id);
    await this.db.runAsync(
      `UPDATE chat_members SET ${updates.join(', ')} WHERE chat_id = ? AND user_id = ?`,
      values as (string | number | null)[]
    );
  }

  async delete(chatId: string, userId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?',
      chatId,
      userId
    );
  }

  async deleteByChatId(chatId: string): Promise<void> {
    await this.db.runAsync('DELETE FROM chat_members WHERE chat_id = ?', chatId);
  }
}
