import React from 'react';
import { Dimensions } from 'react-native';
import { colors } from '../theme/colors';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import type { Message } from '../stores/types';
import { ChatWallpaper } from '../theme/chatThemes';

export const EMPTY_MESSAGES: Message[] = [];
export const SCREEN_WIDTH = Dimensions.get('window').width;
export const SCREEN_HEIGHT = Dimensions.get('window').height;
export const MENU_WIDTH = Math.min(202, SCREEN_WIDTH - 24);
export const MENU_ITEM_HEIGHT = 39;
export const MENU_ACTION_COUNT = 6;
export const MENU_ITEM_BORDER_WIDTH = 1;
export const MENU_HEIGHT =
  MENU_ITEM_HEIGHT * MENU_ACTION_COUNT +
  MENU_ITEM_BORDER_WIDTH * (MENU_ACTION_COUNT - 1);
export const MENU_EDGE_GAP = 12;
export const MENU_TO_MESSAGE_GAP = 6;
export const OVERLAY_TOP_INSET = 86;
export const OVERLAY_BOTTOM_INSET = 110;
export const REPLIED_VOICE_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 290);
const GROUP_AUTHOR_COLORS = ['#8B5CF6', '#EC4899', '#F97316', '#0EA5E9', '#10B981', '#EAB308'];

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatPlaybackRate(rate: number): string {
  const normalized = Math.abs(rate - Math.round(rate)) < 0.001 ? Math.round(rate).toString() : rate.toFixed(1);
  return `${normalized}x`;
}

function getPeerName(chatId: string, currentUserId: string | null): string | null {
  const chat = chatStore.getState().chats.find((item) => item.id === chatId);
  if (!chat) return null;
  if (chat.peer_display_name?.trim()) return chat.peer_display_name.trim();
  if (chat.name?.trim()) return chat.name.trim();
  if (chat.chat_type === 'private' && currentUserId) {
    const peerId = chat.members?.find((member) => member.user_id !== currentUserId)?.user_id;
    if (peerId) return peerId;
  }
  return null;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickGroupAuthorColor(seed: string): string {
  return GROUP_AUTHOR_COLORS[hashString(seed) % GROUP_AUTHOR_COLORS.length] ?? colors.accent;
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function getMessageAuthorPresentation(
  message: Message,
  chatId: string,
  currentUserId: string | null
): { name: string; avatarUrl: string | null; color: string; initial: string } {
  if (message.sender_id === currentUserId) {
    const me =
      authStore.getState().user?.display_name?.trim() ||
      authStore.getState().user?.username?.trim();
    const name = me || 'You';
    return {
      name,
      avatarUrl: authStore.getState().user?.avatar_url ?? null,
      color: colors.accent,
      initial: getInitial(name),
    };
  }

  const chat = chatStore.getState().chats.find((item) => item.id === chatId);
  if (chat?.chat_type === 'group') {
    const member = chat.members?.find((item) => item.user_id === message.sender_id);
    const name =
      member?.user?.display_name?.trim() ||
      member?.user?.username?.trim() ||
      member?.user?.handle?.trim() ||
      message.sender_id?.trim() ||
      'Participant';
    return {
      name,
      avatarUrl: member?.user?.avatar_url ?? null,
      color: pickGroupAuthorColor(member?.user_id ?? message.sender_id),
      initial: getInitial(name),
    };
  }

  const name = getPeerName(chatId, currentUserId) || 'Companion';
  return {
    name,
    avatarUrl: chat?.avatar_url ?? null,
    color: colors.accent,
    initial: getInitial(name),
  };
}

export function getMessageAuthorName(message: Message, chatId: string, currentUserId: string | null): string {
  return getMessageAuthorPresentation(message, chatId, currentUserId).name;
}

export function getDeletedPlaceholder(isMe: boolean): string {
  return isMe ? 'You deleted this message' : 'Message deleted';
}

export function getCopyableContent(message: Message): string {
  if (message.is_deleted) return '';
  if (message.msg_type === 'text') return message.content?.trim() ?? '';
  if (message.msg_type === 'image') return message.content?.trim() || message.media?.[0]?.remote_url || '';
  if (message.msg_type === 'video') return message.content?.trim() || 'Video';
  if (message.msg_type === 'file') {
    return message.media?.[0]?.file_name?.trim() || message.media?.[0]?.remote_url || '';
  }
  if (message.msg_type === 'voice') return 'Voice message';
  if (message.msg_type === 'video_note') return 'Video note';
  return message.content?.trim() ?? '';
}

export function ChatBackgroundPattern({ themeId }: { themeId?: string | null }) {
  return <ChatWallpaper themeId={themeId} />;
}
