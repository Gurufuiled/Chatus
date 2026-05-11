/**
 * DatabaseService - initializes SQLite DB, runs schema, enables WAL and foreign_keys.
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, DB_VERSION } from '../db/schema';
import { locallyHiddenMessageStore } from '../stores/locallyHiddenMessageStore';

const DB_NAME = 'messenger.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

const SCHEMA_REPAIRS: Array<{ table: string; column: string; sql: string }> = [
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
  {
    table: 'chats',
    column: 'visibility',
    sql: "ALTER TABLE chats ADD COLUMN visibility TEXT DEFAULT 'public';",
  },
  {
    table: 'chats',
    column: 'access_type',
    sql: "ALTER TABLE chats ADD COLUMN access_type TEXT DEFAULT 'free';",
  },
  {
    table: 'chats',
    column: 'subscription_price_cents',
    sql: 'ALTER TABLE chats ADD COLUMN subscription_price_cents INTEGER;',
  },
  {
    table: 'chats',
    column: 'subscription_period_days',
    sql: 'ALTER TABLE chats ADD COLUMN subscription_period_days INTEGER;',
  },
  {
    table: 'chats',
    column: 'linked_discussion_chat_id',
    sql: 'ALTER TABLE chats ADD COLUMN linked_discussion_chat_id TEXT;',
  },
  {
    table: 'chats',
    column: 'invite_token',
    sql: 'ALTER TABLE chats ADD COLUMN invite_token TEXT;',
  },
  {
    table: 'chats',
    column: 'allow_comments',
    sql: 'ALTER TABLE chats ADD COLUMN allow_comments INTEGER DEFAULT 1;',
  },
  {
    table: 'chats',
    column: 'allow_reactions',
    sql: 'ALTER TABLE chats ADD COLUMN allow_reactions INTEGER DEFAULT 1;',
  },
  {
    table: 'chats',
    column: 'preview_post_count',
    sql: 'ALTER TABLE chats ADD COLUMN preview_post_count INTEGER DEFAULT 3;',
  },
  {
    table: 'chats',
    column: 'subscriber_count',
    sql: 'ALTER TABLE chats ADD COLUMN subscriber_count INTEGER DEFAULT 0;',
  },
  {
    table: 'chats',
    column: 'active_subscriber_count',
    sql: 'ALTER TABLE chats ADD COLUMN active_subscriber_count INTEGER DEFAULT 0;',
  },
  {
    table: 'chats',
    column: 'access_status',
    sql: "ALTER TABLE chats ADD COLUMN access_status TEXT DEFAULT 'active';",
  },
  {
    table: 'chats',
    column: 'subscription_expires_at',
    sql: 'ALTER TABLE chats ADD COLUMN subscription_expires_at INTEGER;',
  },
  {
    table: 'chats',
    column: 'pending_earnings_cents',
    sql: 'ALTER TABLE chats ADD COLUMN pending_earnings_cents INTEGER DEFAULT 0;',
  },
  {
    table: 'chats',
    column: 'available_payout_cents',
    sql: 'ALTER TABLE chats ADD COLUMN available_payout_cents INTEGER DEFAULT 0;',
  },
  {
    table: 'chats',
    column: 'paid_out_cents',
    sql: 'ALTER TABLE chats ADD COLUMN paid_out_cents INTEGER DEFAULT 0;',
  },
  {
    table: 'messages',
    column: 'thread_root_message_id',
    sql: 'ALTER TABLE messages ADD COLUMN thread_root_message_id TEXT;',
  },
  {
    table: 'messages',
    column: 'is_channel_post',
    sql: 'ALTER TABLE messages ADD COLUMN is_channel_post INTEGER DEFAULT 0;',
  },
  {
    table: 'messages',
    column: 'view_count',
    sql: 'ALTER TABLE messages ADD COLUMN view_count INTEGER DEFAULT 0;',
  },
  {
    table: 'messages',
    column: 'comment_count',
    sql: 'ALTER TABLE messages ADD COLUMN comment_count INTEGER DEFAULT 0;',
  },
  {
    table: 'chats',
    column: 'local_contact_name',
    sql: 'ALTER TABLE chats ADD COLUMN local_contact_name TEXT;',
  },
  {
    table: 'users',
    column: 'last_name',
    sql: 'ALTER TABLE users ADD COLUMN last_name TEXT;',
  },
  {
    table: 'users',
    column: 'bio',
    sql: 'ALTER TABLE users ADD COLUMN bio TEXT;',
  },
  {
    table: 'users',
    column: 'birthday',
    sql: 'ALTER TABLE users ADD COLUMN birthday INTEGER;',
  },
  {
    table: 'line_sync_events',
    column: 'server_message_id',
    sql: 'ALTER TABLE line_sync_events ADD COLUMN server_message_id TEXT;',
  },
];

async function hasColumn(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function ensureSchemaColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const repair of SCHEMA_REPAIRS) {
    const exists = await hasColumn(db, repair.table, repair.column);
    if (!exists) {
      await db.execAsync(repair.sql);
    }
  }
}

async function normalizeLegacyMessageTransport(db: SQLite.SQLiteDatabase): Promise<void> {
  const hasMessagesTransport = await hasColumn(db, 'messages', 'transport');
  if (!hasMessagesTransport) return;

  await db.execAsync(
    "UPDATE messages SET transport = 'websocket' WHERE transport IS NULL OR LOWER(transport) IN ('api', 'server', 'ws');"
  );
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
    // v8->v9: add channel/discussion/subscription metadata to chats and messages
    if (currentVersion >= 8 && currentVersion < 9) {
      const migrations = SCHEMA_REPAIRS.filter(
        (repair) =>
          (repair.table === 'chats' &&
            [
              'visibility',
              'access_type',
              'subscription_price_cents',
              'subscription_period_days',
              'linked_discussion_chat_id',
              'invite_token',
              'allow_comments',
              'allow_reactions',
              'preview_post_count',
              'subscriber_count',
              'active_subscriber_count',
              'access_status',
              'subscription_expires_at',
              'pending_earnings_cents',
              'available_payout_cents',
              'paid_out_cents',
            ].includes(repair.column)) ||
          (repair.table === 'messages' &&
            ['thread_root_message_id', 'is_channel_post', 'view_count', 'comment_count'].includes(
              repair.column
            ))
      );
      for (const migration of migrations) {
        try {
          await db.execAsync(migration.sql);
        } catch {
          // Column may already exist
        }
      }
    }
    // v9->v10: add local alias for private contacts.
    if (currentVersion >= 9 && currentVersion < 10) {
      try {
        await db.execAsync('ALTER TABLE chats ADD COLUMN local_contact_name TEXT;');
      } catch {
        // Column may already exist
      }
    }
    await db.execAsync(SCHEMA_SQL);
    await normalizeLegacyMessageTransport(db);
    await db.runAsync('PRAGMA user_version = ' + DB_VERSION);
  }

  // Repair drifted local schemas even when user_version was already bumped earlier.
  await db.execAsync(SCHEMA_SQL);
  await ensureSchemaColumns(db);
  await normalizeLegacyMessageTransport(db);
  await db.runAsync('PRAGMA user_version = ' + DB_VERSION);

  try {
    const hiddenRows = await db.getAllAsync<{ chat_id: string; message_id: string }>(
      'SELECT chat_id, message_id FROM locally_hidden_messages'
    );
    locallyHiddenMessageStore.getState().hydrate(hiddenRows);
  } catch {
    // table may be missing on very old builds — SCHEMA_SQL above creates it on next run
  }

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
