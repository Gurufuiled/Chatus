import type { MappedMessage } from '@/types/message';
import { groupCallSystemPreviewText } from '@/utils/groupCallSystemMessage';
import { isChatusStickerMessage } from '@/utils/stickerPayload';

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function isTempMessageId(id: string): boolean {
  return id.startsWith('temp-');
}

export function getMessageStatusRank(status: string): number {
  switch (status) {
    case 'failed':
    case 'error':
      return -1;
    case 'sending':
      return 0;
    case 'sent':
      return 1;
    case 'delivered':
      return 2;
    case 'read':
      return 3;
    default:
      return 0;
  }
}

export function getOutgoingMessagePreview(
  message: Pick<MappedMessage, 'msg_type' | 'content'>,
): string {
  if (message.msg_type === 'system') {
    return groupCallSystemPreviewText(message.content) ?? 'Системное сообщение';
  }
  if (message.msg_type === 'image') return 'Photo';
  if (message.msg_type === 'voice') return 'Voice message';
  if (message.msg_type === 'video' || message.msg_type === 'video_note') return 'Video';
  if (message.msg_type === 'poll') return 'Опрос';
  if (message.msg_type === 'file') {
    return message.content?.trim() || 'File';
  }
  const text = message.content?.trim() ?? '';
  if (text && isChatusStickerMessage(text)) return 'Sticker';
  return text;
}
