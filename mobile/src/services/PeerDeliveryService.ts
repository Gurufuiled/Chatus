/**
 * P2P-first 1:1 text: relay via signaling WebSocket (port 4002), same Nest `{ event, data }` wire format as SignalingService.
 */

import { getSignalingUrl } from '../config';
import { authStore } from '../stores/authStore';

import {
  dispatchRawPeerDeliverySignal,
  type DmDeliverPayload,
  type PendingPeerDm,
  type PeerDeliveryResult,
} from './peerDeliverySignal';

export type {
  PeerDeliveryFailureReason,
  PeerDeliveryResult,
  DmDeliverPayload,
  PendingPeerDm,
} from './peerDeliverySignal';

export { dispatchRawPeerDeliverySignal } from './peerDeliverySignal';

export type PeerTextDeliveryInput = {
  chatId: string;
  recipientUserId: string;
  content: string;
  tempId: string;
  replyToId?: string | null;
  timeoutMs: number;
};

class PeerDeliveryServiceClass {
  private ws: WebSocket | null = null;
  private pendingDms = new Map<string, PendingPeerDm>();
  private dmDeliverListeners: ((payload: DmDeliverPayload) => void)[] = [];
  private connectPromise: Promise<void> | null = null;

  onDmDeliver(listener: (payload: DmDeliverPayload) => void): () => void {
    this.dmDeliverListeners.push(listener);
    return () => {
      this.dmDeliverListeners = this.dmDeliverListeners.filter((l) => l !== listener);
    };
  }

  private dispatchSignalMessage(raw: string): void {
    dispatchRawPeerDeliverySignal(raw, this.pendingDms, this.dmDeliverListeners);
  }

  private ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const token = authStore.getState().accessToken;
      if (!token) {
        this.connectPromise = null;
        reject(new Error('No auth token'));
        return;
      }
      const baseUrl = getSignalingUrl();
      const sep = baseUrl.includes('?') ? '&' : '?';
      const url = `${baseUrl}${sep}token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);

      const connectTimeout = setTimeout(() => {
        ws.close();
        this.connectPromise = null;
        reject(new Error('Signaling connection timeout'));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        this.ws = ws;
        this.connectPromise = null;
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
        this.connectPromise = null;
        reject(new Error('Signaling WS error'));
      };

      ws.onclose = () => {
        this.ws = null;
        this.connectPromise = null;
        for (const [key, pending] of this.pendingDms) {
          clearTimeout(pending.timer);
          pending.resolve({ ok: false, reason: 'unavailable' });
          this.pendingDms.delete(key);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          this.dispatchSignalMessage(event.data);
        }
      };
    });

    return this.connectPromise;
  }

  async attemptTextMessage(input: PeerTextDeliveryInput): Promise<PeerDeliveryResult> {
    try {
      await this.ensureConnected();
    } catch {
      return { ok: false, reason: 'not_connected' };
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { ok: false, reason: 'not_connected' };
    }

    const ackKey = `${input.tempId}-${Date.now()}`;

    return new Promise<PeerDeliveryResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingDms.delete(ackKey);
        resolve({ ok: false, reason: 'timeout' });
      }, input.timeoutMs);

      this.pendingDms.set(ackKey, { resolve, timer });

      this.ws!.send(
        JSON.stringify({
          event: 'dm_send',
          data: {
            ack_key: ackKey,
            recipient_user_id: input.recipientUserId,
            chat_id: input.chatId,
            content: input.content,
            temp_id: input.tempId,
            reply_to_id: input.replyToId ?? null,
            timeout_ms: input.timeoutMs,
          },
        }),
      );
    });
  }

  sendDmAck(ackKey: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'dm_ack', data: { ack_key: ackKey } }));
    }
  }
}

export const PeerDeliveryService = new PeerDeliveryServiceClass();
