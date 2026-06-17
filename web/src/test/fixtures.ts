import type { ChatSummary } from '@/types/chat';
import type { MappedMessage, MappedMedia } from '@/types/message';

export function makeMedia(overrides: Partial<MappedMedia> = {}): MappedMedia {
  return {
    id: 'media-1',
    message_id: 'msg-1',
    media_type: 'image',
    file_name: 'photo.jpg',
    mime_type: 'image/jpeg',
    file_size: 1024,
    width: 800,
    height: 600,
    duration_ms: null,
    remote_url: '/uploads/photo.jpg',
    thumbnail_url: null,
    waveform: null,
    is_round: false,
    created_at: Date.now(),
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<MappedMessage> = {}): MappedMessage {
  return {
    id: 'msg-1',
    chat_id: 'chat-1',
    sender_id: 'user-1',
    sender_name: 'Alice',
    msg_type: 'text',
    content: 'Hello',
    reply_to_id: null,
    is_deleted: false,
    status: 'sent',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

export function makeChat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: 'chat-1',
    chat_type: 'private',
    name: null,
    peer_display_name: 'Bob',
    avatar_url: null,
    last_message_id: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count: 0,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    draft: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}
