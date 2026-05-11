/**
 * LineSync blob mirror MVP.
 *
 * Stage 7+ sends small/medium blobs over signaling chunks. This is an MVP transport;
 * larger production transfers should move to WebRTC DataChannel.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { authStore } from '../stores/authStore';
import { LineSyncDataChannelService } from './LineSyncDataChannelService';
import { LineSyncService, LINE_SYNC_MVP_NODE_ID } from './LineSyncService';
import { calculateFileSha256, normalizeSha256 } from './MediaHashService';
import { MediaCacheService } from './MediaCacheService';
import {
  parseBlobChunk,
  parseBlobMirrorDown,
  parseBlobRequest,
  parseLineSyncBlobMessage,
  type BlobChunk,
  type BlobMirrorUp,
  type BlobRequest,
} from './lineSyncProtocol';
import { mayServeBlobRequestForPeer } from './lineSyncBlobAcl';
import { SignalingService } from './SignalingService';

const DEFAULT_BLOB_CHUNK_BASE64_CHARS = 64 * 1024;
const MAX_BLOB_CHUNK_BASE64_CHARS = 256 * 1024;
const PENDING_BLOB_TIMEOUT_MS = 30_000;

export type BlobMirrorAnnouncementInput = {
  targetUserId: string;
  lineId: string;
  blobId: string;
  sha256: string;
  expiresAt?: number;
};

export type BlobRequestInput = {
  targetUserId: string;
  lineId: string;
  blobId: string;
  sha256?: string;
  preferredChunkSize?: number;
  /** Chunk assembly progress (same blob request may use signaling or DataChannel). */
  onProgress?: (received: number, total: number) => void;
  signal?: AbortSignal;
};

export type PinLocalBlobInput = {
  lineId: string;
  blobId: string;
  sha256: string;
  localUri: string;
  sizeBytes?: number | null;
  targetUserId?: string;
};

export type RequestBlobResult =
  | { ok: true; localUri: string; fromCache?: boolean }
  | {
      ok: false;
      reason:
        | 'not_connected'
        | 'timeout'
        | 'hash_mismatch'
        | 'write_failed'
        | 'cancelled'
        | 'superseded';
    };

type PendingBlobDownload = {
  lineId: string;
  blobId: string;
  sha256?: string;
  chunks: string[];
  expectedTotal: number | null;
  timer: ReturnType<typeof setTimeout>;
  resolve: (result: RequestBlobResult) => void;
  onProgress?: (received: number, total: number) => void;
  abortCleanup?: () => void;
};

function safeBlobFileName(blobId: string): string {
  return encodeURIComponent(blobId).replace(/%/g, '_');
}

function normalizeBase64ChunkSize(value?: number): number {
  const raw =
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : DEFAULT_BLOB_CHUNK_BASE64_CHARS;
  const capped = Math.min(raw, MAX_BLOB_CHUNK_BASE64_CHARS);
  return capped - (capped % 4);
}

