/**
 * SyncService - processes sync queue and performs full sync on WebSocket connect.
 * Runs processSyncQueue (retry queued actions) then fullSync (fetch chats + messages).
 */

import { SyncQueueDao } from '../db';
import { WebSocketService } from './WebSocketService';
import { apiGet, apiUpload, apiUploadVoice } from './apiClient';
import { API_BASE_URL, resolveMediaUrl } from '../config';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import { authStore } from '../stores/authStore';
import { uiStore } from '../stores/uiStore';
import type { Chat, Message } from '../stores/types';
import { decodeServerWaveform } from './waveformTransport';

const MAX_RETRIES = 5;

function getUploadBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/?$/, '') || API_BASE_URL;
}

/** Returns url as-is if absolute (http/https), else baseUrl + url. */
function toFullUrl(baseUrl: string, url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function getSafeFileContent(content: string | null | undefined, fileName?: string | null): string | null {
  const normalizedFileName = fileName?.trim();
  if (normalizedFileName) return normalizedFileName;

  const normalizedContent = content?.trim();
  if (!normalizedContent) return null;
  if (/^https?:\/\//i.test(normalizedContent) || normalizedContent.startsWith('/uploads/')) {
    return null;
  }

  return normalizedContent;
}

function isUploadTooLargeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /payload too large|file too large|statusCode\":413|upload failed: 413/i.test(message);
}

function markQueuedMessageFailed(
  payload: unknown,
  entityId: string | null | undefined,
): void {
  const maybePayload = payload as { chatId?: string; tempId?: string } | null;
  const chatId = maybePayload?.chatId;
  const tempId = maybePayload?.tempId ?? entityId ?? null;
  if (!chatId || !tempId) return;

  const messages = messageStore.getState().messagesByChatId[chatId] ?? [];
  const optimistic = messages.find((message) => message.id === tempId);
  if (!optimistic) return;

  messageStore.getState().updateMessage(chatId, tempId, {
    status: 'failed',
  });
}

/** API chat response (snake_case from server). */
interface ApiChat {
  id: string;
  chat_type: string;
  name: string | null;
  description?: string | null;
  avatar_url: string | null;
  visibility?: 'public' | 'private';
  access_type?: 'free' | 'paid';
  subscription_price_cents?: number | null;
  subscription_period_days?: number | null;
  linked_discussion_chat_id?: string | null;
  invite_token?: string | null;
  allow_comments?: boolean;
  allow_reactions?: boolean;
  preview_post_count?: number;
  subscriber_count?: number;
  active_subscriber_count?: number;
  access_status?: 'none' | 'pending' | 'active' | 'expired' | 'canceled';
  subscription_expires_at?: number | null;
  pending_earnings_cents?: number;
  available_payout_cents?: number;
  paid_out_cents?: number;
  created_by_id: string;
  last_message_id: string | null;
  pinned_message_id: string | null;
  last_message_at: number | null;
  last_message_preview: string | null;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  draft: string | null;
  created_at: number;
  updated_at: number;
  members?: {
    user_id: string;
    role?: string;
    tag?: string | null;
    tag_color?: string | null;
    joined_at?: number;
    user?: {
      id: string;
      username: string | null;
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
      is_online: boolean;
      last_seen: number | null;
    };
  }[];
  peer_display_name?: string | null;
}

function normalizeApiMember(
  member: NonNullable<ApiChat['members']>[number]
): NonNullable<ApiChat['members']>[number] {
  const loose = member as Record<string, unknown>;
  const tag = member.tag ?? (loose.tag as string | null | undefined) ?? null;
  const tag_color =
    member.tag_color ??
    (loose.tag_color as string | null | undefined) ??
    (loose.tagColor as string | null | undefined) ??
    null;
  return { ...member, tag, tag_color };
}

