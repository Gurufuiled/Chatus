import type { ChatSummary } from '@/types/chat';
import { isChannelPreviewRequired } from './channelUtils';

export function getChatOpenPath(
  chat: ChatSummary,
  _currentUserId: string | null,
): { to: '/chat/$chatId' | '/channel/$channelId'; params: { chatId: string } | { channelId: string } } {
  if (chat.chat_type === 'channel') {
    return { to: '/channel/$channelId', params: { channelId: chat.id } };
  }
  return { to: '/chat/$chatId', params: { chatId: chat.id } };
}

export function needsChannelSubscribeGate(
  chat: ChatSummary,
  currentUserId: string | null,
): boolean {
  return isChannelPreviewRequired(chat, currentUserId);
}
