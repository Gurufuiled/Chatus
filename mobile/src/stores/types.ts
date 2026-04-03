/**
 * Store types - camelCase for UI layer.
 * Maps from db/types (snake_case) when needed.
 */

import type { UserRow, ChatRow, MessageRow } from '../db/types';

export type User = UserRow;

export type Chat = ChatRow;

export type Message = MessageRow & {
  forwarded_from_message_id?: string | null;
  forwarded_from_name?: string | null;
  forwarded_from_chat_id?: string | null;
  forwarded_from_sender_id?: string | null;
  /** Optional media for display (e.g. voice waveform, duration, video_note, image, file). */
  media?: {
    waveform?: number[];
    duration_ms?: number;
    thumbnail_url?: string;
    thumbnail_path?: string;
    is_round?: boolean;
    is_viewed?: boolean | number;
    /** Image: width/height for aspect ratio. */
    width?: number;
    height?: number;
    /** File: display name and size. */
    file_name?: string;
    file_size?: number;
    remote_url?: string;
  }[];
};
