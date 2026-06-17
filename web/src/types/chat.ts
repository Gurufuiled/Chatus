import type { MappedMessage } from './message';

export type ChatType = 'private' | 'group' | 'channel' | string;

export interface MappedChatMember {
  chat_id: string;
  user_id: string;
  role: string;
  access_status: string;
  subscription_expires_at: number | null;
  tag: string | null;
  tag_color: string | null;
  joined_at: number;
  user?: {
    id: string;
    username: string | null;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    is_online: boolean;
    last_seen: number | null;
  };
}

export interface ChatSummary {
  id: string;
  chat_type: ChatType;
  name: string | null;
  peer_display_name: string | null;
  avatar_url: string | null;
  last_message_id: string | null;
  pinned_message_id?: string | null;
  last_message_at: number | null;
  last_message_preview: string | null;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  draft: string | null;
  created_at: number;
  updated_at: number;
  last_message?: MappedMessage;
  members?: MappedChatMember[];
}

export type { MappedMessage };
