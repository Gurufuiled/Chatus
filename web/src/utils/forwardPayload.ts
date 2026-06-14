import type { MappedMessage } from '@/types/message';

export interface ForwardMetadata {
  messageId?: string | null;
  name?: string | null;
  chatId?: string | null;
  senderId?: string | null;
}

export interface ForwardWsPayload {
  content: string | null;
  msg_type: string;
  forwarded_from_message_id: string | null;
  forwarded_from_name: string | null;
  forwarded_from_chat_id: string | null;
  forwarded_from_sender_id: string | null;
  media?: Record<string, unknown>;
}

export function buildForwardPayload(
  message: MappedMessage,
  forwardedFrom?: ForwardMetadata,
): ForwardWsPayload | null {
  if (message.is_deleted) return null;

  const media = message.media?.[0];
  const remoteUrl = media?.remote_url ?? null;
  const forwardedFromMessageId =
    forwardedFrom?.messageId ?? message.forwarded_from_message_id ?? message.id;
  const forwardedFromName =
    forwardedFrom?.name ?? message.forwarded_from_name ?? message.sender_name ?? null;
  const forwardedFromChatId =
    forwardedFrom?.chatId ?? message.forwarded_from_chat_id ?? message.chat_id;
  const forwardedFromSenderId =
    forwardedFrom?.senderId ?? message.forwarded_from_sender_id ?? message.sender_id;

  switch (message.msg_type) {
    case 'text':
      return {
        content: message.content ?? '',
        msg_type: 'text',
        forwarded_from_message_id: forwardedFromMessageId,
        forwarded_from_name: forwardedFromName,
        forwarded_from_chat_id: forwardedFromChatId,
        forwarded_from_sender_id: forwardedFromSenderId,
      };
    case 'image':
      if (!remoteUrl) return null;
      return {
        content: message.content ?? null,
        msg_type: 'image',
        forwarded_from_message_id: forwardedFromMessageId,
        forwarded_from_name: forwardedFromName,
        forwarded_from_chat_id: forwardedFromChatId,
        forwarded_from_sender_id: forwardedFromSenderId,
        media: {
          url: remoteUrl,
          width: media?.width ?? undefined,
          height: media?.height ?? undefined,
        },
      };
    case 'voice':
      if (!remoteUrl) return null;
      return {
        content: remoteUrl,
        msg_type: 'voice',
        forwarded_from_message_id: forwardedFromMessageId,
        forwarded_from_name: forwardedFromName,
        forwarded_from_chat_id: forwardedFromChatId,
        forwarded_from_sender_id: forwardedFromSenderId,
        media: {
          url: remoteUrl,
          duration_ms: media?.duration_ms ?? undefined,
          waveform: media?.waveform ?? undefined,
        },
      };
    case 'video':
      if (!remoteUrl) return null;
      return {
        content: message.content ?? null,
        msg_type: 'video',
        forwarded_from_message_id: forwardedFromMessageId,
        forwarded_from_name: forwardedFromName,
        forwarded_from_chat_id: forwardedFromChatId,
        forwarded_from_sender_id: forwardedFromSenderId,
        media: {
          url: remoteUrl,
          width: media?.width ?? undefined,
          height: media?.height ?? undefined,
          duration_ms: media?.duration_ms ?? undefined,
          thumbnail_url: media?.thumbnail_url ?? undefined,
          file_name: media?.file_name ?? undefined,
          file_size: media?.file_size ?? undefined,
        },
      };
    case 'file':
      if (!remoteUrl) return null;
      return {
        content: message.content ?? remoteUrl,
        msg_type: 'file',
        forwarded_from_message_id: forwardedFromMessageId,
        forwarded_from_name: forwardedFromName,
        forwarded_from_chat_id: forwardedFromChatId,
        forwarded_from_sender_id: forwardedFromSenderId,
        media: {
          url: remoteUrl,
          file_name: media?.file_name ?? undefined,
          file_size: media?.file_size ?? undefined,
          mime_type: media?.mime_type ?? undefined,
        },
      };
    default:
      return null;
  }
}

export function canForwardMessage(message: MappedMessage): boolean {
  return buildForwardPayload(message) != null;
}
