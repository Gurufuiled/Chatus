/**
 * UserDao - CRUD operations for users table.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { UserRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

export class UserDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async insert(row: UserRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO users (id, username, handle, display_name, last_name, bio, birthday, avatar_url, avatar_local_path, phone, is_online, last_seen, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.username,
      row.handle ?? null,
      row.display_name ?? null,
      row.last_name ?? null,
      row.bio ?? null,
      row.birthday ?? null,
      row.avatar_url ?? null,
      row.avatar_local_path ?? null,
      row.phone ?? null,
      row.is_online ?? 0,
      row.last_seen ?? null,
      row.created_at,
      row.updated_at
    );
  }

  async getById(id: string): Promise<UserRow | null> {
    const row = await this.db.getFirstAsync<UserRow>(
      'SELECT * FROM users WHERE id = ?',
      id
    );
    return row ?? null;
  }

  async update(row: Partial<UserRow> & { id: string }): Promise<void> {
    const existing = await this.getById(row.id);
    if (!existing) return;

    const updates: string[] = [];
    const values: unknown[] = [];

    const fields = [
      'username',
      'handle',
      'display_name',
      'last_name',
      'bio',
      'birthday',
      'avatar_url',
      'avatar_local_path',
      'phone',
      'is_online',
      'last_seen',
      'created_at',
      'updated_at',
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
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values as (string | number | null)[]
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM users WHERE id = ?', id);
  }

  async getByUsername(username: string): Promise<UserRow | null> {
    const row = await this.db.getFirstAsync<UserRow>(
      'SELECT * FROM users WHERE username = ?',
      username
    );
    return row ?? null;
  }
}
