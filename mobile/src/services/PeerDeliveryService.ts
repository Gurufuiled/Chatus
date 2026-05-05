export type PeerDeliveryFailureReason =
  | 'disabled'
  | 'missing_peer'
  | 'not_implemented'
  | 'timeout'
  | 'unavailable';

export type PeerTextDeliveryInput = {
  chatId: string;
  recipientUserId: string;
  content: string;
  tempId: string;
  replyToId?: string | null;
  timeoutMs: number;
};

export type PeerDeliveryResult =
  | { ok: true; transport: 'p2p' }
  | { ok: false; reason: PeerDeliveryFailureReason };

type PromiseFactory = {
  resolve<T>(value: T): Promise<T>;
};

function isDevRuntime(): boolean {
  return Boolean(
    typeof globalThis !== 'undefined' &&
      (globalThis as { __DEV__?: boolean }).__DEV__,
  );
}

class PeerDeliveryServiceClass {
  attemptTextMessage(input: PeerTextDeliveryInput): Promise<PeerDeliveryResult> {
    if (isDevRuntime()) {
      console.log('[PeerDeliveryService] peer_attempt', {
        chatId: input.chatId,
        recipientUserId: input.recipientUserId,
        tempId: input.tempId,
        timeoutMs: input.timeoutMs,
      });
    }

    // TODO(p2p): replace this stub with signaling + WebRTC DataChannel delivery.
    // `timeoutMs` applies when the real peer session attempt is implemented.
    const promiseFactory = (globalThis as unknown as { Promise: PromiseFactory }).Promise;
    return promiseFactory.resolve({ ok: false, reason: 'not_implemented' });
  }
}

export const PeerDeliveryService = new PeerDeliveryServiceClass();
