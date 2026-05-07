/**
 * WebRTC signaling (звонки) и relay личных текстов (dm_*): один WebSocket на порт 4002.
 */

import { getSignalingUrl } from '../config';
import { authStore } from '../stores/authStore';

export type SignalingEventHandlers = {
  onOffer?: (fromUserId: string, sdp: RTCSessionDescriptionInit, callType?: 'audio' | 'video') => void;
  onAnswer?: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void;
  onIceCandidate?: (fromUserId: string, candidate: RTCIceCandidateInit | null) => void;
  onCallCancel?: (fromUserId: string) => void;
  onCallDecline?: (fromUserId: string) => void;
  onCallEnd?: (fromUserId: string) => void;
  onCallBusy?: (fromUserId: string) => void;
  onError?: (error: string | Error) => void;
};

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

type SignalingMessage = {
  type: string;
  target_user_id?: string;
  from_user_id?: string;
  sdp?: string | RTCSessionDescriptionInit;
  offer?: string | RTCSessionDescriptionInit;
  answer?: string | RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
  call_type?: 'audio' | 'video';
  code?: string;
  message?: string;
  token?: string;
  [key: string]: unknown;
};

class SignalingServiceClass {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private handlers: SignalingEventHandlers = {};
  private listeners = new Set<SignalingEventHandlers>();
  private whenConnectedResolvers: Array<() => void> = [];
  /** Raw JSON frames from server for dm_sent / dm_fallback / dm_deliver (same socket as calls). */
  private peerDeliveryRawListeners = new Set<(raw: string) => void>();
  /** Fired when signaling socket closes (reconnect may follow). */
  private socketCloseListeners = new Set<() => void>();