function hashBlobIdForMirrorPick(blobId: string): number {
  let h = 2166136261;
  for (let i = 0; i < blobId.length; i++) {
    h ^= blobId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Prefer peers with an open LineSync DC; otherwise stable sort + hash spread by blobId. */
function pickPeerMirrorUserId(
  locations: Array<{ type: string; user_id?: string }>,
  blobId: string,
): string | null {
  const peers = locations.filter(
    (location) =>
      location.type === 'peer' &&
      typeof location.user_id === 'string' &&
      location.user_id.length > 0
  ) as Array<{ type: 'peer'; user_id: string }>;
  if (peers.length === 0) return null;
  const sorted = [...peers].sort((a, b) => a.user_id.localeCompare(b.user_id));
  const online = sorted.filter((p) => LineSyncDataChannelService.isOpen(p.user_id));
  const pool = online.length > 0 ? online : sorted;
  const idx = hashBlobIdForMirrorPick(blobId) % pool.length;
  return pool[idx]!.user_id;
}

class LineSyncBlobServiceClass {
  private readonly blobRequestListeners = new Set<(request: BlobRequest, fromUserId: string) => void>();
  private readonly blobChunkListeners = new Set<(chunk: BlobChunk, fromUserId: string) => void>();
  private readonly pendingDownloads = new Map<string, PendingBlobDownload>();

  constructor() {
    SignalingService.addLineSyncRawListener((raw) => {
      void this.handleRawLineSync(raw, 'signaling');
    });
    LineSyncDataChannelService.onMessage((raw, fromUserId) => {
      void this.handleDataChannelMessage(raw, fromUserId);
    });
  }

  onBlobRequest(
    /** Invoked only after we served the request (all chunks sent to the peer). */
    listener: (request: BlobRequest, fromUserId: string) => void,
  ): () => void {
    this.blobRequestListeners.add(listener);
    return () => this.blobRequestListeners.delete(listener);
  }

  onBlobChunk(listener: (chunk: BlobChunk, fromUserId: string) => void): () => void {
    this.blobChunkListeners.add(listener);
    return () => this.blobChunkListeners.delete(listener);
  }

  async pinLocalBlob(input: PinLocalBlobInput): Promise<boolean> {
    const sha256 = normalizeSha256(input.sha256);
    if (!sha256) return false;

    const calculatedSha = await calculateFileSha256(input.localUri).catch(() => null);
    if (calculatedSha && calculatedSha !== sha256) {
      return false;
    }

    const info = await FileSystem.getInfoAsync(input.localUri).catch(() => null);
    if (!info?.exists || info.isDirectory) {
      return false;
    }

    await MediaCacheService.add(input.blobId, input.localUri, input.sizeBytes ?? info.size ?? 1);
    await LineSyncService.mergePeerBlobLocation({
      lineId: input.lineId,
      blobId: input.blobId,
      sha256,
      nodeId: LINE_SYNC_MVP_NODE_ID,
      userId: authStore.getState().user?.id,
      caps: ['blob_request'],
    });

    if (input.targetUserId) {
      await this.announceMirror({
        targetUserId: input.targetUserId,
        lineId: input.lineId,
        blobId: input.blobId,
        sha256,
      });
    }

    return true;
  }

  async getPinnedBlobPath(blobId: string): Promise<string | null> {
    return MediaCacheService.getPath(blobId);
  }

  async announceMirror(input: BlobMirrorAnnouncementInput): Promise<boolean> {
    const userId = authStore.getState().user?.id;
    if (!userId) return false;

    try {
      await SignalingService.whenConnected(15000);
    } catch {
      return false;
    }

    const message: BlobMirrorUp = {
      type: 'BLOB_MIRROR_UP',
      line_id: input.lineId,
      blob_id: input.blobId,
      sha256: input.sha256,
      node_id: LINE_SYNC_MVP_NODE_ID,
      user_id: userId,
      ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
    };
    if (LineSyncDataChannelService.sendToPeer(input.targetUserId, message)) {
      return true;
    }
    SignalingService.sendLineSync(input.targetUserId, message);
    return true;
  }

  async requestBlob(input: BlobRequestInput): Promise<boolean> {
    const userId = authStore.getState().user?.id;
    if (!userId) return false;

    try {
      await SignalingService.whenConnected(15000);
    } catch {
      return false;
    }

    const message: BlobRequest = {
      type: 'BLOB_REQUEST',
      line_id: input.lineId,
      blob_id: input.blobId,
      requester_node_id: LINE_SYNC_MVP_NODE_ID,
      requester_user_id: userId,
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      ...(input.preferredChunkSize ? { preferred_chunk_size: input.preferredChunkSize } : {}),
    };

    const dataChannelReady = await LineSyncDataChannelService.ensureOpen(input.targetUserId).catch(
      () => false
    );
    if (dataChannelReady && LineSyncDataChannelService.sendToPeer(input.targetUserId, message)) {
      return true;
    }

    SignalingService.sendLineSync(input.targetUserId, message);
    return true;
  }

  async requestBlobAndWait(input: BlobRequestInput, timeoutMs = PENDING_BLOB_TIMEOUT_MS): Promise<RequestBlobResult> {
    return new Promise<RequestBlobResult>((resolve) => {
      if (input.signal?.aborted) {
        resolve({ ok: false, reason: 'cancelled' });
        return;
      }

      const key = this.pendingKey(input.lineId, input.blobId);
      const existing = this.pendingDownloads.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        existing.abortCleanup?.();
        existing.resolve({ ok: false, reason: 'superseded' });
      }

      const timer = setTimeout(() => {
        const pending = this.pendingDownloads.get(key);
        if (!pending) return;
        pending.abortCleanup?.();
        this.pendingDownloads.delete(key);
        resolve({ ok: false, reason: 'timeout' });
      }, timeoutMs);

      let abortCleanup: (() => void) | undefined;
      const signal = input.signal;
      if (signal) {
        const onAbort = () => {
          const pending = this.pendingDownloads.get(key);
          if (!pending) return;
          clearTimeout(pending.timer);
          pending.abortCleanup?.();
          this.pendingDownloads.delete(key);
          resolve({ ok: false, reason: 'cancelled' });
        };
        if (signal.aborted) {
          queueMicrotask(onAbort);
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
          abortCleanup = () => signal.removeEventListener('abort', onAbort);
        }
      }

      this.pendingDownloads.set(key, {
        lineId: input.lineId,
        blobId: input.blobId,
        sha256: input.sha256,
        chunks: [],
        expectedTotal: null,
        timer,
        resolve,
        onProgress: input.onProgress,
        abortCleanup,
      });

      void this.requestBlob(input).then((connected) => {
        if (connected) return;
        const pending = this.pendingDownloads.get(key);
        if (!pending) return;
        clearTimeout(pending.timer);
        pending.abortCleanup?.();
        this.pendingDownloads.delete(key);
        pending.resolve({ ok: false, reason: 'not_connected' });
      });
    });
  }

  async requestBlobFromKnownMirror(
    lineId: string,
    blobId: string,
    timeoutMs = PENDING_BLOB_TIMEOUT_MS,
    options?: {
      onProgress?: (received: number, total: number) => void;
      signal?: AbortSignal;
    },
  ): Promise<RequestBlobResult> {
    const existingPath = await MediaCacheService.getPath(blobId);
    if (existingPath) return { ok: true, localUri: existingPath, fromCache: true };

    const blobRef = await LineSyncService.findBlobRef(lineId, blobId);
    const mirrorUserId = blobRef ? pickPeerMirrorUserId(blobRef.locations, blobId) : null;
    if (!blobRef || !mirrorUserId) {
      return { ok: false, reason: 'not_connected' };
    }

    return this.requestBlobAndWait(
      {
        targetUserId: mirrorUserId,
        lineId,
        blobId,
        sha256: blobRef.sha256,
        onProgress: options?.onProgress,
        signal: options?.signal,
      },
      timeoutMs
    );
  }

  async sendMirrorDown(targetUserId: string, lineId: string, blobId: string): Promise<boolean> {
    try {
      await SignalingService.whenConnected(15000);
    } catch {
      return false;
    }
    const message = {
      type: 'BLOB_MIRROR_DOWN',
      line_id: lineId,
      blob_id: blobId,
      node_id: LINE_SYNC_MVP_NODE_ID,
    } as const;
    if (LineSyncDataChannelService.sendToPeer(targetUserId, message)) {
      return true;
    }
    SignalingService.sendLineSync(targetUserId, message);
    return true;
  }

  private async handleDataChannelMessage(raw: string, fromUserId: string): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    await this.handleBlobMessage(message, fromUserId, 'datachannel');
  }

  private async handleRawLineSync(raw: string, source: 'signaling' | 'datachannel'): Promise<void> {
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const fromUserId = typeof envelope.from_user_id === 'string' ? envelope.from_user_id : null;
    if (!fromUserId) return;

    await this.handleBlobMessage(envelope.message, fromUserId, source);
  }

  private async handleBlobMessage(
    rawMessage: unknown,
    fromUserId: string,
    source: 'signaling' | 'datachannel',
  ): Promise<void> {
    const parsed = parseLineSyncBlobMessage(rawMessage);
    if (!parsed.ok) return;

    const message = parsed.value;
    if (message.type === 'BLOB_MIRROR_UP' || message.type === 'BLOB_ANNOUNCE') {
      await LineSyncService.mergePeerBlobLocation({
        lineId: message.line_id,
        blobId: message.blob_id,
        sha256: message.sha256,
        nodeId: message.node_id,
        userId: message.user_id,
        caps: ['blob_request'],
      });
      return;
    }

    if (message.type === 'BLOB_MIRROR_DOWN') {
      const down = parseBlobMirrorDown(message);
      if (down.ok) {
        await LineSyncService.removePeerBlobLocation({
          lineId: down.value.line_id,
          blobId: down.value.blob_id,
          nodeId: down.value.node_id,
        });
      }
      return;
    }

    if (message.type === 'BLOB_REQUEST') {
      const request = parseBlobRequest(message);
      if (request.ok) {
        const served = await this.tryServeBlobRequest(request.value, fromUserId, source);
        if (served) {
          this.blobRequestListeners.forEach((listener) => listener(request.value, fromUserId));
        }
      }
      return;
    }

    if (message.type === 'BLOB_CHUNK') {
      const chunk = parseBlobChunk(message);
      if (chunk.ok) {
        await this.handleBlobChunk(chunk.value);
        this.blobChunkListeners.forEach((listener) => listener(chunk.value, fromUserId));
      }
    }
  }

  private pendingKey(lineId: string, blobId: string): string {
    return `${lineId}:${blobId}`;
  }

  private async tryServeBlobRequest(
    request: BlobRequest,
    requesterFromEnvelope: string,
    source: 'signaling' | 'datachannel',
  ): Promise<boolean> {
    if (request.requester_user_id !== requesterFromEnvelope) return false;

    const blobRef = await LineSyncService.findBlobRef(request.line_id, request.blob_id);
    if (!blobRef) return false;

    const refSha = normalizeSha256(blobRef.sha256);
    const reqSha = normalizeSha256(request.sha256);
    if (refSha && reqSha && refSha !== reqSha) return false;

    if (!mayServeBlobRequestForPeer(request.line_id, requesterFromEnvelope)) return false;

    const localPath = await MediaCacheService.getPath(request.blob_id);
    if (!localPath) return false;

    const actualSha = await calculateFileSha256(localPath).catch(() => null);
    const canonicalSha = refSha ?? reqSha;
    const sha256 = actualSha ?? canonicalSha;
    if (!sha256 || (canonicalSha && actualSha && canonicalSha !== actualSha)) {
      return false;
    }

    const base64 = await FileSystem.readAsStringAsync(localPath, {
      encoding: FileSystem.EncodingType.Base64,
    }).catch(() => null);
    if (!base64) return false;

    const chunkSize = normalizeBase64ChunkSize(request.preferred_chunk_size);
    const totalChunks = Math.max(1, Math.ceil(base64.length / chunkSize));
    for (let i = 0; i < totalChunks; i += 1) {
      const chunk: BlobChunk = {
        type: 'BLOB_CHUNK',
        line_id: request.line_id,
        blob_id: request.blob_id,
        sha256,
        node_id: LINE_SYNC_MVP_NODE_ID,
        chunk_index: i,
        total_chunks: totalChunks,
        bytes_base64: base64.slice(i * chunkSize, (i + 1) * chunkSize),
      };
      if (
        source === 'datachannel' &&
        LineSyncDataChannelService.sendToPeer(requesterFromEnvelope, chunk)
      ) {
        continue;
      }
      SignalingService.sendLineSync(requesterFromEnvelope, chunk);
    }
    return true;
  }

  private async handleBlobChunk(chunk: BlobChunk): Promise<void> {
    const key = this.pendingKey(chunk.line_id, chunk.blob_id);
    const pending = this.pendingDownloads.get(key);
    if (!pending) return;
    if (chunk.total_chunks < 1 || chunk.chunk_index < 0 || chunk.chunk_index >= chunk.total_chunks) {
      return;
    }
    if (pending.expectedTotal != null && pending.expectedTotal !== chunk.total_chunks) {
      return;
    }
    pending.expectedTotal = chunk.total_chunks;
    pending.chunks[chunk.chunk_index] = chunk.bytes_base64;

    let received = 0;
    for (let i = 0; i < chunk.total_chunks; i += 1) {
      const part = pending.chunks[i];
      if (typeof part === 'string' && part.length > 0) received += 1;
    }
    pending.onProgress?.(received, chunk.total_chunks);

    const complete =
      pending.chunks.length === chunk.total_chunks &&
      pending.chunks.every((item) => typeof item === 'string' && item.length > 0);
    if (!complete) return;

    clearTimeout(pending.timer);
    pending.abortCleanup?.();
    this.pendingDownloads.delete(key);

    const localUri = await this.writeCompletedBlob(pending, chunk.sha256);
    pending.resolve(localUri);
  }

  private async writeCompletedBlob(
    pending: PendingBlobDownload,
    chunkSha256: string,
  ): Promise<RequestBlobResult> {
    const expectedSha = normalizeSha256(pending.sha256) ?? normalizeSha256(chunkSha256);
    if (!expectedSha) {
      return { ok: false, reason: 'hash_mismatch' };
    }

    const dir = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}linesync-blobs/`;
    if (!dir || dir === 'linesync-blobs/') {
      return { ok: false, reason: 'write_failed' };
    }

    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
      const localUri = `${dir}${safeBlobFileName(pending.blobId)}`;
      await FileSystem.writeAsStringAsync(localUri, pending.chunks.join(''), {
        encoding: FileSystem.EncodingType.Base64,
      });

      const actualSha = await calculateFileSha256(localUri).catch(() => null);
      if (actualSha !== expectedSha) {
        await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
        return { ok: false, reason: 'hash_mismatch' };
      }

      const info = await FileSystem.getInfoAsync(localUri).catch(() => null);
      await MediaCacheService.add(pending.blobId, localUri, info?.exists ? info.size ?? 1 : 1);
      await LineSyncService.mergePeerBlobLocation({
        lineId: pending.lineId,
        blobId: pending.blobId,
        sha256: expectedSha,
        nodeId: LINE_SYNC_MVP_NODE_ID,
        userId: authStore.getState().user?.id,
        caps: ['blob_request'],
      });

      return { ok: true, localUri, fromCache: false };
    } catch {
      return { ok: false, reason: 'write_failed' };
    }
  }
}

export const LineSyncBlobService = new LineSyncBlobServiceClass();
