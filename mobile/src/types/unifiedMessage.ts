import type { Message, MessageSource } from '../stores/types';
import type { TelegramMessageRow } from '../screens/telegramChat/types';

export type UnifiedMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'video_note'
  | 'file'
  | 'album'
  | 'sticker'
  | 'unsupported';

export interface UnifiedMessage {
  /** Unique ID in the context of the unified chat. (e.g. prefix + originalId) */
  id: string;

  /** Platform source */
  source: MessageSource;

  /** The native original ID (UUID string for Chatus, stringified number/int for Telegram) */
  originalId: string;

  /** Normalized type */
  msgType: UnifiedMessageType;

  /** Text content or caption */
  content: string | null;

  /** Sender info */
  senderId: string;
  senderName?: string | null;
  senderAvatarUrl?: string | null;

  /** True if sent by the current user */
  isMe: boolean;

  /** Normalized status */
  status: 'sending' | 'sent' | 'read' | 'failed';

  /** Timestamp in milliseconds */
  timestamp: number;

  /** View count if applicable */
  viewCount?: number;

  /** Media details */
  mediaUri?: string | null;
  thumbnailUri?: string | null;
  durationMs?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;

  /** Reply context */
  replyToId?: string | null;

  /** Extracted reactions */
  reactions?: Array<{ emoji: string; count: number; reacted_by_me: boolean }>;

  /** Album specific data (Telegram) */
  albumMedia?: Array<{ uri: string; type: 'image' | 'video'; thumbnailUri?: string; durationMs?: number; width?: number; height?: number }>;

  /** Keep the original row data for specialized renders or forwarding */
  _chatusOriginal?: Message;
  _telegramOriginal?: TelegramMessageRow;
}
