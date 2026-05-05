/**
 * TransportService: отправка сообщений через WebSocket сервера; офлайн — очередь SyncQueueDao.
 */

import { WebSocketService } from './WebSocketService';
import { SyncService } from './SyncService';
import { PeerDeliveryService, type PeerDeliveryFailureReason } from './PeerDeliveryService';
import { SyncQueueDao } from '../db';
import { apiUpload, apiUploadVoice, LARGE_MEDIA_UPLOAD_TIMEOUT_MS } from './apiClient';
import { API_BASE_URL, P2P_FIRST_ENABLED, P2P_PEER_ATTEMPT_TIMEOUT_MS } from '../config';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import type { Message } from '../stores/types';

function queueToSyncQueue(
  dao: SyncQueueDao,
  action: string,
  payload: object,
  entityId: string
): void {
  const currentUserId = authStore.getState().user?.id ?? null;
  if (!currentUserId) {
    console.warn('[TransportService] Skipping queue insert without authenticated user', { action, entityId });
    return;
  }

  dao
    .insert({
      user_id: currentUserId,
      action,
      payload: JSON.stringify(payload),
      entity_id: entityId,
      retry_count: 0,
      max_retries: 5,
      status: 'pending',
      created_at: Date.now(),
      next_retry_at: null,
    })
    .then(() => {
      void SyncService.onQueueUpdated();
    })
    .catch((e) => console.warn('[TransportService] SyncQueueDao.insert failed:', e));
}

function getUploadBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/?$/, '') || API_BASE_URL;
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

type ForwardMetadata = {
  messageId?: string | null;
  name?: string | null;
  chatId?: string | null;
  senderId?: string | null;
};

type MediaAlbumPayloadItem = {
  kind: 'image' | 'video';
  uri: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUri?: string;
  fileName?: string;
  mimeType?: string;
};

type UploadedMediaPayload = {
  media_type: 'image' | 'video';
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  mime_type?: string;
  file_name?: string;
  file_size?: number;
};

function buildForwardPayload(message: Message, forwardedFrom?: ForwardMetadata): {
  content: string | null;
  msg_type: string;
  media?: Record<string, unknown>;
  forwarded_from_message_id: string | null;
  forwarded_from_name: string | null;
  forwarded_from_chat_id: string | null;
  forwarded_from_sender_id: string | null;
} | null {
  if (message.is_deleted) return null;

  const media = message.media?.[0];
  const remoteUrl = media?.remote_url ?? null;
  const forwardedFromMessageId =
    forwardedFrom?.messageId ?? message.forwarded_from_message_id ?? message.id;
  const forwardedFromName =
    forwardedFrom?.name ?? message.forwarded_from_name ?? null;
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
          width: media?.width,
          height: media?.height,
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
          width: media?.width,
          height: media?.height,
          duration_ms: media?.duration_ms,
          thumbnail_url: media?.thumbnail_url,
          file_name: media?.file_name,
          file_size: media?.file_size,
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
          duration_ms: media?.duration_ms,
          waveform: media?.waveform,
        },
      };
    case 'video_note':
      if (!remoteUrl) return null;
      return {
        content: remoteUrl,
        msg_type: 'video_note',
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
      };
    case 'file':
      if (!remoteUrl) return null;
      return {
        content: getSafeFileContent(message.content, media?.file_name),
        msg_type: 'file',
        forwarded_from_message_id: forwardedFromMessageId,
        forwarded_from_name: forwardedFromName,
        forwarded_from_chat_id: forwardedFromChatId,
        forwarded_from_sender_id: forwardedFromSenderId,
        media: {
          url: remoteUrl,
          file_name: media?.file_name,
          file_size: media?.file_size,
        },
      };
    default:
      return null;
  }
}

export function canForwardMessage(message: Message): boolean {
  return buildForwardPayload(message) != null;
}

class TransportServiceClass {
  private syncQueueDao = new SyncQueueDao();

