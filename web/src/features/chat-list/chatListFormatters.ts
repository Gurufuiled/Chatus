import type { ChatSummary } from '@/types/chat';
import type { MappedMessage } from '@/types/message';
import { groupCallSystemPreviewText } from '@/utils/groupCallSystemMessage';
import { isChatusStickerMessage } from '@/utils/stickerPayload';

export function getChatDisplayName(chat: ChatSummary): string {
  if (chat.chat_type === 'private') {
    return chat.peer_display_name ?? chat.name ?? 'Unknown';
  }
  return chat.name ?? 'Group';
}

export function formatChatTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const isThisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
}

export function formatMessagePreview(
  preview: string | null,
  lastMessage?: MappedMessage,
): string {
  if (lastMessage?.is_deleted) return 'Deleted message';
  if (preview?.trim()) {
    const trimmed = preview.trim();
    if (isChatusStickerMessage(trimmed)) return 'Sticker';
    return trimmed;
  }

  if (lastMessage?.msg_type === 'text' && isChatusStickerMessage(lastMessage.content)) {
    return 'Sticker';
  }

  if (lastMessage?.msg_type === 'system') {
    return groupCallSystemPreviewText(lastMessage.content) ?? 'Системное сообщение';
  }

  switch (lastMessage?.msg_type) {
    case 'image':
      return 'Photo';
    case 'voice':
      return 'Voice message';
    case 'video':
    case 'video_note':
      return 'Video';
    case 'file':
      return 'File';
    case 'sticker':
      return 'Sticker';
    default:
      return lastMessage?.content?.trim() || 'No messages yet';
  }
}