function mapApiChatToChat(api: ApiChat): Chat {
  return {
    id: api.id,
    chat_type: api.chat_type as 'private' | 'group' | 'channel' | 'discussion',
    name: api.name,
    description: api.description ?? null,
    avatar_url: api.avatar_url,
    visibility: api.visibility ?? 'public',
    access_type: api.access_type ?? 'free',
    subscription_price_cents: api.subscription_price_cents ?? null,
    subscription_period_days: api.subscription_period_days ?? null,
    linked_discussion_chat_id: api.linked_discussion_chat_id ?? null,
    invite_token: api.invite_token ?? null,
    allow_comments: api.allow_comments === false ? 0 : 1,
    allow_reactions: api.allow_reactions === false ? 0 : 1,
    preview_post_count: api.preview_post_count ?? 3,
    subscriber_count: api.subscriber_count ?? 0,
    active_subscriber_count: api.active_subscriber_count ?? 0,
    access_status: api.access_status ?? 'active',
    subscription_expires_at: api.subscription_expires_at ?? null,
    pending_earnings_cents: api.pending_earnings_cents ?? 0,
    available_payout_cents: api.available_payout_cents ?? 0,
    paid_out_cents: api.paid_out_cents ?? 0,
    created_by: api.created_by_id,
    last_message_id: api.last_message_id,
    pinned_message_id: api.pinned_message_id ?? null,
    last_message_at: api.last_message_at,
    last_message_preview: api.last_message_preview,
    unread_count: api.unread_count,
    is_muted: api.is_muted ? 1 : 0,
    is_pinned: api.is_pinned ? 1 : 0,
    is_archived: api.is_archived ? 1 : 0,
    draft: api.draft,
    created_at: api.created_at,
    updated_at: api.updated_at,
    members: api.members?.map(normalizeApiMember),
    peer_display_name: api.peer_display_name ?? null,
  };
}

/** API message response (snake_case from server). */
interface ApiMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  msg_type: string;
  content: string | null;
  reply_to_id?: string | null;
  thread_root_message_id?: string | null;
  is_channel_post?: boolean;
  view_count?: number;
  comment_count?: number;
  forwarded_from_message_id?: string | null;
  forwarded_from_name?: string | null;
  forwarded_from_chat_id?: string | null;
  forwarded_from_sender_id?: string | null;
  is_edited?: number;
  is_deleted?: number;
  status: string;
  transport?: string;
  server_id?: string | null;
  created_at: number | string;
  updated_at?: number | string;
  media?: {
    media_type?: string;
    remote_url?: string;
    duration_ms?: number;
    waveform?: string | null;
    thumbnail_url?: string;
    thumbnail_path?: string;
    is_round?: boolean;
    is_viewed?: boolean;
    width?: number;
    height?: number;
    file_name?: string;
    file_size?: number;
  }[];
  reactions?: { emoji: string; count: number; reacted_by_me: boolean }[];
}

function mapApiMessageToMessage(api: ApiMessage): Message {
  const createdAt =
    typeof api.created_at === 'string'
      ? new Date(api.created_at).getTime()
      : api.created_at;
  const updatedAt =
    api.updated_at != null
      ? typeof api.updated_at === 'string'
        ? new Date(api.updated_at).getTime()
        : api.updated_at
      : createdAt;

  const media =
    api.media?.map((m) => ({
      media_type: m.media_type,
      duration_ms: m.duration_ms ?? 0,
      waveform: decodeServerWaveform(m.waveform),
      thumbnail_url: resolveMediaUrl(m.thumbnail_url) ?? m.thumbnail_url,
      thumbnail_path: m.thumbnail_path,
      is_round: m.is_round,
      is_viewed: m.is_viewed,
      width: m.width,
      height: m.height,
      file_name: m.file_name,
      file_size: m.file_size,
      remote_url: resolveMediaUrl(m.remote_url) ?? m.remote_url,
    })) ?? undefined;

  return {
    id: api.id,
    chat_id: api.chat_id,
    sender_id: api.sender_id,
    msg_type: api.msg_type,
    content: api.content,
    reply_to_id: api.reply_to_id ?? null,
    thread_root_message_id: api.thread_root_message_id ?? null,
    is_channel_post: api.is_channel_post ? 1 : 0,
    view_count: api.view_count ?? 0,
    comment_count: api.comment_count ?? 0,
    forwarded_from_message_id: api.forwarded_from_message_id ?? null,
    forwarded_from_name: api.forwarded_from_name ?? null,
    forwarded_from_chat_id: api.forwarded_from_chat_id ?? null,
    forwarded_from_sender_id: api.forwarded_from_sender_id ?? null,
    is_edited: api.is_edited ?? 0,
    is_deleted: api.is_deleted ?? 0,
    status: api.status,
    transport: api.transport ?? 'ws',
    server_id: api.server_id ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
    media,
    reactions:
      api.reactions?.map((r) => ({
        emoji: r.emoji,
        count: r.count,
        reacted_by_me: r.reacted_by_me,
      })) ?? undefined,
  };
}

