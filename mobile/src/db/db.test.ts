/**
 * Simple runtime test: init DB, insert, select.
 * Run with: npx ts-node src/db/db.test.ts (if ts-node available)
 * Or import and call from App.tsx on mount.
 */

import {
  initDatabase,
  UserDao,
  AuthSessionDao,
  ChatDao,
  MessageDao,
} from './index';

export async function runDbTest(): Promise<void> {
  await initDatabase();

  const userDao = new UserDao();
  const now = Date.now();

  // Insert user
  await userDao.insert({
    id: 'test-user-1',
    username: 'testuser',
    handle: 'testuser',
    display_name: 'Test User',
    avatar_url: null,
    avatar_local_path: null,
    phone: null,
    is_online: 0,
    last_seen: null,
    created_at: now,
    updated_at: now,
  });

  // Select user
  const user = await userDao.getById('test-user-1');
  if (!user || user.username !== 'testuser') {
    throw new Error('User insert/select failed');
  }

  // AuthSession
  const authDao = new AuthSessionDao();
  await authDao.update({
    user_id: 'test-user-1',
    access_token: 'token123',
    refresh_token: 'refresh456',
    expires_at: now + 3600000,
    created_at: now,
  });
  const session = await authDao.get();
  if (!session || session.user_id !== 'test-user-1') {
    throw new Error('AuthSession update/get failed');
  }

  // Chat + Message
  const chatDao = new ChatDao();
  const messageDao = new MessageDao();
  await chatDao.insert({
    id: 'chat-1',
    chat_type: 'private',
    name: null,
    avatar_url: null,
    created_by: 'test-user-1',
    last_message_id: null,
    pinned_message_id: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count: 0,
    is_muted: 0,
    is_pinned: 0,
    is_archived: 0,
    draft: null,
    created_at: now,
    updated_at: now,
  });
  await messageDao.insert({
    id: 'msg-1',
    chat_id: 'chat-1',
    sender_id: 'test-user-1',
    msg_type: 'text',
    content: 'Hello',
    reply_to_id: null,
    is_edited: 0,
    is_deleted: 0,
    status: 'sent',
    // @ts-expect-error Intentionally exercising legacy persisted transport input.
    transport: 'api',
    server_id: null,
    created_at: now,
    updated_at: now,
  });
  const msg = await messageDao.getById('msg-1');
  if (!msg || msg.content !== 'Hello') {
    throw new Error('Message insert/select failed');
  }
  if (msg.transport !== 'websocket') {
    throw new Error('Message transport normalization failed');
  }

  // Cleanup
  await messageDao.delete('msg-1');
  await chatDao.delete('chat-1');
  await authDao.clear();
  await userDao.delete('test-user-1');

  console.log('DB test passed');
}
