export type TelegramMessageKind = 'text' | 'voice' | 'image' | 'video' | 'file' | 'service';
export type TelegramMessageStatus = 'sending' | 'sent' | 'read' | 'failed';

export type TelegramMessageRow = {
  id: string;
  messageId: number;
  kind: TelegramMessageKind;
  text: string;
  outgoing: boolean;
  dateMs: number;
  status: TelegramMessageStatus;
  replyToMessageId?: number | null;
  voiceUri?: string | null;
  mediaUri?: string | null;
  thumbnailUri?: string | null;
  durationMs?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  fileName?: string;
  fileSize?: number;
  /** Display name of the sender – populated for incoming messages in group/supergroup chats. */
  senderName?: string | null;
  /** Post view count from TDLib `interaction_info.view_count` (channel posts). */
  viewCount?: number;
};

/** Same layout contract as `ChatScreen` context menu — drives `ChatContextMenuOverlay`. */
export type TelegramMessageMenuState = {
  messageId: string;
  isMe: boolean;
  previewTop: number;
  previewLeft: number;
  previewWidth: number;
  previewHeight: number;
  menuTop: number;
  menuLeft: number;
  placement: 'above' | 'below';
} | null;
