/**
 * P2P-first 1:1 text relay через тот же signaling WebSocket, что и звонки (`SignalingService`).
 */

import { SignalingService } from './SignalingService';

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
  private pendingDms = new Map<string, PendingPeerDm>();
  private dmDeliverListeners: ((payload: DmDeliverPayload) => void)[] = [];

  constructor() {
    SignalingService.addPeerDeliveryRawListener((raw) => {
      dispatchRawPeerDeliverySignal(raw, this.pendingDms, this.dmDeliverListeners);
    });
    SignalingService.addSocketCloseListener(() => {
      for (const [key, pending] of this.pendingDms) {
        clearTimeout(pending.timer);
        pending.resolve({ ok: false, reason: 'unavailable' });
        this.pendingDms.delete(key);
      }
    });
  }

  onDmDeliver(listener: (payload: DmDeliverPayload) => void): () => void {
    this.dmDeliverListeners.push(listener);
    return () => {
      this.dmDeliverListeners = this.dmDeliverListeners.filter((l) => l !== listener);
    };
  }

  private async ensureConnected(): Promise<void> {
    await SignalingService.whenConnected(15000);
  }

  async attemptTextMessage(input: PeerTextDeliveryInput): Promise<PeerDeliveryResult> {
    try {
      await this.ensureConnected();
    } catch {
      return { ok: false, reason: 'not_connected' };
    }

    if (!SignalingService.isConnected()) {
      return { ok: false, reason: 'not_connected' };
    }

    const ackKey = `${input.tempId}:${input.recipientUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

    return new Promise<PeerDeliveryResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingDms.delete(ackKey);
        resolve({ ok: false, reason: 'timeout' });
      }, input.timeoutMs);

      this.pendingDms.set(ackKey, { resolve, timer });

      SignalingService.sendDmSend({
        ack_key: ackKey,
        recipient_user_id: input.recipientUserId,
        chat_id: input.chatId,
        content: input.content,
        temp_id: input.tempId,
        reply_to_id: input.replyToId ?? null,
        timeout_ms: input.timeoutMs,
      });
    });
  }

  sendDmAck(ackKey: string): void {
    SignalingService.sendDmAck(ackKey);
  }
}

export const PeerDeliveryService = new PeerDeliveryServiceClass();
