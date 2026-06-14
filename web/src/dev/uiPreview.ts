import type { AuthUser } from '@/types/auth';
import type { ChatSummary } from '@/types/chat';
import type { MappedMessage } from '@/types/message';
import { setAccessToken } from '@/services/apiClient';
import { useAuthUiStore } from '@/stores/authUiStore';

export const UI_PREVIEW_CHAT_IDS = {
  anna: 'preview-chat-anna',
  dmitry: 'preview-chat-dmitry',
} as const;

const now = Date.now();
const ME_ID = 'preview-user-me';

export const MOCK_USER: AuthUser = {
  id: ME_ID,
  loginus_id: 'preview-loginus-id',
  username: 'Reckyrsiv',
  handle: 'Reckyrsiv',
  display_name: 'Артём',
  last_name: null,
  avatar_url: null,
  phone: '+7 988 477 1720',
  bio: null,
  birthday: null,
  is_online: true,
  last_seen: now - 10 * 60 * 1000,
  created_at: now - 86400000,
  updated_at: now,
};

const previewMessages: Record<string, MappedMessage[]> = {
  [UI_PREVIEW_CHAT_IDS.anna]: [
    {
      id: 'preview-msg-1',
      chat_id: UI_PREVIEW_CHAT_IDS.anna,
      sender_id: 'preview-user-anna',
      sender_name: 'Евусик',
      msg_type: 'text',
      content: 'в 2',
      reply_to_id: null,
      is_deleted: false,
      status: 'read',
      created_at: now - 3600000,
      updated_at: now - 3600000,
    },
    {
      id: 'preview-msg-2',
      chat_id: UI_PREVIEW_CHAT_IDS.anna,
      sender_id: ME_ID,
      sender_name: 'Артём',
      msg_type: 'text',
      content: 'оке',
      reply_to_id: null,
      is_deleted: false,
      status: 'read',
      created_at: now - 3500000,
      updated_at: now - 3500000,
    },
  ],
  [UI_PREVIEW_CHAT_IDS.dmitry]: [
    {
      id: 'preview-msg-3',
      chat_id: UI_PREVIEW_CHAT_IDS.dmitry,
      sender_id: 'preview-user-dmitry',
      sender_name: 'Добрый Татарин',
      msg_type: 'text',
      content: 'Привет!',
      reply_to_id: null,
      is_deleted: false,
      status: 'delivered',
      created_at: now - 7200000,
      updated_at: now - 7200000,
    },
  ],
};

export function isUiPreviewMode(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_UI_PREVIEW === 'true';
}

export function activateUiPreview(): void {
  setAccessToken('ui-preview-token');
  const store = useAuthUiStore.getState();
  store.setAccessToken('ui-preview-token');
  store.setUser(MOCK_USER);
  store.setEmbedStatus('ready');
}

export function getPreviewChats(): ChatSummary[] {
  return [
    {
      id: UI_PREVIEW_CHAT_IDS.dmitry,
      chat_type: 'private',
      name: null,
      peer_display_name: 'Добрый Татарин',
      avatar_url: null,
      last_message_id: 'preview-msg-3',
      last_message_at: now - 7200000,
      last_message_preview: 'Привет!',
      unread_count: 0,
      is_muted: false,
      is_pinned: true,
      is_archived: false,
      draft: null,
      created_at: now - 86400000,
      updated_at: now - 7200000,
    },
    {
      id: UI_PREVIEW_CHAT_IDS.anna,
      chat_type: 'private',
      name: null,
      peer_display_name: 'Евусик',
      avatar_url: null,
      last_message_id: 'preview-msg-2',
      last_message_at: now - 3500000,
      last_message_preview: 'оке',
      unread_count: 2,
      is_muted: false,
      is_pinned: false,
      is_archived: false,
      draft: null,
      created_at: now - 86400000,
      updated_at: now - 3500000,
    },
    {
      id: 'preview-chat-muted',
      chat_type: 'private',
      name: null,
      peer_display_name: 'Топор Live',
      avatar_url: null,
      last_message_id: null,
      last_message_at: now - 86400000,
      last_message_preview: 'Video',
      unread_count: 626,
      is_muted: true,
      is_pinned: false,
      is_archived: false,
      draft: null,
      created_at: now - 86400000,
      updated_at: now - 86400000,
    },
  ];
}

export function getPreviewMessages(chatId: string): MappedMessage[] {
  return [...(previewMessages[chatId] ?? [])];
}

export function appendPreviewTextMessage(
  chatId: string,
  text: string,
  replyToId?: string | null,
): MappedMessage {
  const msg: MappedMessage = {
    id: `preview-temp-${Date.now()}`,
    chat_id: chatId,
    sender_id: ME_ID,
    sender_name: MOCK_USER.display_name,
    msg_type: 'text',
    content: text,
    reply_to_id: replyToId ?? null,
    is_deleted: false,
    status: 'sent',
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  if (!previewMessages[chatId]) previewMessages[chatId] = [];
  previewMessages[chatId].push(msg);
  return msg;
}
