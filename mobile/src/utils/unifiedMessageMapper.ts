import type { Message } from '../stores/types';
import type { TelegramMessageRow } from '../screens/telegramChat/types';
import type { UnifiedMessage, UnifiedMessageType } from '../types/unifiedMessage';

export function chatusToUnified(msg: Message, currentUserId: string): UnifiedMessage {
  const isMe = msg.sender_id === currentUserId;
  const status = msg.status === 'read' || msg.status === 'sent' || msg.status === 'sending' || msg.status === 'failed'
    ? msg.status
    : 'sent';

  let msgType: UnifiedMessageType = 'text';
  if (msg.msg_type === 'image') msgType = 'image';
  else if (msg.msg_type === 'video') msgType = 'video';
  else if (msg.msg_type === 'voice') msgType = 'voice';
  else if (msg.msg_type === 'video_note') msgType = 'video_note';
  else if (msg.msg_type === 'file') msgType = 'file';
  else if (msg.msg_type === 'sticker') msgType = 'sticker';
  else if (msg.msg_type !== 'text') msgType = 'unsupported';

  const firstMedia = msg.media && msg.media.length > 0 ? msg.media[0] : null;

  return {
    id: `chatus_${msg.id}`,
    source: 'chatus',
    originalId: msg.id,
    msgType,
    content: msg.content,
    senderId: msg.sender_id,
    senderName: msg.sender_name,
    senderAvatarUrl: msg.sender_avatar_url,
    isMe,
    status: status as any,
    timestamp: msg.created_at,
    viewCount: msg.view_count || undefined,
    mediaUri: firstMedia?.remote_url || firstMedia?.local_path || undefined,
    thumbnailUri: firstMedia?.thumbnail_url || firstMedia?.thumbnail_path || undefined,
    durationMs: firstMedia?.duration_ms,
    waveform: firstMedia?.waveform,
    width: firstMedia?.width,
    height: firstMedia?.height,
    fileName: firstMedia?.file_name,
    fileSize: firstMedia?.file_size,
    mimeType: firstMedia?.mime_type,
    replyToId: msg.reply_to_id,
    reactions: msg.reactions?.map(r => ({ emoji: r.emoji, count: r.count, reacted_by_me: r.reacted_by_me })),
    _chatusOriginal: msg,
  };
}

export function telegramToUnified(msg: TelegramMessageRow, currentUserId: string): UnifiedMessage {
  const isMe = msg.outgoing;

  let msgType: UnifiedMessageType = 'text';
  if (msg.kind === 'image') msgType = 'image';
  else if (msg.kind === 'video') msgType = 'video';
  else if (msg.kind === 'voice') msgType = 'voice';
  else if (msg.kind === 'video_note') msgType = 'video_note';
  else if (msg.kind === 'file') msgType = 'file';
  else if (msg.kind === 'album') msgType = 'album';
  else if (msg.kind !== 'text' && msg.kind !== 'service') msgType = 'unsupported';

  let status: 'sending' | 'sent' | 'read' | 'failed' = 'sent';
  if (msg.status === 'read' || msg.status === 'sending' || msg.status === 'failed') {
    status = msg.status;
  }

  let albumMedia;
  if (msgType === 'album' && msg.albumMedia) {
    albumMedia = msg.albumMedia.map(am => ({
      uri: am.mediaUri || '',
      type: am.kind,
      thumbnailUri: am.thumbnailUri || undefined,
      durationMs: am.durationMs,
      width: am.width,
      height: am.height
    })) as UnifiedMessage['albumMedia'];
  }

  return {
    id: `telegram_${msg.messageId}`,
    source: 'telegram',
    originalId: String(msg.messageId),
    msgType,
    content: msg.text || null,
    senderId: msg.senderUserId ? String(msg.senderUserId) : (isMe ? currentUserId : 'telegram_peer'),
    senderName: msg.senderName,
    senderAvatarUrl: msg.senderAvatarUri,
    isMe,
    status,
    timestamp: msg.dateMs,
    viewCount: msg.viewCount || undefined,
    mediaUri: msg.mediaUri || msg.voiceUri || undefined,
    thumbnailUri: msg.thumbnailUri || undefined,
    durationMs: msg.durationMs,
    waveform: msg.waveform || undefined,
    width: msg.width,
    height: msg.height,
    fileName: msg.fileName || undefined,
    fileSize: msg.fileSize,
    replyToId: msg.replyToMessageId ? String(msg.replyToMessageId) : null,
    albumMedia,
    _telegramOriginal: msg,
  };
}

export function mergeTimeline(
  chatusMessages: Message[],
  telegramMessages: TelegramMessageRow[],
  currentUserId: string,
): UnifiedMessage[] {
  const unifiedChatus = chatusMessages.map(m => chatusToUnified(m, currentUserId));
  const unifiedTelegram = telegramMessages.map(m => telegramToUnified(m, currentUserId));

  // Merge and sort descending by timestamp (newest first for inverted FlatList)
  return [...unifiedChatus, ...unifiedTelegram].sort((a, b) => b.timestamp - a.timestamp);
}