  private getPrivateChatPeerId(chatId: string): string | null {
    const currentUserId = authStore.getState().user?.id ?? null;
    if (!currentUserId) return null;

    const chat = chatStore.getState().chats.find((item) => item.id === chatId);
    if (!chat || chat.chat_type !== 'private') return null;

    const peers = chat.members?.filter((member) => member.user_id !== currentUserId) ?? [];
    return peers.length === 1 ? peers[0].user_id : null;
  }

  private logP2PDecision(
    event: 'peer_skipped' | 'peer_success' | 'peer_failed' | 'server_fallback',
    payload: Record<string, unknown>,
  ): void {
    if (__DEV__) {
      console.log(`[TransportService] ${event}`, payload);
    }
  }

  private ensureWebSocketConnectedForDispatch(context: string): void {
    if (!WebSocketService.isConnected()) {
      throw new Error(`[TransportService] WebSocket disconnected before ${context}`);
    }
  }

  private async uploadAlbumMediaItem(item: MediaAlbumPayloadItem): Promise<UploadedMediaPayload> {
    const fallbackMime =
      item.kind === 'video'
        ? item.mimeType ?? 'video/mp4'
        : item.mimeType ?? ((item.fileName?.toLowerCase() ?? '').endsWith('.png') ? 'image/png' : 'image/jpeg');
    const fallbackName =
      item.fileName ??
      (item.kind === 'video'
        ? fallbackMime === 'video/quicktime'
          ? 'video.mov'
          : fallbackMime === 'video/webm'
            ? 'video.webm'
            : 'video.mp4'
        : fallbackMime === 'image/png'
          ? 'image.png'
          : 'image.jpg');
    const result = await apiUpload({
      uri: item.uri,
      name: fallbackName,
      type: fallbackMime,
      timeoutMs: item.kind === 'video' ? LARGE_MEDIA_UPLOAD_TIMEOUT_MS : undefined,
    });
    const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
    const thumbnailUrl = result.thumbnail_path
      ? `${getUploadBaseUrl()}${result.thumbnail_path.startsWith('/') ? '' : '/'}${result.thumbnail_path}`
      : item.thumbnailUri;

    return {
      media_type: item.kind,
      url: fullUrl,
      thumbnail_url: thumbnailUrl,
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
  }

  private markOptimisticVideoNoteDispatched(
    chatId: string,
    tempId: string,
    payload: {
      remoteUrl: string;
      durationMs?: number;
      thumbnailUrl?: string;
      width?: number;
      height?: number;
      fileName?: string;
      fileSize?: number;
    },
  ): void {
    const existingMessages = messageStore.getState().messagesByChatId[chatId] ?? [];
    const optimistic = existingMessages.find((message) => message.id === tempId);
    if (!optimistic) return;

    const nextMedia = optimistic.media?.map((item, index) =>
      index === 0
        ? {
            ...item,
            remote_url: payload.remoteUrl,
            duration_ms: payload.durationMs ?? item.duration_ms,
            thumbnail_url: payload.thumbnailUrl ?? item.thumbnail_url,
            width: payload.width ?? item.width,
            height: payload.height ?? item.height,
            file_name: payload.fileName ?? item.file_name,
            file_size: payload.fileSize ?? item.file_size,
            is_round: true,
          }
        : item
    );

    messageStore.getState().updateMessage(chatId, tempId, {
      status: 'sent',
      content: payload.remoteUrl,
      ...(nextMedia ? { media: nextMedia } : {}),
    });
  }

  private markOptimisticMessageFailed(chatId: string, tempId: string): void {
    const existingMessages = messageStore.getState().messagesByChatId[chatId] ?? [];
    const optimistic = existingMessages.find((message) => message.id === tempId);
    if (!optimistic) return;

    messageStore.getState().updateMessage(chatId, tempId, {
      status: 'failed',
    });
  }

  /** Доставка сообщений: WebSocket сервера, иначе офлайн-очередь. */
  getConnectionStatus(_chatId?: string): 'server' | 'offline' {
    if (WebSocketService.isConnected()) return 'server';
    return 'offline';
  }

  private sendTextViaServerOrQueue(
    chatId: string,
    content: string,
    msgType: string,
    tempId: string,
    replyToId: string | null = null
  ): void {
    // WebSocket
    if (WebSocketService.isConnected()) {
      if (__DEV__) {
        console.log('[TransportService] send_message -> WS', { chatId, content: content?.slice(0, 50), msgType, tempId });
      }
      WebSocketService.sendEvent('send_message', {
        chat_id: chatId,
        content,
        msg_type: msgType,
        client_temp_id: tempId,
        reply_to_id: replyToId,
      });
      return;
    }

    // Offline: persist to sync_queue
    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_text',
      { chatId, content, msgType, tempId, replyToId },
      tempId
    );
  }

