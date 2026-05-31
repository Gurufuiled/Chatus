/**
 * Store types - camelCase for UI layer.
 * Maps from db/types (snake_case) when needed.
 */

import type { UserRow, ChatRow, MessageRow } from '../db/types';

export type User = UserRow;

export type Chat = ChatRow;

export type MessageSource = 'chatus' | 'telegram';

export type Message = MessageRow & {
  source?: MessageSource;
  sender_name?: string | null;
  sender_avatar_url?: string | null;
  forwarded_from_message_id?: string | null;
  forwarded_from_name?: string | null;
  forwarded_from_chat_id?: string | null;
  forwarded_from_sender_id?: string | null;
  /** Optional media for display (e.g. voice waveform, duration, video_note, image, file). */
  media?: {
    media_type?: string;
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
    mime_type?: string;
    remote_url?: string;
    local_path?: string;
  }[];
  reactions?: {
    emoji: string;
    count: number;
    reacted_by_me: boolean;
    reactors?: { user_id: string; avatar_url: string | null }[];
  }[];
  /**
   * Только в памяти UI: исходящий стикер отправлен с **пустым** композером (как в Telegram —
   * лёгкий вход без анимации, если в поле уже был черновик текста). Не в БД / не с сервера.
   */
  chatus_sticker_solo_send?: boolean;
};
