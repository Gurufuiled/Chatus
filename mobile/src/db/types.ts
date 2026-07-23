/**
 * TypeScript interfaces for SQLite row types.
 */

import type { MessageTransport } from '../utils/messageTransport';

export interface UserRow {
  id: string;
  username: string;
  handle: string | null;
  display_name: string | null;
  last_name?: string | null;
  bio?: string | null;
  birthday?: number | null;
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
  chat_type: 'private' | 'group' | 'channel' | 'discussion';
  name: string | null;
  description?: string | null;
  avatar_url: string | null;
  visibility?: 'public' | 'private';
  access_type?: 'free' | 'paid';
  subscription_price_cents?: number | null;
  subscription_period_days?: number | null;
  linked_discussion_chat_id?: string | null;
  invite_token?: string | null;
  allow_comments?: number;
  allow_reactions?: number;
  disable_comments_new?: number;
  disable_comments_new_since?: number | null;
  disable_comments_all?: number;
  disable_voice_comments?: number;
  disable_media_comments?: number;
  comment_cooldown_sec?: number;
  slug?: string | null;
  preview_post_count?: number;
  subscriber_count?: number;
  active_subscriber_count?: number;
  access_status?: 'none' | 'pending' | 'active' | 'expired' | 'canceled';
  subscription_expires_at?: number | null;
  pending_earnings_cents?: number;
  available_payout_cents?: number;
  paid_out_cents?: number;
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
    admin_permissions?: Record<string, boolean> | null;
    tag?: string | null;
    tag_color?: string | null;
    joined_at?: number;
    user?: {
      id: string;
      username: string | null;
      handle: string | null;
      display_name: string | null;
      last_name?: string | null;
      avatar_url: string | null;
      phone?: string | null;
      is_online: boolean;
      last_seen: number | null;
    };
  }[];
  /** Effective rights of the current user in a group, supplied by the API. */
  my_permissions?: {
    can_send_messages?: boolean;
    can_send_media?: boolean;
    can_restrict_saving_bypass?: boolean;
    [key: string]: boolean | undefined;
  };
  restrict_saving_content?: boolean;
  /** From API: display name of peer in private chat. */
  peer_display_name?: string | null;
  /** Local alias for private contact, never overwritten by server sync. */
  local_contact_name?: string | null;
  channel_permissions?: {
    can_post: boolean;
    can_manage_admins: boolean;
    can_edit_channel: boolean;
    can_moderate_subscribers: boolean;
    can_edit_channel_avatar: boolean;
    can_edit_channel_name: boolean;
    can_edit_channel_description: boolean;
    can_add_admins: boolean;
    can_remove_admins: boolean;
    can_edit_admin_permissions: boolean;
  };
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
  thread_root_message_id?: string | null;
  is_channel_post?: number;
  view_count?: number;
  comment_count?: number;
  is_edited: number;
  is_deleted: number;
  status: string;
  transport: MessageTransport;
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

/** Local LineSync durable log row; payload_json holds protocol-shaped JSON (e.g. message.create). */
export interface LineSyncEventRow {
  event_id: string;
  line_id: string;
  event_type: string;
  payload_json: string;
  author_user_id: string | null;
  created_at: number;
  logical_clock: number;
  signature: string | null;
  /** e.g. pending | synced | failed — local semantics only until transport consumes the log. */
  sync_state: string;
  /** Server-assigned message id after optimistic `msg:<tempId>` is acknowledged; event_id stays `msg:<tempId>`. */
  server_message_id?: string | null;
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

/** Cached TDLib message (`telegram_messages` table) for instant Telegram chat reopen. */
export interface TelegramMessageCacheRow {
  id: string;
  telegram_chat_id: number;
  message_thread_id: number;
  message_id: number;
  date_ms: number;
  outgoing: number;
  kind: string;
  status: string;
  payload_json: string;
  updated_at: number;
}