  private async attemptPeerTextMessage(
    chatId: string,
    recipientUserId: string,
    content: string,
    tempId: string,
    replyToId: string | null,
  ): Promise<{ ok: true } | { ok: false; reason: PeerDeliveryFailureReason }> {
    try {
      const result = await PeerDeliveryService.attemptTextMessage({
        chatId,
        recipientUserId,
        content,
        tempId,
        replyToId,
        timeoutMs: P2P_PEER_ATTEMPT_TIMEOUT_MS,
      });

      return result.ok ? { ok: true } : result;
    } catch (error) {
      if (__DEV__) {
        console.warn('[TransportService] peer attempt threw', {
          chatId,
          tempId,
          recipientUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return { ok: false, reason: 'unavailable' };
    }
  }

  /**
   * Send text: private 1:1 tries peer first when enabled, then falls back to server mailbox.
   */
  async sendMessage(
    chatId: string,
    content: string,
    msgType: string,
    tempId: string,
    replyToId: string | null = null
  ): Promise<void> {
    if (msgType === 'text') {
      if (P2P_FIRST_ENABLED) {
        const recipientUserId = this.getPrivateChatPeerId(chatId);
        if (recipientUserId) {
          const peerResult = await this.attemptPeerTextMessage(
            chatId,
            recipientUserId,
            content,
            tempId,
            replyToId,
          );
          if (peerResult.ok) {
            this.logP2PDecision('peer_success', { chatId, tempId, recipientUserId });
            messageStore.getState().updateMessage(chatId, tempId, {
              status: 'sent',
              transport: 'p2p',
            });
            return;
          }

          this.logP2PDecision('peer_failed', {
            chatId,
            tempId,
            recipientUserId,
            reason: peerResult.reason,
          });
        } else {
          this.logP2PDecision('peer_skipped', {
            chatId,
            tempId,
            reason: 'not_private_or_missing_peer',
          });
        }
      } else {
        this.logP2PDecision('peer_skipped', { chatId, tempId, reason: 'disabled' });
      }

      this.logP2PDecision('server_fallback', {
        chatId,
        tempId,
        path: WebSocketService.isConnected() ? 'websocket' : 'offline_queue',
      });
    }

    this.sendTextViaServerOrQueue(chatId, content, msgType, tempId, replyToId);
  }

  /**
   * Send voice message: upload file, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendVoiceMessage(
    chatId: string,
    payload: { uri: string; durationMs: number; waveform?: number[] },
    tempId: string,
    replyToId: string | null = null
  ): Promise<void> {
    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUploadVoice({
          uri: payload.uri,
          name: 'voice.m4a',
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        const resolvedDurationMs = result.duration_ms ?? payload.durationMs;
        this.ensureWebSocketConnectedForDispatch('voice message dispatch');
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: fullUrl,
          msg_type: 'voice',
          client_temp_id: tempId,
          reply_to_id: replyToId,
          media: {
            url: fullUrl,
            duration_ms: resolvedDurationMs || undefined,
            waveform:
              payload.waveform && payload.waveform.length > 0
                ? payload.waveform
                : result.waveform && result.waveform.length > 0
                  ? result.waveform
                  : undefined,
            mime_type: result.mime_type,
            file_name: result.file_name,
            file_size: result.file_size,
          },
        });
      } catch (err) {
        if (__DEV__) {
          console.warn('[TransportService] voice upload failed, queueing for retry:', {
            chatId,
            tempId,
            uri: payload.uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_voice',
          {
            chatId,
            uri: payload.uri,
            durationMs: payload.durationMs,
            waveform: payload.waveform ?? [],
            tempId,
            replyToId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_voice',
      {
        chatId,
        uri: payload.uri,
        durationMs: payload.durationMs,
        waveform: payload.waveform ?? [],
        tempId,
        replyToId,
      },
      tempId
    );
  }

  /**
   * Send video note: upload video, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendVideoNoteMessage(
    chatId: string,
    payload: { uri: string; durationMs: number; thumbnailUri?: string },
    tempId: string,
    replyToId: string | null = null
  ): Promise<void> {
    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUpload({
          uri: payload.uri,
          name: 'video_note.mp4',
          type: 'video/mp4',
          timeoutMs: LARGE_MEDIA_UPLOAD_TIMEOUT_MS,
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        const resolvedDurationMs = result.duration_ms ?? payload.durationMs;
        const thumbnailUrl = result.thumbnail_path
          ? `${getUploadBaseUrl()}${result.thumbnail_path.startsWith('/') ? '' : '/'}${result.thumbnail_path}`
          : undefined;

        this.ensureWebSocketConnectedForDispatch('video note dispatch');
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: fullUrl,
          msg_type: 'video_note',
          client_temp_id: tempId,
          reply_to_id: replyToId,
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
        this.markOptimisticVideoNoteDispatched(chatId, tempId, {
          remoteUrl: fullUrl,
          durationMs: resolvedDurationMs || undefined,
          thumbnailUrl: thumbnailUrl ?? payload.thumbnailUri,
          width: result.width ?? undefined,
          height: result.height ?? undefined,
          fileName: result.file_name,
          fileSize: result.file_size,
        });
      } catch (err) {
        if (isUploadTooLargeError(err)) {
          this.markOptimisticMessageFailed(chatId, tempId);
          if (__DEV__) {
            console.warn('[TransportService] video note rejected by upload size limit:', {
              chatId,
              tempId,
              uri: payload.uri,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        if (__DEV__) {
          console.warn('[TransportService] video note upload/send failed, queueing for retry:', {
            chatId,
            tempId,
            uri: payload.uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_video_note',
          {
            chatId,
            uri: payload.uri,
            durationMs: payload.durationMs,
            thumbnailUri: payload.thumbnailUri,
            tempId,
            replyToId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_video_note',
      {
        chatId,
        uri: payload.uri,
        durationMs: payload.durationMs,
        thumbnailUri: payload.thumbnailUri,
        tempId,
        replyToId,
      },
      tempId
    );
  }

  /**
   * Send image message: upload image via apiUpload, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendImageMessage(
    chatId: string,
    payload: { uri: string; width?: number; height?: number; fileName?: string; mimeType?: string; caption?: string },
    tempId: string,
    replyToId: string | null = null
  ): Promise<void> {
    const imageMime = payload.mimeType ?? ((payload.fileName?.toLowerCase() ?? '').endsWith('.png') ? 'image/png' : 'image/jpeg');
    const imageName = payload.fileName ?? (imageMime === 'image/png' ? 'image.png' : 'image.jpg');
    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUpload({
          uri: payload.uri,
          name: imageName,
          type: imageMime,
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        this.ensureWebSocketConnectedForDispatch('image message dispatch');
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: payload.caption ?? null,
          msg_type: 'image',
          client_temp_id: tempId,
          reply_to_id: replyToId,
          media: {
            url: fullUrl,
            thumbnail_url: result.thumbnail_path
              ? `${getUploadBaseUrl()}${result.thumbnail_path.startsWith('/') ? '' : '/'}${result.thumbnail_path}`
              : undefined,
            width: payload.width ?? result.width ?? undefined,
            height: payload.height ?? result.height ?? undefined,
            mime_type: result.mime_type,
            file_name: result.file_name,
            file_size: result.file_size,
          },
        });
      } catch (err) {
        if (__DEV__) {
          console.warn('[TransportService] image upload/send failed, queueing for retry:', {
            chatId,
            tempId,
            uri: payload.uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_image',
          {
            chatId,
            uri: payload.uri,
            width: payload.width,
            height: payload.height,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            caption: payload.caption,
            tempId,
            replyToId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_image',
      {
        chatId,
        uri: payload.uri,
        width: payload.width,
        height: payload.height,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        caption: payload.caption,
        tempId,
        replyToId,
      },
      tempId
    );
  }

  /**
   * Send video message: upload video via apiUpload, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendVideoMessage(
    chatId: string,
    payload: {
      uri: string;
      width?: number;
      height?: number;
      durationMs?: number;
      thumbnailUri?: string;
      fileName?: string;
      mimeType?: string;
      caption?: string;
    },
    tempId: string,
    replyToId: string | null = null
  ): Promise<void> {
    const videoMime = payload.mimeType ?? 'video/mp4';
    const videoName =
      payload.fileName ??
      (videoMime === 'video/quicktime'
        ? 'video.mov'
        : videoMime === 'video/webm'
          ? 'video.webm'
          : 'video.mp4');

    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUpload({
          uri: payload.uri,
          name: videoName,
          type: videoMime,
          timeoutMs: LARGE_MEDIA_UPLOAD_TIMEOUT_MS,
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        const thumbnailUrl = result.thumbnail_path
          ? `${getUploadBaseUrl()}${result.thumbnail_path.startsWith('/') ? '' : '/'}${result.thumbnail_path}`
          : undefined;
        const resolvedDurationMs = result.duration_ms ?? payload.durationMs;

        this.ensureWebSocketConnectedForDispatch('video message dispatch');
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: payload.caption ?? null,
          msg_type: 'video',
          client_temp_id: tempId,
          reply_to_id: replyToId,
          media: {
            url: fullUrl,
            thumbnail_url: thumbnailUrl,
            width: payload.width ?? result.width ?? undefined,
            height: payload.height ?? result.height ?? undefined,
            duration_ms: resolvedDurationMs || undefined,
            mime_type: result.mime_type,
            file_name: result.file_name,
            file_size: result.file_size,
          },
        });
      } catch (err) {
        if (isUploadTooLargeError(err)) {
          this.markOptimisticMessageFailed(chatId, tempId);
          if (__DEV__) {
            console.warn('[TransportService] video rejected by upload size limit:', {
              chatId,
              tempId,
              uri: payload.uri,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        if (__DEV__) {
          console.warn('[TransportService] video upload/send failed, queueing for retry:', {
            chatId,
            tempId,
            uri: payload.uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_video',
          {
            chatId,
            uri: payload.uri,
            width: payload.width,
            height: payload.height,
            durationMs: payload.durationMs,
            thumbnailUri: payload.thumbnailUri,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            caption: payload.caption,
            tempId,
            replyToId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_video',
      {
        chatId,
        uri: payload.uri,
        width: payload.width,
        height: payload.height,
        durationMs: payload.durationMs,
        thumbnailUri: payload.thumbnailUri,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        caption: payload.caption,
        tempId,
        replyToId,
      },
      tempId
    );
  }

  async sendMediaAlbumMessage(
    chatId: string,
    payload: { items: MediaAlbumPayloadItem[]; caption?: string },
    tempId: string,
    replyToId: string | null = null
  ): Promise<void> {
    const items = payload.items.slice(0, 10);
    if (items.length === 0) return;

    if (WebSocketService.isConnected()) {
      try {
        const media = await Promise.all(items.map((item) => this.uploadAlbumMediaItem(item)));
        this.ensureWebSocketConnectedForDispatch('media album dispatch');
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: payload.caption ?? null,
          msg_type: media[0]?.media_type === 'video' ? 'video' : 'image',
          client_temp_id: tempId,
          reply_to_id: replyToId,
          media,
        });
      } catch (err) {
        if (isUploadTooLargeError(err)) {
          this.markOptimisticMessageFailed(chatId, tempId);
          return;
        }
        if (__DEV__) {
          console.warn('[TransportService] media album upload/send failed, queueing for retry:', {
            chatId,
            tempId,
            count: items.length,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_media_album',
          {
            chatId,
            items,
            caption: payload.caption,
            tempId,
            replyToId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_media_album',
      {
        chatId,
        items,
        caption: payload.caption,
        tempId,
        replyToId,
      },
      tempId
    );
  }

  /**
   * Send file message: upload file via apiUpload, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendFileMessage(
    chatId: string,
    payload: { uri: string; name: string; size: number; mimeType?: string },
    tempId: string,
    replyToId: string | null = null
  ): Promise<void> {
    if (WebSocketService.isConnected()) {
      try {
        const mime = payload.mimeType ?? 'application/octet-stream';
        const result = await apiUpload({
          uri: payload.uri,
          name: payload.name,
          type: mime,
          timeoutMs: mime.startsWith('video/') ? LARGE_MEDIA_UPLOAD_TIMEOUT_MS : undefined,
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        const fileName = result.file_name || payload.name;
        this.ensureWebSocketConnectedForDispatch('file message dispatch');
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: fileName,
          msg_type: 'file',
          client_temp_id: tempId,
          reply_to_id: replyToId,
          media: {
            url: fullUrl,
            file_name: result.file_name,
            file_size: result.file_size,
            mime_type: result.mime_type,
          },
        });
      } catch {
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_file',
          {
            chatId,
            uri: payload.uri,
            name: payload.name,
            size: payload.size,
            mimeType: payload.mimeType,
            tempId,
            replyToId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_file',
      {
        chatId,
        uri: payload.uri,
        name: payload.name,
        size: payload.size,
        mimeType: payload.mimeType,
        tempId,
        replyToId,
      },
      tempId
    );
  }

  deleteMessage(chatId: string, messageId: string): void {
    if (WebSocketService.isConnected()) {
      WebSocketService.sendEvent('delete_message', {
        chat_id: chatId,
        message_id: messageId,
      });
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'delete_message',
      { chatId, messageId },
      messageId
    );
  }

  pinMessage(chatId: string, messageId: string | null): void {
    if (WebSocketService.isConnected()) {
      WebSocketService.sendEvent('pin_message', {
        chat_id: chatId,
        message_id: messageId,
      });
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'pin_message',
      { chatId, messageId },
      messageId ?? chatId
    );
  }

  forwardMessage(
    chatId: string,
    sourceMessage: Message,
    forwardedFrom?: ForwardMetadata,
    clientTempId?: string | null
  ): boolean {
    const payload = buildForwardPayload(sourceMessage, forwardedFrom);
    if (!payload) return false;

    if (WebSocketService.isConnected()) {
      WebSocketService.sendEvent('send_message', {
        chat_id: chatId,
        content: payload.content,
        msg_type: payload.msg_type,
        client_temp_id: clientTempId ?? null,
        forwarded_from_message_id: payload.forwarded_from_message_id,
        forwarded_from_name: payload.forwarded_from_name,
        forwarded_from_chat_id: payload.forwarded_from_chat_id,
        forwarded_from_sender_id: payload.forwarded_from_sender_id,
        media: payload.media,
      });
      return true;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'forward_message',
      { chatId, sourceMessage, forwardedFrom, clientTempId: clientTempId ?? null },
      clientTempId ?? sourceMessage.id
    );
    return true;
  }

  /** Process sync_queue when WebSocket connects. Delegates to SyncService.processSyncQueue(). */
  async flushQueue(): Promise<void> {
    await SyncService.processSyncQueue();
  }

  /** Вызывается при старте сессии (разрешён no-op для будущей инициализации транспорта). */
  init(): Promise<void> {
    return Promise.resolve();
  }
}

export const TransportService = new TransportServiceClass();
