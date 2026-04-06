/**
 * DatabaseService - initializes SQLite DB, runs schema, enables WAL and foreign_keys.
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, DB_VERSION } from '../db/schema';

const DB_NAME = 'messenger.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

async function hasColumn(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function ensureSchemaColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const repairs: Array<{ table: string; column: string; sql: string }> = [
    {
      table: 'users',
      column: 'handle',
      sql: 'ALTER TABLE users ADD COLUMN handle TEXT;',
    },
    {
      table: 'chats',
      column: 'pinned_message_id',
      sql: 'ALTER TABLE chats ADD COLUMN pinned_message_id TEXT;',
    },
    {
      table: 'chats',
      column: 'description',
      sql: 'ALTER TABLE chats ADD COLUMN description TEXT;',
    },
    {
      table: 'sync_queue',
      column: 'user_id',
      sql: 'ALTER TABLE sync_queue ADD COLUMN user_id TEXT;',
    },
    {
      table: 'chat_members',
      column: 'tag',
      sql: 'ALTER TABLE chat_members ADD COLUMN tag TEXT;',
    },
    {
      table: 'chat_members',
      column: 'tag_color',
      sql: 'ALTER TABLE chat_members ADD COLUMN tag_color TEXT;',
    },
  ];

  for (const repair of repairs) {
    const exists = await hasColumn(db, repair.table, repair.column);
    if (!exists) {
      await db.execAsync(repair.sql);
    }
  }
}

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  let db = await SQLite.openDatabaseAsync(DB_NAME);

  // DB settings
  await db.execAsync('PRAGMA journal_mode=WAL;');
  await db.execAsync('PRAGMA foreign_keys=ON;');

  // Run migrations based on user_version
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < DB_VERSION) {
    // v1->v2: full DB reset (fix "no such column: id")
    if (currentVersion < 2) {
      await db.closeAsync();
      dbInstance = null;
      await SQLite.deleteDatabaseAsync(DB_NAME);
      db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode=WAL;');
      await db.execAsync('PRAGMA foreign_keys=ON;');
    }
    // v2->v3: add handle column to users (only when upgrading from v2; skip if v1 reset)
    if (currentVersion >= 2 && currentVersion < 3) {
      try {
        await db.execAsync('ALTER TABLE users ADD COLUMN handle TEXT;');
      } catch {
        // Column may already exist
      }
    }
    // v3->v4: add pinned_message_id to chats
    if (currentVersion >= 3 && currentVersion < 4) {
      try {
        await db.execAsync('ALTER TABLE chats ADD COLUMN pinned_message_id TEXT;');
      } catch {
        // Column may already exist
      }
    }
    // v4->v5: scope sync queue by user to prevent cross-account replay of pending media
    if (currentVersion >= 4 && currentVersion < 5) {
      try {
        await db.execAsync('ALTER TABLE sync_queue ADD COLUMN user_id TEXT;');
      } catch {
        // Column may already exist
      }
      // Legacy pending queue entries were not tied to a user and are unsafe after account switch.
      await db.execAsync('DELETE FROM sync_queue WHERE user_id IS NULL;');
    }
    // v5->v6: add chat description for group profile/edit support
    if (currentVersion >= 5 && currentVersion < 6) {
      try {
        await db.execAsync('ALTER TABLE chats ADD COLUMN description TEXT;');
      } catch {
        // Column may already exist
      }
    }
    // v6->v7: add optional local tag to chat members for group moderation labels
    if (currentVersion >= 6 && currentVersion < 7) {
      try {
        await db.execAsync('ALTER TABLE chat_members ADD COLUMN tag TEXT;');
      } catch {
        // Column may already exist
      }
    }
    // v7->v8: add optional tag color for member labels
    if (currentVersion >= 7 && currentVersion < 8) {
      try {
        await db.execAsync('ALTER TABLE chat_members ADD COLUMN tag_color TEXT;');
      } catch {
        // Column may already exist
      }
    }
    await db.execAsync(SCHEMA_SQL);
    await db.runAsync('PRAGMA user_version = ' + DB_VERSION);
  }

  // Repair drifted local schemas even when user_version was already bumped earlier.
  await db.execAsync(SCHEMA_SQL);
  await ensureSchemaColumns(db);
  await db.runAsync('PRAGMA user_version = ' + DB_VERSION);

  dbInstance = db;
  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
}