type PayloadText = { chatId: string; content: string; msgType: string; tempId: string; replyToId?: string | null };
type PayloadVoice = { chatId: string; uri: string; durationMs: number; waveform?: number[]; tempId: string; replyToId?: string | null };
type PayloadVideoNote = { chatId: string; uri: string; durationMs: number; thumbnailUri?: string; tempId: string; replyToId?: string | null };
type PayloadImage = { chatId: string; uri: string; width?: number; height?: number; fileName?: string; mimeType?: string; caption?: string; tempId: string; replyToId?: string | null };
type PayloadVideo = { chatId: string; uri: string; width?: number; height?: number; durationMs?: number; thumbnailUri?: string; fileName?: string; mimeType?: string; caption?: string; tempId: string; replyToId?: string | null };
type PayloadMediaAlbumItem = { kind: 'image' | 'video'; uri: string; width?: number; height?: number; durationMs?: number; thumbnailUri?: string; fileName?: string; mimeType?: string };
type PayloadMediaAlbum = { chatId: string; items: PayloadMediaAlbumItem[]; caption?: string; tempId: string; replyToId?: string | null };
type PayloadFile = { chatId: string; uri: string; name: string; size: number; mimeType?: string; tempId: string; replyToId?: string | null };
type PayloadDelete = { chatId: string; messageId: string };
type PayloadPin = { chatId: string; messageId: string | null };
type PayloadForward = {
  chatId: string;
  sourceMessage: Message;
  clientTempId?: string | null;
  forwardedFrom?: {
    messageId?: string | null;
    name?: string | null;
    chatId?: string | null;
    senderId?: string | null;
  };
};

