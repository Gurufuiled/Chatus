/**
 * TransportService: отправка сообщений через WebSocket сервера; офлайн — очередь SyncQueueDao.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { WebSocketService } from './WebSocketService';
import { SyncService } from './SyncService';
import { PeerDeliveryService, type PeerDeliveryResult } from './PeerDeliveryService';
import { resolvePrivateTextTransportRoute } from './privateTextTransportRouting';
import { resolvePrivateMediaTransportRoute } from './privateMediaTransportRouting';
import { LineSyncEventDao, SyncQueueDao } from '../db';
import { apiUpload, apiUploadVoice, LARGE_MEDIA_UPLOAD_TIMEOUT_MS } from './apiClient';
import { API_BASE_URL, P2P_FIRST_ENABLED, P2P_PEER_ATTEMPT_TIMEOUT_MS } from '../config';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import type { Message } from '../stores/types';
import {
  buildPeerOnlyBlobRefFromLocalMedia,
  buildPendingLineSyncRowForPeerMedia,
  buildPendingLineSyncRowForPeerMediaMultiple,
  buildPendingLineSyncRowForUploadedMedia,
  LINE_SYNC_SYNC_STATE_P2P_DELIVERED,
  messageIdToLineSyncEventId,
  type LineSyncMessageRowPick,
} from './lineSyncEventBuilder';
import { LineSyncBlobService } from './LineSyncBlobService';
import type { BlobRef } from './lineSyncProtocol';
import { LineSyncService, LINE_SYNC_MVP_NODE_ID, type PeerPatchDeliveryResult } from './LineSyncService';
import { MediaCacheService } from './MediaCacheService';
import { calculateFileSha256 } from './MediaHashService';
import { ensureLocalFileUri } from '../utils/ensureLocalFileUri';
import { getOtherGroupMemberUserIds } from '../utils/groupLineSyncPeer';

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

type LineSyncUploadedMediaLogItem = {
  kind: 'image' | 'voice' | 'video_note' | 'video' | 'file';
  url: string;
  sha256?: string | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  localUri?: string | null;
};

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
  sha256?: string;
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
  if (message.is_deleted === 1) return null;

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

  private scheduleUploadedMediaLineSync(args: {
    chatId: string;
    tempId: string;
    senderId: string;
    msgType: 'image' | 'voice' | 'video_note' | 'video' | 'file';
    content: string | null;
    replyToId: string | null;
    media: LineSyncUploadedMediaLogItem[];
  }): void {
    const row = buildPendingLineSyncRowForUploadedMedia(
      {
        id: args.tempId,
        chat_id: args.chatId,
        sender_id: args.senderId,
        msg_type: args.msgType,
        content: args.content,
        reply_to_id: args.replyToId,
        created_at: Date.now(),
      },
      args.media
    );
    if (!row) return;
    void new LineSyncEventDao()
      .insert(row)
      .catch((err) => console.warn('[TransportService] LineSync media event insert failed:', err));
    for (const item of args.media) {
      const sha256 = item.sha256?.trim().toLowerCase();
      if (!sha256 || !item.localUri || !/^[a-f0-9]{64}$/.test(sha256)) continue;
      void LineSyncBlobService.pinLocalBlob({
        lineId: args.chatId,
        blobId: `sha256:${sha256}`,
        sha256,
        localUri: item.localUri,
        sizeBytes: item.sizeBytes,
      }).catch((err) => console.warn('[TransportService] LineSync blob pin failed:', err));
    }
  }

  private logP2PDecision(
    event:
      | 'peer_skipped'
      | 'peer_success'
      | 'peer_failed'
      | 'server_fallback'
      | 'group_peer_fanout',
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
      sha256: result.sha256,
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

  /** Личка: временный mailbox при server-path (`send_message`). */
  private privateRelayMailboxFields(
    chatId: string,
  ): Record<string, never> | { relay_mailbox: true } {
    const chat = chatStore.getState().getChatById(chatId);
    return chat?.chat_type === 'private' ? { relay_mailbox: true as const } : {};
  }

  private mapPeerPatchToPeerDelivery(patch: PeerPatchDeliveryResult): PeerDeliveryResult {
    if (patch.ok === false) {
      switch (patch.reason) {
        case 'not_connected':
          return { ok: false, reason: 'not_connected' };
        case 'timeout':
          return { ok: false, reason: 'timeout' };
        default:
          return { ok: false, reason: 'unavailable' };
      }
    }
    return { ok: true, transport: 'p2p' };
  }

  /** Best-effort rollback after failed peer-first pin / ACK (cache row + peer location index). */
  private async releasePinnedPeerBlobsForLine(lineId: string, blobIds: string[]): Promise<void> {
    for (const blobId of blobIds) {
      await MediaCacheService.remove(blobId).catch(() => {});
      await LineSyncService.removePeerBlobLocation({
        lineId,
        blobId,
        nodeId: LINE_SYNC_MVP_NODE_ID,
      }).catch(() => {});
    }
  }

  /**
   * E2: одно медиа-вложение в личке без upload — LINE_PATCH + ACK, локальный SHA256 + pin blob.
   * Поддерживаемые `msgType`: image, voice, … (см. `buildPendingLineSyncRowForPeerMedia`).
   */
  private async attemptPeerPrivateMediaBlob(args: {
    chatId: string;
    recipientUserId: string;
    tempId: string;
    replyToId: string | null;
    localUri: string;
    msgType: 'image' | 'voice' | 'video_note' | 'video' | 'file';
    content: string | null;
    mimeTypeForBlob: string | null;
  }): Promise<PeerDeliveryResult> {
    const senderId = authStore.getState().user?.id;
    if (!senderId) return { ok: false, reason: 'unavailable' };

    let localUri = args.localUri;
    try {
      localUri = await ensureLocalFileUri(args.localUri, 'media');
    } catch {
      // Fall back to original URI; hashing / pin may still fail and trigger server upload.
    }

    const sha256 = await calculateFileSha256(localUri);
    if (!sha256) return { ok: false, reason: 'unavailable' };

    const info = await FileSystem.getInfoAsync(localUri).catch(() => null);
    const sizeBytes =
      info?.exists && !info.isDirectory && typeof info.size === 'number' ? info.size : null;
    if (sizeBytes == null || sizeBytes < 0) return { ok: false, reason: 'unavailable' };

    const optimistic = messageStore.getState().messagesByChatId[args.chatId]?.find((m) => m.id === args.tempId);
    const createdAt = optimistic?.created_at ?? Date.now();

    const msgPick: LineSyncMessageRowPick = {
      id: args.tempId,
      chat_id: args.chatId,
      sender_id: senderId,
      msg_type: args.msgType,
      content: args.content,
      reply_to_id: args.replyToId,
      created_at: createdAt,
    };

    const blobRef = buildPeerOnlyBlobRefFromLocalMedia({
      kind: args.msgType,
      sha256,
      sizeBytes,
      mimeType: args.mimeTypeForBlob,
      senderUserId: senderId,
    });
    if (!blobRef) return { ok: false, reason: 'unavailable' };

    const row = buildPendingLineSyncRowForPeerMedia(msgPick, blobRef);
    if (!row) return { ok: false, reason: 'unavailable' };

    const eventId = messageIdToLineSyncEventId(args.tempId);
    const dao = new LineSyncEventDao();

    const inserted = await dao.insert(row);
    if (!inserted) {
      return { ok: false, reason: 'unavailable' };
    }

    const pinOk = await LineSyncBlobService.pinLocalBlob({
      lineId: args.chatId,
      blobId: `sha256:${sha256}`,
      sha256,
      localUri,
      sizeBytes,
      targetUserId: args.recipientUserId,
    });

    if (!pinOk) {
      await dao.deleteByEventId(eventId);
      return { ok: false, reason: 'unavailable' };
    }

    const patch = await LineSyncService.buildPatch({
      type: 'LINE_PATCH_REQUEST',
      line_id: args.chatId,
      mode: 'by_ids',
      event_ids: [eventId],
      max_events: 1,
    });

    const ackResult = await LineSyncService.sendPatchAndWaitForPeerAck({
      targetUserId: args.recipientUserId,
      lineId: args.chatId,
      patch,
      primaryEventId: eventId,
      timeoutMs: P2P_PEER_ATTEMPT_TIMEOUT_MS,
    });

    if (!ackResult.ok) {
      await dao.deleteByEventId(eventId);
      await this.releasePinnedPeerBlobsForLine(args.chatId, [`sha256:${sha256}`]);
      return this.mapPeerPatchToPeerDelivery(ackResult);
    }

    return { ok: true, transport: 'p2p' };
  }

  /**
   * E2: медиаальбом в личке — один `message.create`, несколько peer-only `blob_refs`.
   * Если слоты разного `kind` (image+video), событие использует LineSync `content_type: media_album`.
   * Для каждого уникального `sha256` — один pin.
   */
  private async attemptPeerPrivateMediaAlbum(args: {
    chatId: string;
    recipientUserId: string;
    tempId: string;
    replyToId: string | null;
    items: MediaAlbumPayloadItem[];
    caption: string | null;
  }): Promise<PeerDeliveryResult> {
    const senderId = authStore.getState().user?.id;
    if (!senderId) return { ok: false, reason: 'unavailable' };

    const optimistic = messageStore.getState().messagesByChatId[args.chatId]?.find((m) => m.id === args.tempId);
    const createdAt = optimistic?.created_at ?? Date.now();
    const albumMsgType = args.items[0]?.kind === 'video' ? 'video' : 'image';

    const blobRefs: BlobRef[] = [];
    const pins: Array<{ sha256: string; localUri: string; sizeBytes: number }> = [];

    for (const item of args.items) {
      const sha256 = await calculateFileSha256(item.uri);
      if (!sha256) return { ok: false, reason: 'unavailable' };

      const info = await FileSystem.getInfoAsync(item.uri).catch(() => null);
      const sizeBytes =
        info?.exists && !info.isDirectory && typeof info.size === 'number' ? info.size : null;
      if (sizeBytes == null || sizeBytes < 0) return { ok: false, reason: 'unavailable' };

      const fileName = item.fileName?.toLowerCase() ?? '';
      const mimeTypeForBlob =
        item.kind === 'video'
          ? (item.mimeType ?? 'video/mp4')
          : fileName.endsWith('.png')
            ? (item.mimeType ?? 'image/png')
            : fileName.endsWith('.webp')
              ? (item.mimeType ?? 'image/webp')
              : fileName.endsWith('.gif')
                ? (item.mimeType ?? 'image/gif')
                : (item.mimeType ?? 'image/jpeg');

      const blobRef = buildPeerOnlyBlobRefFromLocalMedia({
        kind: item.kind,
        sha256,
        sizeBytes,
        mimeType: mimeTypeForBlob,
        senderUserId: senderId,
      });
      if (!blobRef) return { ok: false, reason: 'unavailable' };
      blobRefs.push(blobRef);
      pins.push({ sha256, localUri: item.uri, sizeBytes });
    }

    const msgPick: LineSyncMessageRowPick = {
      id: args.tempId,
      chat_id: args.chatId,
      sender_id: senderId,
      msg_type: albumMsgType,
      content: args.caption,
      reply_to_id: args.replyToId,
      created_at: createdAt,
    };

    const row = buildPendingLineSyncRowForPeerMediaMultiple(msgPick, blobRefs);
    if (!row) return { ok: false, reason: 'unavailable' };

    const eventId = messageIdToLineSyncEventId(args.tempId);
    const dao = new LineSyncEventDao();

    const inserted = await dao.insert(row);
    if (!inserted) {
      return { ok: false, reason: 'unavailable' };
    }

    const pinnedSha = new Set<string>();
    const pinnedBlobIds: string[] = [];

    for (const p of pins) {
      if (pinnedSha.has(p.sha256)) continue;
      pinnedSha.add(p.sha256);

      const blobId = `sha256:${p.sha256}`;
      const pinOk = await LineSyncBlobService.pinLocalBlob({
        lineId: args.chatId,
        blobId,
        sha256: p.sha256,
        localUri: p.localUri,
        sizeBytes: p.sizeBytes,
        targetUserId: args.recipientUserId,
      });
      if (!pinOk) {
        await dao.deleteByEventId(eventId);
        await this.releasePinnedPeerBlobsForLine(args.chatId, pinnedBlobIds);
        return { ok: false, reason: 'unavailable' };
      }
      pinnedBlobIds.push(blobId);
    }

    const patch = await LineSyncService.buildPatch({
      type: 'LINE_PATCH_REQUEST',
      line_id: args.chatId,
      mode: 'by_ids',
      event_ids: [eventId],
      max_events: 1,
    });

    const ackResult = await LineSyncService.sendPatchAndWaitForPeerAck({
      targetUserId: args.recipientUserId,
      lineId: args.chatId,
      patch,
      primaryEventId: eventId,
      timeoutMs: P2P_PEER_ATTEMPT_TIMEOUT_MS,
    });

    if (!ackResult.ok) {
      await dao.deleteByEventId(eventId);
      await this.releasePinnedPeerBlobsForLine(args.chatId, pinnedBlobIds);
      return this.mapPeerPatchToPeerDelivery(ackResult);
    }

    return { ok: true, transport: 'p2p' };
  }

  private isPrivateChatForRelayMailbox(chatId: string, msgType: string): boolean {
    if (msgType !== 'text') return false;
    const chat = chatStore.getState().getChatById(chatId);
    return chat?.chat_type === 'private';
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
        ...(this.isPrivateChatForRelayMailbox(chatId, msgType)
          ? { relay_mailbox: true as const }
          : {}),
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
  ): Promise<PeerDeliveryResult> {
    try {
      return await PeerDeliveryService.attemptTextMessage({
        chatId,
        recipientUserId,
        content,
        tempId,
        replyToId,
        timeoutMs: P2P_PEER_ATTEMPT_TIMEOUT_MS,
      });
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
      const textRoute = resolvePrivateTextTransportRoute({
        enabled: P2P_FIRST_ENABLED,
        msgType,
        chat: chatStore.getState().getChatById(chatId),
        currentUserId: authStore.getState().user?.id ?? null,
      });

      if (textRoute.mode === 'server_direct') {
        this.logP2PDecision('peer_skipped', {
          chatId,
          tempId,
          reason: textRoute.skipReason,
        });
      } else {
        const peerResult = await this.attemptPeerTextMessage(
          chatId,
          textRoute.recipientUserId,
          content,
          tempId,
          replyToId,
        );
        if (peerResult.ok === false) {
          this.logP2PDecision('peer_failed', {
            chatId,
            tempId,
            recipientUserId: textRoute.recipientUserId,
            reason: peerResult.reason,
          });
        } else {
          this.logP2PDecision('peer_success', {
            chatId,
            tempId,
            recipientUserId: textRoute.recipientUserId,
          });
          messageStore.getState().updateMessage(chatId, tempId, {
            status: 'sent',
            transport: 'p2p',
          });
          const p2pEventId = messageIdToLineSyncEventId(tempId);
          void new LineSyncEventDao()
            .markSyncState(p2pEventId, LINE_SYNC_SYNC_STATE_P2P_DELIVERED)
            .catch((err) => {
              console.warn('[TransportService] LineSync p2p_delivered mark failed', err);
            });
          return;
        }
      }

      this.logP2PDecision('server_fallback', {
        chatId,
        tempId,
        path: WebSocketService.isConnected() ? 'websocket' : 'offline_queue',
      });

      if (P2P_FIRST_ENABLED) {
        const groupChat = chatStore.getState().getChatById(chatId);
        const uid = authStore.getState().user?.id ?? null;
        if (groupChat?.chat_type === 'group' && uid) {
          const recipients = getOtherGroupMemberUserIds(groupChat, uid);
          if (recipients.length > 0) {
            void Promise.allSettled(
              recipients.map((recipientUserId) =>
                this.attemptPeerTextMessage(chatId, recipientUserId, content, tempId, replyToId),
              ),
            ).then((results) => {
              const delivered = results.filter(
                (r): r is PromiseFulfilledResult<PeerDeliveryResult> =>
                  r.status === 'fulfilled' && r.value.ok === true,
              ).length;
              if (delivered > 0) {
                this.logP2PDecision('group_peer_fanout', {
                  chatId,
                  tempId,
                  delivered,
                  targets: recipients.length,
                });
              }
            });
          }
        }
      }
    }

    this.sendTextViaServerOrQueue(chatId, content, msgType, tempId, replyToId);
  }

  /**
   * Голос: при P2P-first и личке — попытка без upload (E2); иначе `apiUploadVoice` → `send_message`.
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
        const mediaRoute = resolvePrivateMediaTransportRoute({
          enabled: P2P_FIRST_ENABLED,
          msgType: 'voice',
          chat: chatStore.getState().getChatById(chatId),
          currentUserId: authStore.getState().user?.id ?? null,
        });

        if (mediaRoute.mode === 'peer_first') {
          try {
            const peerResult = await this.attemptPeerPrivateMediaBlob({
              chatId,
              recipientUserId: mediaRoute.recipientUserId,
              tempId,
              replyToId,
              localUri: payload.uri,
              msgType: 'voice',
              content: null,
              mimeTypeForBlob: 'audio/mp4',
            });
            if (peerResult.ok === true) {
              this.logP2PDecision('peer_success', {
                chatId,
                tempId,
                recipientUserId: mediaRoute.recipientUserId,
                msgType: 'voice',
              });
              messageStore.getState().updateMessage(chatId, tempId, {
                status: 'sent',
                transport: 'p2p',
              });
              const p2pEventId = messageIdToLineSyncEventId(tempId);
              void new LineSyncEventDao()
                .markSyncState(p2pEventId, LINE_SYNC_SYNC_STATE_P2P_DELIVERED)
                .catch((err) => {
                  console.warn('[TransportService] LineSync p2p_delivered mark failed', err);
                });
              return;
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'voice',
              reason: peerResult.reason,
            });
          } catch (peerErr) {
            if (__DEV__) {
              console.warn('[TransportService] peer-first voice threw', {
                chatId,
                tempId,
                error: peerErr instanceof Error ? peerErr.message : String(peerErr),
              });
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'voice',
              reason: 'unavailable',
              threw: peerErr instanceof Error ? peerErr.message : String(peerErr),
            });
          }
        } else {
          this.logP2PDecision('peer_skipped', {
            chatId,
            tempId,
            reason: mediaRoute.skipReason,
            msgType: 'voice',
          });
        }

        this.logP2PDecision('server_fallback', {
          chatId,
          tempId,
          path: 'websocket',
          msgType: 'voice',
        });

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
          ...this.privateRelayMailboxFields(chatId),
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
            sha256: result.sha256,
          },
        });
        const senderId = authStore.getState().user?.id;
        if (senderId) {
          this.scheduleUploadedMediaLineSync({
            chatId,
            tempId,
            senderId,
            msgType: 'voice',
            content: fullUrl,
            replyToId,
            media: [{
              kind: 'voice',
              url: fullUrl,
              sha256: result.sha256,
              sizeBytes: result.file_size,
              mimeType: result.mime_type,
              localUri: payload.uri,
            }],
          });
        }
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
   * Видеокружок: при P2P-first и личке — без upload (E2); иначе upload → `send_message`.
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
        const mediaRoute = resolvePrivateMediaTransportRoute({
          enabled: P2P_FIRST_ENABLED,
          msgType: 'video_note',
          chat: chatStore.getState().getChatById(chatId),
          currentUserId: authStore.getState().user?.id ?? null,
        });

        if (mediaRoute.mode === 'peer_first') {
          try {
            const peerResult = await this.attemptPeerPrivateMediaBlob({
              chatId,
              recipientUserId: mediaRoute.recipientUserId,
              tempId,
              replyToId,
              localUri: payload.uri,
              msgType: 'video_note',
              content: null,
              mimeTypeForBlob: 'video/mp4',
            });
            if (peerResult.ok === true) {
              this.logP2PDecision('peer_success', {
                chatId,
                tempId,
                recipientUserId: mediaRoute.recipientUserId,
                msgType: 'video_note',
              });
              this.markOptimisticVideoNoteDispatched(chatId, tempId, {
                remoteUrl: payload.uri,
                durationMs: payload.durationMs,
                thumbnailUrl: payload.thumbnailUri,
              });
              messageStore.getState().updateMessage(chatId, tempId, { transport: 'p2p' });
              const p2pEventId = messageIdToLineSyncEventId(tempId);
              void new LineSyncEventDao()
                .markSyncState(p2pEventId, LINE_SYNC_SYNC_STATE_P2P_DELIVERED)
                .catch((err) => {
                  console.warn('[TransportService] LineSync p2p_delivered mark failed', err);
                });
              return;
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'video_note',
              reason: peerResult.reason,
            });
          } catch (peerErr) {
            if (__DEV__) {
              console.warn('[TransportService] peer-first video_note threw', {
                chatId,
                tempId,
                error: peerErr instanceof Error ? peerErr.message : String(peerErr),
              });
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'video_note',
              reason: 'unavailable',
              threw: peerErr instanceof Error ? peerErr.message : String(peerErr),
            });
          }
        } else {
          this.logP2PDecision('peer_skipped', {
            chatId,
            tempId,
            reason: mediaRoute.skipReason,
            msgType: 'video_note',
          });
        }

        this.logP2PDecision('server_fallback', {
          chatId,
          tempId,
          path: 'websocket',
          msgType: 'video_note',
        });

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
          ...this.privateRelayMailboxFields(chatId),
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
            sha256: result.sha256,
          },
        });
        const senderId = authStore.getState().user?.id;
        if (senderId) {
          this.scheduleUploadedMediaLineSync({
            chatId,
            tempId,
            senderId,
            msgType: 'video_note',
            content: fullUrl,
            replyToId,
            media: [{
              kind: 'video_note',
              url: fullUrl,
              sha256: result.sha256,
              sizeBytes: result.file_size,
              mimeType: result.mime_type,
              localUri: payload.uri,
            }],
          });
        }
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
   * Send image: при включённом P2P-first и личке — попытка LINE_PATCH без upload (E2);
   * иначе upload → `send_message` (+ mailbox для лички).
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
        const mediaRoute = resolvePrivateMediaTransportRoute({
          enabled: P2P_FIRST_ENABLED,
          msgType: 'image',
          chat: chatStore.getState().getChatById(chatId),
          currentUserId: authStore.getState().user?.id ?? null,
        });

        if (mediaRoute.mode === 'peer_first') {
          try {
            const peerResult = await this.attemptPeerPrivateMediaBlob({
              chatId,
              recipientUserId: mediaRoute.recipientUserId,
              tempId,
              replyToId,
              localUri: payload.uri,
              msgType: 'image',
              content: payload.caption ?? null,
              mimeTypeForBlob: payload.mimeType ?? null,
            });
            if (peerResult.ok === true) {
              this.logP2PDecision('peer_success', {
                chatId,
                tempId,
                recipientUserId: mediaRoute.recipientUserId,
                msgType: 'image',
              });
              messageStore.getState().updateMessage(chatId, tempId, {
                status: 'sent',
                transport: 'p2p',
              });
              const p2pEventId = messageIdToLineSyncEventId(tempId);
              void new LineSyncEventDao()
                .markSyncState(p2pEventId, LINE_SYNC_SYNC_STATE_P2P_DELIVERED)
                .catch((err) => {
                  console.warn('[TransportService] LineSync p2p_delivered mark failed', err);
                });
              return;
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'image',
              reason: peerResult.reason,
            });
          } catch (peerErr) {
            if (__DEV__) {
              console.warn('[TransportService] peer-first image threw', {
                chatId,
                tempId,
                error: peerErr instanceof Error ? peerErr.message : String(peerErr),
              });
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'image',
              reason: 'unavailable',
              threw: peerErr instanceof Error ? peerErr.message : String(peerErr),
            });
          }
        } else {
          this.logP2PDecision('peer_skipped', {
            chatId,
            tempId,
            reason: mediaRoute.skipReason,
            msgType: 'image',
          });
        }

        this.logP2PDecision('server_fallback', {
          chatId,
          tempId,
          path: 'websocket',
          msgType: 'image',
        });

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
          ...this.privateRelayMailboxFields(chatId),
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
            sha256: result.sha256,
          },
        });
        const senderId = authStore.getState().user?.id;
        if (senderId) {
          this.scheduleUploadedMediaLineSync({
            chatId,
            tempId,
            senderId,
            msgType: 'image',
            content: payload.caption ?? null,
            replyToId,
            media: [{
              kind: 'image',
              url: fullUrl,
              sha256: result.sha256,
              sizeBytes: result.file_size,
              mimeType: result.mime_type,
              localUri: payload.uri,
            }],
          });
        }
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
   * Видео (не кружок): при P2P-first и личке — без upload (E2); иначе upload → `send_message`.
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
        const mediaRoute = resolvePrivateMediaTransportRoute({
          enabled: P2P_FIRST_ENABLED,
          msgType: 'video',
          chat: chatStore.getState().getChatById(chatId),
          currentUserId: authStore.getState().user?.id ?? null,
        });

        if (mediaRoute.mode === 'peer_first') {
          try {
            const peerResult = await this.attemptPeerPrivateMediaBlob({
              chatId,
              recipientUserId: mediaRoute.recipientUserId,
              tempId,
              replyToId,
              localUri: payload.uri,
              msgType: 'video',
              content: payload.caption ?? null,
              mimeTypeForBlob: videoMime,
            });
            if (peerResult.ok === true) {
              this.logP2PDecision('peer_success', {
                chatId,
                tempId,
                recipientUserId: mediaRoute.recipientUserId,
                msgType: 'video',
              });
              messageStore.getState().updateMessage(chatId, tempId, {
                status: 'sent',
                transport: 'p2p',
              });
              const p2pEventId = messageIdToLineSyncEventId(tempId);
              void new LineSyncEventDao()
                .markSyncState(p2pEventId, LINE_SYNC_SYNC_STATE_P2P_DELIVERED)
                .catch((err) => {
                  console.warn('[TransportService] LineSync p2p_delivered mark failed', err);
                });
              return;
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'video',
              reason: peerResult.reason,
            });
          } catch (peerErr) {
            if (__DEV__) {
              console.warn('[TransportService] peer-first video threw', {
                chatId,
                tempId,
                error: peerErr instanceof Error ? peerErr.message : String(peerErr),
              });
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'video',
              reason: 'unavailable',
              threw: peerErr instanceof Error ? peerErr.message : String(peerErr),
            });
          }
        } else {
          this.logP2PDecision('peer_skipped', {
            chatId,
            tempId,
            reason: mediaRoute.skipReason,
            msgType: 'video',
          });
        }

        this.logP2PDecision('server_fallback', {
          chatId,
          tempId,
          path: 'websocket',
          msgType: 'video',
        });

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
          ...this.privateRelayMailboxFields(chatId),
          media: {
            url: fullUrl,
            thumbnail_url: thumbnailUrl,
            width: payload.width ?? result.width ?? undefined,
            height: payload.height ?? result.height ?? undefined,
            duration_ms: resolvedDurationMs || undefined,
            mime_type: result.mime_type,
            file_name: result.file_name,
            file_size: result.file_size,
            sha256: result.sha256,
          },
        });
        const senderId = authStore.getState().user?.id;
        if (senderId) {
          this.scheduleUploadedMediaLineSync({
            chatId,
            tempId,
            senderId,
            msgType: 'video',
            content: payload.caption ?? null,
            replyToId,
            media: [{
              kind: 'video',
              url: fullUrl,
              sha256: result.sha256,
              sizeBytes: result.file_size,
              mimeType: result.mime_type,
              localUri: payload.uri,
            }],
          });
        }
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
        const albumRouteMsgType = items[0]?.kind === 'video' ? 'video' : 'image';
        const mediaRoute = resolvePrivateMediaTransportRoute({
          enabled: P2P_FIRST_ENABLED,
          msgType: albumRouteMsgType,
          chat: chatStore.getState().getChatById(chatId),
          currentUserId: authStore.getState().user?.id ?? null,
        });

        const albumPeerEligible = mediaRoute.mode === 'peer_first';

        if (albumPeerEligible) {
          try {
            const peerResult = await this.attemptPeerPrivateMediaAlbum({
              chatId,
              recipientUserId: mediaRoute.recipientUserId,
              tempId,
              replyToId,
              items,
              caption: payload.caption ?? null,
            });
            if (peerResult.ok === true) {
              this.logP2PDecision('peer_success', {
                chatId,
                tempId,
                recipientUserId: mediaRoute.recipientUserId,
                msgType: 'media_album',
              });
              messageStore.getState().updateMessage(chatId, tempId, {
                status: 'sent',
                transport: 'p2p',
              });
              const p2pEventId = messageIdToLineSyncEventId(tempId);
              void new LineSyncEventDao()
                .markSyncState(p2pEventId, LINE_SYNC_SYNC_STATE_P2P_DELIVERED)
                .catch((err) => {
                  console.warn('[TransportService] LineSync p2p_delivered mark failed', err);
                });
              return;
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'media_album',
              reason: peerResult.reason,
            });
          } catch (peerErr) {
            if (__DEV__) {
              console.warn('[TransportService] peer-first media album threw', {
                chatId,
                tempId,
                error: peerErr instanceof Error ? peerErr.message : String(peerErr),
              });
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'media_album',
              reason: 'unavailable',
              threw: peerErr instanceof Error ? peerErr.message : String(peerErr),
            });
          }
        } else {
          this.logP2PDecision('peer_skipped', {
            chatId,
            tempId,
            reason: mediaRoute.skipReason,
            msgType: 'media_album',
          });
        }

        this.logP2PDecision('server_fallback', {
          chatId,
          tempId,
          path: 'websocket',
          msgType: 'media_album',
        });

        const media = await Promise.all(items.map((item) => this.uploadAlbumMediaItem(item)));
        this.ensureWebSocketConnectedForDispatch('media album dispatch');
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: payload.caption ?? null,
          msg_type: media[0]?.media_type === 'video' ? 'video' : 'image',
          client_temp_id: tempId,
          reply_to_id: replyToId,
          ...this.privateRelayMailboxFields(chatId),
          media,
        });
        const senderId = authStore.getState().user?.id;
        if (senderId) {
          const msgType = media[0]?.media_type === 'video' ? 'video' : 'image';
          this.scheduleUploadedMediaLineSync({
            chatId,
            tempId,
            senderId,
            msgType,
            content: payload.caption ?? null,
            replyToId,
            media: media.map((item, index) => ({
              kind: item.media_type,
              url: item.url,
              sha256: item.sha256,
              sizeBytes: item.file_size,
              mimeType: item.mime_type,
              localUri: items[index]?.uri,
            })),
          });
        }
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
   * Файл: при P2P-first и личке — без upload (E2); иначе upload → `send_message`.
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

        const mediaRoute = resolvePrivateMediaTransportRoute({
          enabled: P2P_FIRST_ENABLED,
          msgType: 'file',
          chat: chatStore.getState().getChatById(chatId),
          currentUserId: authStore.getState().user?.id ?? null,
        });

        if (mediaRoute.mode === 'peer_first') {
          try {
            const peerResult = await this.attemptPeerPrivateMediaBlob({
              chatId,
              recipientUserId: mediaRoute.recipientUserId,
              tempId,
              replyToId,
              localUri: payload.uri,
              msgType: 'file',
              content: payload.name,
              mimeTypeForBlob: mime,
            });
            if (peerResult.ok === true) {
              this.logP2PDecision('peer_success', {
                chatId,
                tempId,
                recipientUserId: mediaRoute.recipientUserId,
                msgType: 'file',
              });
              messageStore.getState().updateMessage(chatId, tempId, {
                status: 'sent',
                transport: 'p2p',
              });
              const p2pEventId = messageIdToLineSyncEventId(tempId);
              void new LineSyncEventDao()
                .markSyncState(p2pEventId, LINE_SYNC_SYNC_STATE_P2P_DELIVERED)
                .catch((err) => {
                  console.warn('[TransportService] LineSync p2p_delivered mark failed', err);
                });
              return;
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'file',
              reason: peerResult.reason,
            });
          } catch (peerErr) {
            if (__DEV__) {
              console.warn('[TransportService] peer-first file threw', {
                chatId,
                tempId,
                error: peerErr instanceof Error ? peerErr.message : String(peerErr),
              });
            }
            this.logP2PDecision('peer_failed', {
              chatId,
              tempId,
              recipientUserId: mediaRoute.recipientUserId,
              msgType: 'file',
              reason: 'unavailable',
              threw: peerErr instanceof Error ? peerErr.message : String(peerErr),
            });
          }
        } else {
          this.logP2PDecision('peer_skipped', {
            chatId,
            tempId,
            reason: mediaRoute.skipReason,
            msgType: 'file',
          });
        }

        this.logP2PDecision('server_fallback', {
          chatId,
          tempId,
          path: 'websocket',
          msgType: 'file',
        });

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
          ...this.privateRelayMailboxFields(chatId),
          media: {
            url: fullUrl,
            file_name: result.file_name,
            file_size: result.file_size,
            mime_type: result.mime_type,
            sha256: result.sha256,
          },
        });
        const senderId = authStore.getState().user?.id;
        if (senderId) {
          this.scheduleUploadedMediaLineSync({
            chatId,
            tempId,
            senderId,
            msgType: 'file',
            content: fileName,
            replyToId,
            media: [{
              kind: 'file',
              url: fullUrl,
              sha256: result.sha256,
              sizeBytes: result.file_size,
              mimeType: result.mime_type,
              localUri: payload.uri,
            }],
          });
        }
      } catch (err) {
        if (__DEV__) {
          console.warn('[TransportService] file upload/send failed, queueing for retry:', {
            chatId,
            tempId,
            uri: payload.uri,
            error: err instanceof Error ? err.message : String(err),
          });
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
