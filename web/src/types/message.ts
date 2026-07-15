export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error' | string;

export type MessageType =
  | 'text'
  | 'image'
  | 'voice'
  | 'video_note'
  | 'video'
  | 'file'
  | 'sticker'
  | 'system'
  | 'poll'
  | string;

export interface MappedMessageReaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
  reactors?: { user_id: string; avatar_url: string | null }[];
}

export interface MappedMedia {
  id: string;
  message_id: string;
  media_type: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  remote_url: string | null;
  thumbnail_url: string | null;
  waveform: string | null;
  is_round: boolean;
  created_at: number;
}

export interface MappedMessage {
  id: string;
  client_temp_id?: string | null;
  chat_id: string;
  sender_id: string;
  sender_name?: string | null;
  sender_avatar_url?: string | null;
  msg_type: MessageType;
  content: string | null;
  reply_to_id: string | null;
  thread_root_message_id?: string | null;
  is_channel_post?: boolean;
  view_count?: number;
  comment_count?: number;
  is_deleted: boolean;
  is_edited?: boolean;
  status: MessageStatus;
  created_at: number;
  updated_at: number;
  media?: MappedMedia[];
  reactions?: MappedMessageReaction[];
  /** Present when server attaches poll data (create/WS) or after client fetch. */
  poll?: import('@/utils/pollPayload').MappedPoll | null;
  forwarded_from_message_id?: string | null;
  forwarded_from_name?: string | null;
  forwarded_from_chat_id?: string | null;
  forwarded_from_sender_id?: string | null;
}
