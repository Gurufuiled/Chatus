/**
 * Central db module - exports DatabaseService, types, and DAOs.
 */

export {
  initDatabase,
  getDatabase,
  closeDatabase,
} from '../services/DatabaseService';

export type {
  UserRow,
  AuthSessionRow,
  ChatRow,
  ChatMemberRow,
  MessageRow,
  MediaRow,
  LineSyncEventRow,
  SyncQueueRow,
} from './types';

export { UserDao } from './dao/UserDao';
export { AuthSessionDao } from './dao/AuthSessionDao';
export { ChatDao } from './dao/ChatDao';
export { ChatMemberDao } from './dao/ChatMemberDao';
export { MessageDao } from './dao/MessageDao';
export { MediaDao } from './dao/MediaDao';
export { SyncQueueDao } from './dao/SyncQueueDao';
export { LineSyncEventDao } from './dao/LineSyncEventDao';
export { TelegramMessageDao } from './dao/TelegramMessageDao';
