import { apiRequest } from './apiClient';
import type { MappedMessage, MessageType } from '@/types/message';
import { encodeStickerPayload } from '@/utils/stickerPayload';
import {
  appendPreviewTextMessage,
  getPreviewMessages,
  isUiPreviewMode,
} from '@/dev/uiPreview';

export interface MessageMediaInput {
  url?: string;
  media_type?: string;
  mime_type?: string;
  file_name?: string;
  file_size?: number;
  sha256?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  thumbnail_url?: string;
  waveform?: number[];
}

export interface SendMessageBase {
  chatId: string;
  replyToId?: string | null;
  clientTempId?: string;
}

export async function listMessages(
  chatId: string,
  options?: { limit?: number; before?: string },
): Promise<MappedMessage[]> {
  if (isUiPreviewMode()) return getPreviewMessages(chatId);
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.before) params.set('before', options.before);
  const query = params.toString();
  const path = `/chats/${encodeURIComponent(chatId)}/messages${query ? `?${query}` : ''}`;
  return apiRequest<MappedMessage[]>(path);
}

export interface SendTextMessageInput extends SendMessageBase {
  text: string;
}

export async function sendTextMessage({
  chatId,
  text,
  replyToId,
  clientTempId,
}: SendTextMessageInput): Promise<MappedMessage> {
  if (isUiPreviewMode()) {
    return appendPreviewTextMessage(chatId, text, replyToId);
  }
  return apiRequest<MappedMessage>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: text,
      msg_type: 'text',
      reply_to_id: replyToId ?? undefined,
      client_temp_id: clientTempId,
    }),
  });
}

export interface SendStickerMessageInput extends SendMessageBase {
  packId: string;
  stickerId: string;
}

export async function sendStickerMessage({
  chatId,
  packId,
  stickerId,
  replyToId,
  clientTempId,
}: SendStickerMessageInput): Promise<MappedMessage> {
  return apiRequest<MappedMessage>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: encodeStickerPayload({ packId, stickerId }),
      msg_type: 'text',
      reply_to_id: replyToId ?? undefined,
      client_temp_id: clientTempId,
    }),
  });
}

export interface SendMediaMessageInput extends SendMessageBase {
  msgType: MessageType;
  media: MessageMediaInput | MessageMediaInput[];
  content?: string | null;
}

export async function sendMediaMessage({
  chatId,
  msgType,
  media,
  content,
  replyToId,
  clientTempId,
}: SendMediaMessageInput): Promise<MappedMessage> {
  return apiRequest<MappedMessage>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: content ?? undefined,
      msg_type: msgType,
      media,
      reply_to_id: replyToId ?? undefined,
      client_temp_id: clientTempId,
    }),
  });
}

export async function markChatRead(chatId: string): Promise<void> {
  if (isUiPreviewMode()) return;
  await apiRequest(`/chats/${encodeURIComponent(chatId)}/read`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
