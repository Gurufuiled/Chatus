/**
 * TypeScript interfaces for SQLite row types.
 */

export interface UserRow {
  id: string;
  username: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_local_path: string | null;
  phone: string | null;
  is_online: number;
  last_seen: number | null;
  created_at: number;
  updated_at: number;
}

export interface AuthSessionRow {
  id: number;
  user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  created_at: number;
}

export interface ChatRow {
  id: string;
  chat_type: 'private' | 'group';
  name: string | null;
  description?: string | null;
  avatar_url: string | null;
  created_by: string | null;
  last_message_id: string | null;
  pinned_message_id: string | null;
  last_message_at: number | null;
  last_message_preview: string | null;
  unread_count: number;
  is_muted: number;
  is_pinned: number;
  is_archived: number;
  draft: string | null;
  created_at: number;
  updated_at: number;
  /** From API: members with user_id and optional user details. */
  members?: {
    user_id: string;
    role?: string;
    tag?: string | null;
    tag_color?: string | null;
    joined_at?: number;
    user?: {
      id: string;
      username: string | null;
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
      is_online: boolean;
      last_seen: number | null;
    };
  }[];
  /** From API: display name of peer in private chat. */
  peer_display_name?: string | null;
}

export interface ChatMemberRow {
  chat_id: string;
  user_id: string;
  role: string;
  tag?: string | null;
  tag_color?: string | null;
  joined_at: number;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  msg_type: string;
  content: string | null;
  reply_to_id: string | null;
  is_edited: number;
  is_deleted: number;
  status: string;
  transport: string;
  server_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface MediaRow {
  id: string;
  message_id: string | null;
  media_type: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  local_path: string | null;
  remote_url: string | null;
  thumbnail_path: string | null;
  /** When inserting: Uint8Array of JSON bytes. When reading: parsed number[]. */
  waveform: Uint8Array | number[] | null;
  is_round: number;
  is_viewed: number;
  is_played: number;
  playback_pos_ms: number;
  upload_status: string;
  upload_progress: number;
  temp_path: string | null;
  created_at: number;
}

export interface SyncQueueRow {
  id: number;
  user_id: string | null;
  action: string;
  payload: string;
  entity_id: string | null;
  retry_count: number;
  max_retries: number;
  status: string;
  created_at: number;
  next_retry_at: number | null;
}
