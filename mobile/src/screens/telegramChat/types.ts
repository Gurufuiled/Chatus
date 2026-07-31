export type TelegramMessageKind =
  | 'text'
  | 'voice'
  | 'video_note'
  | 'image'
  | 'video'
  | 'file'
  | 'album'
  | 'service';

export type TelegramMessageStatus = 'sending' | 'sent' | 'read' | 'failed';

/** One tile in a grouped photo/video album (TDLib `media_album_id`). */
export type TelegramAlbumMediaItem = {
  messageId: number;
  kind: 'image' | 'video';
  mediaUri?: string | null;
  thumbnailUri?: string | null;
  /** TDLib file id for media still downloading (`updateFile` will refresh `mediaUri`). */
  mediaFullFileId?: number;
  /** TDLib preview file id; full video is downloaded only after a tap. */
  thumbnailFileId?: number;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type TelegramWebPagePreview = {
  url: string;
  siteName?: string;
  title?: string;
  description?: string;
  photoUri?: string | null;
  photoWidth?: number;
  photoHeight?: number;
  /** Full preview photo still downloading. */
  photoFileId?: number;
};

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
  /** TDLib file id for media still downloading while the row already renders as media. */
  mediaFullFileId?: number;
  /** TDLib preview file id; patched independently from the full media file. */
  thumbnailFileId?: number;
  thumbnailUri?: string | null;
  durationMs?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  fileName?: string;
  fileSize?: number;
  /** TDLib `media_album_id` for photo/video rows before collapse. */
  mediaAlbumId?: number;
  /** Collapsed album tiles (kind === `album`). */
  albumMedia?: TelegramAlbumMediaItem[];
  /** All TDLib message ids in the album (forward / delete). */
  albumMessageIds?: number[];
  /** Display name of the sender – populated for incoming messages in group/supergroup chats. */
  senderName?: string | null;
  /** TDLib user id for incoming messages from `messageSenderUser` (groups / supergroups). */
  senderUserId?: number;
  /** Resolved profile photo URI for the sender when `loadSenderAvatar` was used while mapping. */
  senderAvatarUri?: string | null;
  /** TDLib profile photo file id pending download (`updateFile` patches `senderAvatarUri`). */
  senderAvatarFileId?: number;
  /** Post view count from TDLib `interaction_info.view_count` (channel posts). */
  viewCount?: number;
  /** Linked discussion chat id from TDLib `reply_in_chat_id` when present; иначе экран подставляет `linked_chat_id` канала из `getSupergroupFullInfo`. */
  discussionChatId?: number;
  /** Thread id for discussion messages (`message_thread_id`). */
  messageThreadId?: number;
  /** Approximate comment count from `interaction_info.reply_info.reply_count`. */
  discussionReplyCount?: number;
  /** Rich web page preview parsed from messageText */
  webPagePreview?: TelegramWebPagePreview | null;
  /** Info about the forwarded origin if the message was forwarded. */
  forwardInfo?: {
    senderName: string;
    avatarUri: string | null;
    avatarFileId?: number;
  } | null;
  reactions?: {
    emoji: string;
    count: number;
    reacted_by_me: boolean;
  }[];
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
  /** Полная высота пузыря в ленте (до обрезки под экран). */
  previewNaturalHeight: number;
  /** С какого края показывать обрезанное превью (по умолчанию низ). */
  previewVerticalAlign?: 'top' | 'bottom';
} | null;
