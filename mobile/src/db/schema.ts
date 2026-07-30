/**
 * SQLite schema definitions and migrations.
 * Uses PRAGMA user_version for migration tracking.
 */

export const DB_VERSION = 18;

export const SCHEMA_SQL = `
-- users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  handle TEXT,
  display_name TEXT,
  last_name TEXT,
  bio TEXT,
  birthday INTEGER,
  avatar_url TEXT,
  avatar_local_path TEXT,
  phone TEXT,
  is_online INTEGER DEFAULT 0,
  last_seen INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- auth_session (single row, id=1)
CREATE TABLE IF NOT EXISTS auth_session (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- chats
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  chat_type TEXT NOT NULL,
  name TEXT,
  description TEXT,
  avatar_url TEXT,
  visibility TEXT DEFAULT 'public',
  access_type TEXT DEFAULT 'free',
  subscription_price_cents INTEGER,
  subscription_period_days INTEGER,
  linked_discussion_chat_id TEXT,
  invite_token TEXT,
  allow_comments INTEGER DEFAULT 1,
  allow_reactions INTEGER DEFAULT 1,
  preview_post_count INTEGER DEFAULT 3,
  subscriber_count INTEGER DEFAULT 0,
  active_subscriber_count INTEGER DEFAULT 0,
  access_status TEXT DEFAULT 'active',
  subscription_expires_at INTEGER,
  pending_earnings_cents INTEGER DEFAULT 0,
  available_payout_cents INTEGER DEFAULT 0,
  paid_out_cents INTEGER DEFAULT 0,
  created_by TEXT,
  last_message_id TEXT,
  pinned_message_id TEXT,
  last_message_at INTEGER,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  draft TEXT,
  local_contact_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (pinned_message_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- chat_members
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  tag TEXT,
  tag_color TEXT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  msg_type TEXT NOT NULL,
  content TEXT,
  reply_to_id TEXT,
  thread_root_message_id TEXT,
  is_channel_post INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  is_edited INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sending',
  transport TEXT DEFAULT 'websocket',
  server_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- media
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  media_type TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  local_path TEXT,
  remote_url TEXT,
  thumbnail_path TEXT,
  waveform BLOB,
  is_round INTEGER DEFAULT 0,
  is_viewed INTEGER DEFAULT 0,
  is_played INTEGER DEFAULT 0,
  playback_pos_ms INTEGER DEFAULT 0,
  upload_status TEXT DEFAULT 'pending',
  upload_progress REAL DEFAULT 0,
  temp_path TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Ensure auth_session has the single row (id=1)
INSERT OR IGNORE INTO auth_session (id, created_at) VALUES (1, 0);

-- sync_queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  entity_id TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  next_retry_at INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status) WHERE status IN ('sending','failed');
CREATE INDEX IF NOT EXISTS idx_messages_server ON messages(server_id);
CREATE INDEX IF NOT EXISTS idx_chats_sort ON chats(is_pinned DESC, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_message ON media(message_id);
CREATE INDEX IF NOT EXISTS idx_media_upload ON media(upload_status) WHERE upload_status != 'done';
CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_sync_user_pending ON sync_queue(user_id, status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Messages hidden only on this device (do not sync to server)
CREATE TABLE IF NOT EXISTS locally_hidden_messages (
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_locally_hidden_chat ON locally_hidden_messages(chat_id);

-- LineSync: local durable event log (first slice stores message.create, etc.)
CREATE TABLE IF NOT EXISTS line_sync_events (
  event_id TEXT PRIMARY KEY,
  line_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  author_user_id TEXT,
  created_at INTEGER NOT NULL,
  logical_clock INTEGER NOT NULL,
  signature TEXT,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  server_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_line_sync_line ON line_sync_events(line_id);
CREATE INDEX IF NOT EXISTS idx_line_sync_line_created ON line_sync_events(line_id, created_at);
CREATE INDEX IF NOT EXISTS idx_line_sync_state ON line_sync_events(sync_state);

-- Telegram (TDLib) message cache for instant chat reopen
CREATE TABLE IF NOT EXISTS telegram_messages (
  id TEXT PRIMARY KEY,
  telegram_chat_id INTEGER NOT NULL,
  message_thread_id INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER NOT NULL,
  date_ms INTEGER NOT NULL,
  outgoing INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat_thread_date
  ON telegram_messages(telegram_chat_id, message_thread_id, message_id DESC);
`;
