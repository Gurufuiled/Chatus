/**
 * WebSocket service for realtime messaging.
 * Uses native WebSocket API. Connects to port 4001, auths with JWT, auto-reconnects.
 */

import { getWebSocketUrl } from '../config';
import { authStore } from '../stores/authStore';

type WebSocketMessage = {
  type: string;
  [key: string]: unknown;
};

export type WebSocketEventHandlers = {
  onNewMessage?: (payload: WebSocketMessage) => void;
  onMailboxDeliver?: (payload: WebSocketMessage) => void;
  onChannelPost?: (payload: WebSocketMessage) => void;
  onDiscussionMessage?: (payload: WebSocketMessage) => void;
  onMessageReactionsUpdated?: (payload: WebSocketMessage) => void;
  onChannelPostCommentCountUpdated?: (payload: WebSocketMessage) => void;
  onMessageAck?: (payload: WebSocketMessage) => void;
  onMessageDeleted?: (payload: WebSocketMessage) => void;
  onChatDeleted?: (payload: WebSocketMessage) => void;
  onChatPinnedMessageUpdated?: (payload: WebSocketMessage) => void;
  onLineTail?: (payload: WebSocketMessage) => void;
  onTyping?: (payload: WebSocketMessage) => void;
  onPresence?: (payload: WebSocketMessage) => void;
  onGroupCallStarted?: (payload: WebSocketMessage) => void;
  onGroupCallEnded?: (payload: WebSocketMessage) => void;
  onGroupCallParticipants?: (payload: WebSocketMessage) => void;
  onError?: (payload: WebSocketMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

class WebSocketServiceClass {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private handlers: WebSocketEventHandlers = {};

  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(): void {
    const token = authStore.getState().accessToken;
    if (!token) {
      return;
    }

    this.manualDisconnect = false;
    this.doConnect(token);
  }

  reconnect(): void {
    const token = authStore.getState().accessToken;
    if (!token) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.manualDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempt = 0;
    this.manualDisconnect = false;
    this.doConnect(token);
  }

  private doConnect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const baseUrl = getWebSocketUrl();
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = baseUrl + sep + 'token=' + encodeURIComponent(token);
    const socket = new WebSocket(url);
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.handlers.onConnected?.();
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    socket.onclose = (e) => {
      const target = e.target as WebSocket;
      // Ignore close events from a socket we already replaced (reconnect / new connection).
      if (target !== this.ws) {
        return;
      }
      this.ws = null;
      this.handlers.onDisconnected?.();
      if (!this.manualDisconnect && authStore.getState().accessToken) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      // Error details come via onclose; avoid duplicate handling
    };
  }

  private handleMessage(raw: string | Blob): void {
    let data: string;
    if (typeof raw === 'string') {
      data = raw;
    } else {
      // Blob - would need async read; for text frames WebSocket usually gives string
      return;
    }

    let msg: WebSocketMessage;
    try {
      msg = JSON.parse(data) as WebSocketMessage;
    } catch {
      return;
    }

    const type = msg?.type;
    if (!type) return;

    switch (type) {
      case 'message':
      case 'new_message':
        this.handlers.onNewMessage?.(msg);
        break;
      case 'mailbox_deliver':
        this.handlers.onMailboxDeliver?.(msg);
        break;
      case 'channel_post':
        this.handlers.onChannelPost?.(msg);
        break;
      case 'discussion_message':
        this.handlers.onDiscussionMessage?.(msg);
        break;
      case 'message_reactions_updated':
        this.handlers.onMessageReactionsUpdated?.(msg);
        break;
      case 'channel_post_comment_count_updated':
        this.handlers.onChannelPostCommentCountUpdated?.(msg);
        break;
      case 'ack':
      case 'message_ack':
        this.handlers.onMessageAck?.(msg);
        break;
      case 'message_deleted':
        this.handlers.onMessageDeleted?.(msg);
        break;
      case 'chat_deleted':
        this.handlers.onChatDeleted?.(msg);
        break;
      case 'chat_pinned_message_updated':
        this.handlers.onChatPinnedMessageUpdated?.(msg);
        break;
      case 'line_tail':
        this.handlers.onLineTail?.(msg);
        break;
      case 'typing':
        this.handlers.onTyping?.(msg);
        break;
      case 'presence':
        this.handlers.onPresence?.(msg);
        break;
      case 'group_call_started':
        this.handlers.onGroupCallStarted?.(msg);
        break;
      case 'group_call_ended':
        this.handlers.onGroupCallEnded?.(msg);
        break;
      case 'group_call_participants':
        this.handlers.onGroupCallParticipants?.(msg);
        break;
      case 'error':
        this.handlers.onError?.(msg);
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
    }

    this.reconnectAttempt = 0;
  }

  send(data: Record<string, unknown> | string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws.send(payload);
  }

  /** Send event in NestJS format: { event, data } */
  sendEvent(event: string, data: Record<string, unknown>): void {
    this.send({ event, data });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const WebSocketService = new WebSocketServiceClass();
