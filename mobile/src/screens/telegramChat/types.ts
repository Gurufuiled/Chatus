export type TelegramMessageKind =
  | 'text'
  | 'voice'
  | 'video_note'
  | 'image'
  | 'video'
  | 'file'
  | 'service';
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
  /** TDLib user id for incoming messages from `messageSenderUser` (groups / supergroups). */
  senderUserId?: number;
  /** Resolved profile photo URI for the sender when `loadSenderAvatar` was used while mapping. */
  senderAvatarUri?: string | null;
  /** Post view count from TDLib `interaction_info.view_count` (channel posts). */
  viewCount?: number;
  /** Linked discussion chat id from TDLib `reply_in_chat_id` when present; иначе экран подставляет `linked_chat_id` канала из `getSupergroupFullInfo`. */
  discussionChatId?: number;
  /** Thread id for discussion messages (`message_thread_id`). */
  messageThreadId?: number;
  /** Approximate comment count from `interaction_info.reply_info.reply_count`. */
  discussionReplyCount?: number;
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