  setHandlers(handlers: SignalingEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  addListener(handlers: SignalingEventHandlers): () => void {
    this.listeners.add(handlers);
    return () => {
      this.listeners.delete(handlers);
    };
  }

  /** Subscribe to inbound DM relay frames (same connection as WebRTC signaling). */
  addPeerDeliveryRawListener(listener: (raw: string) => void): () => void {
    this.peerDeliveryRawListeners.add(listener);
    return () => this.peerDeliveryRawListeners.delete(listener);
  }

  /** Subscribe to socket close (pending DM sends should fail). */
  addSocketCloseListener(listener: () => void): () => void {
    this.socketCloseListeners.add(listener);
    return () => this.socketCloseListeners.delete(listener);
  }

  private notifySocketClose(): void {
    this.socketCloseListeners.forEach((fn) => fn());
  }

  private emit<K extends keyof SignalingEventHandlers>(
    key: K,
    ...args: Parameters<NonNullable<SignalingEventHandlers[K]>>
  ): void {
    const primary = this.handlers[key];
    if (typeof primary === 'function') {
      (primary as (...innerArgs: Parameters<NonNullable<SignalingEventHandlers[K]>>) => void)(
        ...args
      );
    }

    this.listeners.forEach((listener) => {
      const handler = listener[key];
      if (typeof handler === 'function') {
        (handler as (...innerArgs: Parameters<NonNullable<SignalingEventHandlers[K]>>) => void)(
          ...args
        );
      }
    });
  }

  connect(): void {
    const token = authStore.getState().accessToken;
    if (!token) {
      this.handlers.onError?.(new Error('No access token for signaling'));
      return;
    }

    this.manualDisconnect = false;
    this.doConnect(token);
  }

  /** Force new socket with current token (e.g. after access token refresh). */
  reconnect(): void {
    const token = authStore.getState().accessToken;
    if (!token) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.manualDisconnect = true;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempt = 0;
    this.manualDisconnect = false;
    this.doConnect(token);
  }

  private doConnect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    const baseUrl = getSignalingUrl();
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = baseUrl + sep + 'token=' + encodeURIComponent(token);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      for (const resolve of this.whenConnectedResolvers) resolve();
      this.whenConnectedResolvers = [];
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.notifySocketClose();
      if (!this.manualDisconnect && authStore.getState().accessToken) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.handlers.onError?.(new Error('Signaling WebSocket error'));
    };
  }

  private handleMessage(raw: string | Blob): void {
    let data: string;
    if (typeof raw === 'string') {
      data = raw;
    } else {
      return;
    }

    let msg: SignalingMessage;
    try {
      msg = JSON.parse(data) as SignalingMessage;
    } catch {
      return;
    }

    const type = msg?.type;
    const fromUserId = msg?.from_user_id as string | undefined;

    if (!type) return;

    if (type === 'dm_sent' || type === 'dm_fallback' || type === 'dm_deliver') {
      this.peerDeliveryRawListeners.forEach((listener) => listener(data));
      return;
    }

    switch (type) {
      case 'offer':
        if (fromUserId && (msg.offer != null || msg.sdp != null)) {
          const sdpInit: RTCSessionDescriptionInit =
            typeof (msg.offer ?? msg.sdp) === 'string'
              ? { type: 'offer', sdp: String(msg.offer ?? msg.sdp) }
              : ((msg.offer ?? msg.sdp) as RTCSessionDescriptionInit);
          this.emit('onOffer', fromUserId, sdpInit, msg.call_type);
        }
        break;
      case 'answer':
        if (fromUserId && (msg.answer != null || msg.sdp != null)) {
          const sdpInit: RTCSessionDescriptionInit =
            typeof (msg.answer ?? msg.sdp) === 'string'
              ? { type: 'answer', sdp: String(msg.answer ?? msg.sdp) }
              : ((msg.answer ?? msg.sdp) as RTCSessionDescriptionInit);
          this.emit('onAnswer', fromUserId, sdpInit);
        }
        break;
      case 'ice':
      case 'ice_candidate':
        if (fromUserId) {
          this.emit('onIceCandidate', fromUserId, msg.candidate ?? null);
        }
        break;
      case 'call_cancel':
        if (fromUserId) this.emit('onCallCancel', fromUserId);
        break;
      case 'call_decline':
        if (fromUserId) this.emit('onCallDecline', fromUserId);
        break;
      case 'call_end':
        if (fromUserId) this.emit('onCallEnd', fromUserId);
        break;
      case 'call_busy':
        if (fromUserId) this.emit('onCallBusy', fromUserId);
        break;
      case 'error':
        this.emit(
          'onError',
          (msg.message as string) ?? (msg.code as string) ?? 'Signaling error'
        );
        break;
      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, this.reconnectAttempt),
      BACKOFF_MAX_MS
    );
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const token = authStore.getState().accessToken;
      if (!this.manualDisconnect && token) {
        this.doConnect(token);
      }
    }, delay);
  }

  disconnect(): void {
    this.manualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempt = 0;
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(data));
  }

  private sendEvent(event: string, data: Record<string, unknown>): void {
    this.send({ event, data });
  }

  sendOffer(
    targetUserId: string,
    sdp: RTCSessionDescriptionInit,
    callType: 'audio' | 'video' = 'audio'
  ): void {
    this.sendEvent('offer', {
      target_user_id: targetUserId,
      call_type: callType,
      offer: {
        type: 'offer',
        sdp: typeof sdp === 'object' && sdp?.sdp != null ? sdp.sdp : '',
      },
    });
  }

  sendAnswer(targetUserId: string, sdp: RTCSessionDescriptionInit): void {
    this.sendEvent('answer', {
      target_user_id: targetUserId,
      answer: {
        type: 'answer',
        sdp: typeof sdp === 'object' && sdp?.sdp != null ? sdp.sdp : '',
      },
    });
  }

  sendIceCandidate(
    targetUserId: string,
    candidate: RTCIceCandidateInit | null
  ): void {
    this.sendEvent('ice', {
      target_user_id: targetUserId,
      candidate: candidate ?? null,
    });
  }

  sendCallCancel(targetUserId: string): void {
    this.sendEvent('call_cancel', { target_user_id: targetUserId });
  }

  sendCallDecline(targetUserId: string): void {
    this.sendEvent('call_decline', { target_user_id: targetUserId });
  }

  sendCallEnd(targetUserId: string): void {
    this.sendEvent('call_end', { target_user_id: targetUserId });
  }

  sendCallBusy(targetUserId: string): void {
    this.sendEvent('call_busy', { target_user_id: targetUserId });
  }

  sendDmSend(body: {
    ack_key: string;
    recipient_user_id: string;
    chat_id: string;
    content: string;
    temp_id: string;
    reply_to_id?: string | null;
    timeout_ms: number;
  }): void {
    this.sendEvent('dm_send', body as unknown as Record<string, unknown>);
  }

  sendDmAck(ackKey: string): void {
    this.sendEvent('dm_ack', { ack_key: ackKey });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Resolves when signaling WebSocket is OPEN. Call connect() first if not connected. */
  whenConnected(timeoutMs = 15000): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = this.whenConnectedResolvers.indexOf(r);
        if (idx >= 0) this.whenConnectedResolvers.splice(idx, 1);
        reject(new Error('Signaling connection timeout'));
      }, timeoutMs);

      const r = () => {
        clearTimeout(t);
        resolve();
      };
      this.whenConnectedResolvers.push(r);

      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    });
  }
}

export const SignalingService = new SignalingServiceClass();