async function executeAction(action: string, payload: unknown): Promise<void> {
  const baseUrl = getUploadBaseUrl();
  const ensureWebSocketConnectedForDispatch = (context: string): void => {
    if (!WebSocketService.isConnected()) {
      throw new Error(`[SyncService] WebSocket disconnected before ${context}`);
    }
  };
  const markOptimisticVideoNoteDispatched = (
    chatId: string,
    tempId: string,
    next: {
      remoteUrl: string;
      durationMs?: number;
      thumbnailUrl?: string;
      width?: number;
      height?: number;
      fileName?: string;
      fileSize?: number;
    },
  ): void => {
    const existingMessages = messageStore.getState().messagesByChatId[chatId] ?? [];
    const optimistic = existingMessages.find((message) => message.id === tempId);
    if (!optimistic) return;

    const nextMedia = optimistic.media?.map((item, index) =>
      index === 0
        ? {
            ...item,
            remote_url: next.remoteUrl,
            duration_ms: next.durationMs ?? item.duration_ms,
            thumbnail_url: next.thumbnailUrl ?? item.thumbnail_url,
            width: next.width ?? item.width,
            height: next.height ?? item.height,
            file_name: next.fileName ?? item.file_name,
            file_size: next.fileSize ?? item.file_size,
            is_round: true,
          }
        : item
    );

    messageStore.getState().updateMessage(chatId, tempId, {
      status: 'sent',
      content: next.remoteUrl,
      ...(nextMedia ? { media: nextMedia } : {}),
    });
  };

  switch (action) {
    case 'send_message_text': {
      const p = payload as PayloadText;
      WebSocketService.sendEvent('send_message', {
        chat_id: p.chatId,
        content: p.content,
        msg_type: p.msgType ?? 'text',
        client_temp_id: p.tempId,
        reply_to_id: p.replyToId ?? null,
      });
      return;
    }

    case 'send_message_voice': {
      const p = payload as PayloadVoice;
      const result = await apiUploadVoice({
        uri: p.uri,
        name: 'voice.m4a',
      });
      const fullUrl = toFullUrl(baseUrl, result.url);
      const resolvedDurationMs = result.duration_ms ?? p.durationMs;
      ensureWebSocketConnectedForDispatch('voice message dispatch');
      WebSocketService.sendEvent('send_message', {
        chat_id: p.chatId,
        content: fullUrl,
        msg_type: 'voice',
        client_temp_id: p.tempId,
        reply_to_id: p.replyToId ?? null,
        media: {
          url: fullUrl,
          duration_ms: resolvedDurationMs || undefined,
          waveform:
            p.waveform && p.waveform.length > 0
              ? p.waveform
              : result.waveform && result.waveform.length > 0
                ? result.waveform
                : undefined,
          mime_type: result.mime_type,
          file_name: result.file_name,
          file_size: result.file_size,
        },
      });
      return;
    }

    case 'send_message_video_note': {
      const p = payload as PayloadVideoNote;
      const result = await apiUpload({
        uri: p.uri,
        name: 'video_note.mp4',
        type: 'video/mp4',
      });
      const fullUrl = toFullUrl(baseUrl, result.url);
      const resolvedDurationMs = result.duration_ms ?? p.durationMs;
      const thumbnailUrl = result.thumbnail_path
        ? toFullUrl(baseUrl, result.thumbnail_path)
        : undefined;

      ensureWebSocketConnectedForDispatch('video note dispatch');
      WebSocketService.sendEvent('send_message', {
        chat_id: p.chatId,
        content: fullUrl,
        msg_type: 'video_note',
        client_temp_id: p.tempId,
        reply_to_id: p.replyToId ?? null,
        media: {
          url: fullUrl,
          duration_ms: resolvedDurationMs || undefined,
          thumbnail_url: thumbnailUrl,
          is_round: true,
          mime_type: result.mime_type,
          file_name: result.file_name,
          file_size: result.file_size,
          width: result.width ?? undefined,
          height: result.height ?? undefined,
        },
      });
      markOptimisticVideoNoteDispatched(p.chatId, p.tempId, {
        remoteUrl: fullUrl,
        durationMs: resolvedDurationMs || undefined,
        thumbnailUrl: thumbnailUrl ?? p.thumbnailUri,
        width: result.width ?? undefined,
        height: result.height ?? undefined,
        fileName: result.file_name,
        fileSize: result.file_size,
      });
      return;
    }

    case 'send_message_image': {
      const p = payload as PayloadImage;
      const imageMime = p.mimeType ?? ((p.fileName?.toLowerCase() ?? '').endsWith('.png') ? 'image/png' : 'image/jpeg');
      const imageName = p.fileName ?? (imageMime === 'image/png' ? 'image.png' : 'image.jpg');
      const result = await apiUpload({
        uri: p.uri,
        name: imageName,
        type: imageMime,
      });
      const fullUrl = toFullUrl(baseUrl, result.url);
      ensureWebSocketConnectedForDispatch('image message dispatch');
      WebSocketService.sendEvent('send_message', {
        chat_id: p.chatId,
        content: p.caption ?? null,
        msg_type: 'image',
        client_temp_id: p.tempId,
        reply_to_id: p.replyToId ?? null,
        media: {
          url: fullUrl,
          thumbnail_url: result.thumbnail_path
            ? toFullUrl(baseUrl, result.thumbnail_path)
            : undefined,
          width: p.width ?? result.width ?? undefined,
          height: p.height ?? result.height ?? undefined,
          mime_type: result.mime_type,
          file_name: result.file_name,
          file_size: result.file_size,
        },
      });
      return;
    }

    case 'send_message_video': {
      const p = payload as PayloadVideo;
      const videoMime = p.mimeType ?? 'video/mp4';
      const videoName =
        p.fileName ??
        (videoMime === 'video/quicktime'
          ? 'video.mov'
          : videoMime === 'video/webm'
            ? 'video.webm'
            : 'video.mp4');
      const result = await apiUpload({
        uri: p.uri,
        name: videoName,
        type: videoMime,
      });
      const fullUrl = toFullUrl(baseUrl, result.url);
      const resolvedDurationMs = result.duration_ms ?? p.durationMs;
      ensureWebSocketConnectedForDispatch('video message dispatch');
      WebSocketService.sendEvent('send_message', {
        chat_id: p.chatId,
        content: p.caption ?? null,
        msg_type: 'video',
        client_temp_id: p.tempId,
        reply_to_id: p.replyToId ?? null,
        media: {
          url: fullUrl,
          thumbnail_url: result.thumbnail_path
            ? toFullUrl(baseUrl, result.thumbnail_path)
            : undefined,
          width: p.width ?? result.width ?? undefined,
          height: p.height ?? result.height ?? undefined,
          duration_ms: resolvedDurationMs || undefined,
          mime_type: result.mime_type,
          file_name: result.file_name,
          file_size: result.file_size,
        },
      });
      return;
    }

    case 'send_message_media_album': {
      const p = payload as PayloadMediaAlbum;
      const items = p.items.slice(0, 10);
      const media = await Promise.all(
        items.map(async (item) => {
          const mimeType =
            item.kind === 'video'
              ? item.mimeType ?? 'video/mp4'
              : item.mimeType ?? ((item.fileName?.toLowerCase() ?? '').endsWith('.png') ? 'image/png' : 'image/jpeg');
          const name =
            item.fileName ??
            (item.kind === 'video'
              ? mimeType === 'video/quicktime'
                ? 'video.mov'
                : mimeType === 'video/webm'
                  ? 'video.webm'
                  : 'video.mp4'
              : mimeType === 'image/png'
                ? 'image.png'
                : 'image.jpg');
          const result = await apiUpload({
            uri: item.uri,
            name,
            type: mimeType,
          });
          return {
            media_type: item.kind,
            url: toFullUrl(baseUrl, result.url),
            thumbnail_url: result.thumbnail_path
              ? toFullUrl(baseUrl, result.thumbnail_path)
              : item.thumbnailUri,
            width: item.width ?? result.width ?? undefined,
            height: item.height ?? result.height ?? undefined,
            duration_ms:
              item.kind === 'video'
                ? result.duration_ms ?? item.durationMs ?? undefined
                : undefined,
            mime_type: result.mime_type,
            file_name: result.file_name,
            file_size: result.file_size,
          };
        })
      );
      ensureWebSocketConnectedForDispatch('media album dispatch');
      WebSocketService.sendEvent('send_message', {
        chat_id: p.chatId,
        content: p.caption ?? null,
        msg_type: media[0]?.media_type === 'video' ? 'video' : 'image',
        client_temp_id: p.tempId,
        reply_to_id: p.replyToId ?? null,
        media,
      });
      return;
    }

    case 'send_message_file': {
      const p = payload as PayloadFile;
      const result = await apiUpload({
        uri: p.uri,
        name: p.name,
        type: p.mimeType ?? 'application/octet-stream',
      });
      const fullUrl = toFullUrl(baseUrl, result.url);
      const fileName = result.file_name || p.name;
      ensureWebSocketConnectedForDispatch('file message dispatch');
      WebSocketService.sendEvent('send_message', {
        chat_id: p.chatId,
        content: fileName,
        msg_type: 'file',
        client_temp_id: p.tempId,
        reply_to_id: p.replyToId ?? null,
        media: {
          url: fullUrl,
          file_name: result.file_name,
          file_size: result.file_size,
          mime_type: result.mime_type,
        },
      });
      return;
    }

    case 'delete_message': {
      const p = payload as PayloadDelete;
      WebSocketService.sendEvent('delete_message', {
        chat_id: p.chatId,
        message_id: p.messageId,
      });
      return;
    }

    case 'pin_message': {
      const p = payload as PayloadPin;
      WebSocketService.sendEvent('pin_message', {
        chat_id: p.chatId,
        message_id: p.messageId,
      });
      return;
    }

    case 'forward_message': {
      const p = payload as PayloadForward;
      const message = p.sourceMessage;
      const media = message.media?.[0];
      const remoteUrl = media?.remote_url ?? null;
      const clientTempId = p.clientTempId ?? null;
      const forwardedFromMessageId =
        p.forwardedFrom?.messageId ?? message.forwarded_from_message_id ?? message.id;
      const forwardedFromName =
        p.forwardedFrom?.name ?? message.forwarded_from_name ?? null;
      const forwardedFromChatId =
        p.forwardedFrom?.chatId ?? message.forwarded_from_chat_id ?? message.chat_id;
      const forwardedFromSenderId =
        p.forwardedFrom?.senderId ?? message.forwarded_from_sender_id ?? message.sender_id;

      switch (message.msg_type) {
        case 'text':
          WebSocketService.sendEvent('send_message', {
            chat_id: p.chatId,
            content: message.content ?? '',
            msg_type: 'text',
            client_temp_id: clientTempId,
            forwarded_from_message_id: forwardedFromMessageId,
            forwarded_from_name: forwardedFromName,
            forwarded_from_chat_id: forwardedFromChatId,
            forwarded_from_sender_id: forwardedFromSenderId,
          });
          return;
        case 'image':
          if (!remoteUrl) throw new Error('Forward image missing remote_url');
          WebSocketService.sendEvent('send_message', {
            chat_id: p.chatId,
            content: message.content ?? null,
            msg_type: 'image',
            client_temp_id: clientTempId,
            forwarded_from_message_id: forwardedFromMessageId,
            forwarded_from_name: forwardedFromName,
            forwarded_from_chat_id: forwardedFromChatId,
            forwarded_from_sender_id: forwardedFromSenderId,
            media: {
              url: remoteUrl,
              width: media?.width,
              height: media?.height,
            },
          });
          return;
        case 'video':
          if (!remoteUrl) throw new Error('Forward video missing remote_url');
          WebSocketService.sendEvent('send_message', {
            chat_id: p.chatId,
            content: message.content ?? null,
            msg_type: 'video',
            client_temp_id: clientTempId,
            forwarded_from_message_id: forwardedFromMessageId,
            forwarded_from_name: forwardedFromName,
            forwarded_from_chat_id: forwardedFromChatId,
            forwarded_from_sender_id: forwardedFromSenderId,
            media: {
              url: remoteUrl,
              width: media?.width,
              height: media?.height,
              duration_ms: media?.duration_ms,
              thumbnail_url: media?.thumbnail_url,
              file_name: media?.file_name,
              file_size: media?.file_size,
            },
          });
          return;
        case 'voice':
          if (!remoteUrl) throw new Error('Forward voice missing remote_url');
          WebSocketService.sendEvent('send_message', {
            chat_id: p.chatId,
            content: remoteUrl,
            msg_type: 'voice',
            client_temp_id: clientTempId,
            forwarded_from_message_id: forwardedFromMessageId,
            forwarded_from_name: forwardedFromName,
            forwarded_from_chat_id: forwardedFromChatId,
            forwarded_from_sender_id: forwardedFromSenderId,
            media: {
              url: remoteUrl,
              duration_ms: media?.duration_ms,
              waveform: media?.waveform,
            },
          });
          return;
        case 'video_note':
          if (!remoteUrl) throw new Error('Forward video note missing remote_url');
          WebSocketService.sendEvent('send_message', {
            chat_id: p.chatId,
            content: remoteUrl,
            msg_type: 'video_note',
            client_temp_id: clientTempId,
            forwarded_from_message_id: forwardedFromMessageId,
            forwarded_from_name: forwardedFromName,
            forwarded_from_chat_id: forwardedFromChatId,
            forwarded_from_sender_id: forwardedFromSenderId,
            media: {
              url: remoteUrl,
              duration_ms: media?.duration_ms,
              thumbnail_url: media?.thumbnail_url,
              is_round: true,
            },
          });
          return;
        case 'file':
          if (!remoteUrl) throw new Error('Forward file missing remote_url');
          WebSocketService.sendEvent('send_message', {
            chat_id: p.chatId,
            content: getSafeFileContent(message.content, media?.file_name),
            msg_type: 'file',
            client_temp_id: clientTempId,
            forwarded_from_message_id: forwardedFromMessageId,
            forwarded_from_name: forwardedFromName,
            forwarded_from_chat_id: forwardedFromChatId,
            forwarded_from_sender_id: forwardedFromSenderId,
            media: {
              url: remoteUrl,
              file_name: media?.file_name,
              file_size: media?.file_size,
            },
          });
          return;
        default:
          throw new Error(`Forward not supported for ${message.msg_type}`);
      }
    }

    default:
      throw new Error(`Unknown sync action: ${action}`);
  }
}

