/**
 * Stateless parsing of inbound signaling payloads for DM relay (no RN / Expo imports).
 */

export type PeerDeliveryFailureReason =
  | 'disabled'
  | 'missing_peer'
  | 'timeout'
  | 'unavailable'
  | 'not_connected';

export type PeerDeliveryResult =
  | { ok: true; transport: 'p2p' }
  | { ok: false; reason: PeerDeliveryFailureReason };

export type DmDeliverPayload = {
  type: 'dm_deliver';
  ack_key: string;
  from_user_id: string;
  chat_id: string;
  content: string;
  temp_id: string;
  reply_to_id: string | null;
  sent_at: number;
};

export type PendingPeerDm = {
  resolve: (result: PeerDeliveryResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function dispatchRawPeerDeliverySignal(
  raw: string,
  pendingDms: Map<string, PendingPeerDm>,
  dmDeliverListeners: ((payload: DmDeliverPayload) => void)[],
): void {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const t = data?.type;
  if (t === 'dm_sent' && typeof data.ack_key === 'string') {
    const pending = pendingDms.get(data.ack_key);
    if (pending) {
      clearTimeout(pending.timer);
      pendingDms.delete(data.ack_key);
      pending.resolve({ ok: true, transport: 'p2p' });
    }
    return;
  }

  if (t === 'dm_fallback' && typeof data.ack_key === 'string') {
    const pending = pendingDms.get(data.ack_key);
    if (pending) {
      clearTimeout(pending.timer);
      pendingDms.delete(data.ack_key);
      pending.resolve({ ok: false, reason: 'unavailable' });
    }
    return;
  }

  if (t === 'dm_deliver') {
    const payload = data as unknown as DmDeliverPayload;
    dmDeliverListeners.forEach((l) => l(payload));
  }
}
