import type { MappedMessage } from './message';

export type ChatType = 'private' | 'group' | 'channel' | string;

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
}

export type { MappedMessage };