class SyncServiceClass {
  private dao = new SyncQueueDao();
  private processing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async scheduleNextRetry(userId: string): Promise<void> {
    this.clearRetryTimer();

    if (!WebSocketService.isConnected()) return;

    const nextRetryAt = await this.dao.getNextRetryAt(userId);
    if (nextRetryAt == null) return;

    const delay = Math.max(0, nextRetryAt - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.processSyncQueue();
    }, delay);
  }

  async onQueueUpdated(): Promise<void> {
    const currentUserId = authStore.getState().user?.id ?? null;
    if (!currentUserId) return;

    if (WebSocketService.isConnected()) {
      await this.processSyncQueue();
      return;
    }

    this.clearRetryTimer();
  }

  /**
   * Process sync queue: get ready items, execute each action via WebSocket.
   * On success: delete. On failure: scheduleRetry or markFailed (max 5 retries).
   */
  async processSyncQueue(): Promise<void> {
    const currentUserId = authStore.getState().user?.id ?? null;
    if (!WebSocketService.isConnected() || !currentUserId) return;
    if (this.processing) return;

    this.processing = true;
    try {
      const items = await this.dao.getReadyForRetry(currentUserId, Date.now());

      for (const item of items) {
        let payload: unknown;
        try {
          payload = JSON.parse(item.payload) as unknown;
        } catch (e) {
          console.warn('[SyncService] Invalid payload JSON for id', item.id, e);
          await this.dao.markFailed(item.id);
          continue;
        }

        try {
          await executeAction(item.action, payload);
          await this.dao.delete(item.id);
        } catch (e) {
          console.warn('[SyncService] Action failed', item.action, item.id, e);
          if (isUploadTooLargeError(e)) {
            await this.dao.markFailed(item.id);
            markQueuedMessageFailed(payload, item.entity_id);
            continue;
          }
          const retryCount = item.retry_count + 1;
          const maxRetries = item.max_retries ?? MAX_RETRIES;
          if (retryCount >= maxRetries) {
            await this.dao.markFailed(item.id);
            markQueuedMessageFailed(payload, item.entity_id);
          } else {
            await this.dao.scheduleRetry(item.id, retryCount);
          }
        }
      }
    } finally {
      this.processing = false;
      await this.scheduleNextRetry(currentUserId);
    }
  }

  /**
   * Fetch messages for a chat from API and set in messageStore.
   */
  async fetchMessagesForChat(chatId: string): Promise<void> {
    try {
      const res = await apiGet(`/chats/${chatId}/messages?limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as ApiMessage[];
      if (__DEV__ && data.length > 0) {
        console.log('[SyncService] fetchMessagesForChat', chatId, 'count=', data.length, 'first=', { id: data[0]?.id, content: data[0]?.content, msg_type: data[0]?.msg_type });
      }
      const mapped: Message[] = data.map(mapApiMessageToMessage);
      messageStore.getState().setMessages(chatId, mapped);
    } catch {
      // ignore
    }
  }

  /**
   * Refresh chats list only (lightweight). Use when receiving message for unknown chat.
   */
  async refreshChats(): Promise<void> {
    try {
      const res = await apiGet('/chats');
      if (!res.ok) return;
      const data = (await res.json()) as ApiChat[];
      const mapped: Chat[] = data.map(mapApiChatToChat);
      mapped.forEach((chat) => {
        chat.members?.forEach((member) => {
          if (!member.user?.id) return;
          uiStore.getState().setPresence(member.user.id, {
            is_online: member.user.is_online,
            last_seen: member.user.last_seen ?? undefined,
          });
        });
      });
      mapped.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
        const atA = a.last_message_at ?? 0;
        const atB = b.last_message_at ?? 0;
        return atB - atA;
      });
      chatStore.getState().setChats(mapped);
    } catch {
      // ignore
    }
  }

  /**
   * Full sync: fetch chats, then messages for each chat.
   * Handles errors gracefully (log, don't throw).
   */
  async fullSync(): Promise<void> {
    try {
      const res = await apiGet('/chats');
      if (!res.ok) {
        const text = await res.text();
        console.warn('[SyncService] fullSync chats failed:', res.status, text);
        return;
      }
      const data = (await res.json()) as ApiChat[];
      const mapped: Chat[] = data.map(mapApiChatToChat);
      mapped.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
        const atA = a.last_message_at ?? 0;
        const atB = b.last_message_at ?? 0;
        return atB - atA;
      });
      chatStore.getState().setChats(mapped);
    } catch (e) {
      console.warn('[SyncService] fullSync chats error:', e);
      return;
    }

    const chats = chatStore.getState().chats;
    for (const chat of chats) {
      try {
        const res = await apiGet(`/chats/${chat.id}/messages?limit=30`);
        if (!res.ok) {
          const text = await res.text();
          console.warn('[SyncService] fullSync messages failed for', chat.id, res.status, text);
          continue;
        }
        const data = (await res.json()) as ApiMessage[];
        const mapped: Message[] = data.map(mapApiMessageToMessage);
        messageStore.getState().setMessages(chat.id, mapped);
      } catch (e) {
        console.warn('[SyncService] fullSync messages error for', chat.id, e);
      }
    }
  }

  /**
   * Run on WebSocket connect: process queue first, then full sync.
   */
  async runOnConnect(): Promise<void> {
    await this.processSyncQueue();
    await this.fullSync();
  }
}

export const SyncService = new SyncServiceClass();
