import { getAccessToken } from '@/services/apiClient';
import { isUiPreviewMode } from '@/dev/uiPreview';

type WsEventHandler = (payload: Record<string, unknown>) => void;

type WsHandlers = {
  onMessageDeleted?: WsEventHandler;
  onChatPinnedMessageUpdated?: WsEventHandler;
  onNewMessage?: WsEventHandler;
  onMessageAck?: WsEventHandler;
  onMessageReactionsUpdated?: WsEventHandler;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnecting?: () => void;
};

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

class WsClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private handlers: WsHandlers = {};

  setHandlers(handlers: WsHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const token = getAccessToken();
    if (!token || isUiPreviewMode()) return;

    this.manualDisconnect = false;
    this.handlers.onConnecting?.();
    this.openSocket(token);
  }

  disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.reconnectAttempt = 0;
  }

  reconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.reconnectAttempt = 0;
    this.manualDisconnect = false;

    const token = getAccessToken();
    if (!token || isUiPreviewMode()) return;

    this.handlers.onConnecting?.();
    this.openSocket(token);
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  sendEvent(event: string, data: Record<string, unknown>) {
    if (!this.isConnected()) return false;
    this.socket!.send(JSON.stringify({ event, data }));
    return true;
  }

  sendMessageAck(
    chatId: string,
    messageId: string,
    status: 'delivered' | 'read',
  ) {
    return this.sendEvent('ack', {
      chat_id: chatId,
      message_id: messageId,
      status,
    });
  }

  pinMessage(chatId: string, messageId: string | null) {
    return this.sendEvent('pin_message', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  deleteMessage(chatId: string, messageId: string) {
    return this.sendEvent('delete_message', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  forwardMessage(
    chatId: string,
    payload: {
      content: string | null;
      msg_type: string;
      client_temp_id?: string;
      forwarded_from_message_id: string | null;
      forwarded_from_name: string | null;
      forwarded_from_chat_id: string | null;
      forwarded_from_sender_id: string | null;
      media?: Record<string, unknown>;
    },
  ) {
    return this.sendEvent('send_message', {
      chat_id: chatId,
      content: payload.content,
      msg_type: payload.msg_type,
      client_temp_id: payload.client_temp_id ?? null,
      forwarded_from_message_id: payload.forwarded_from_message_id,
      forwarded_from_name: payload.forwarded_from_name,
      forwarded_from_chat_id: payload.forwarded_from_chat_id,
      forwarded_from_sender_id: payload.forwarded_from_sender_id,
      media: payload.media,
      relay_mailbox: true,
    });
  }

  toggleReaction(chatId: string, messageId: string, emoji: string) {
    return this.sendEvent('toggle_reaction', {
      chat_id: chatId,
      message_id: messageId,
      emoji,
    });
  }

  private getWsUrl(token: string) {
    const configured = import.meta.env.VITE_WS_URL as string | undefined;
    const base =
      configured?.replace(/\/$/, '') ||
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:4001`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(token)}`;
  }

  private openSocket(token: string) {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const socket = new WebSocket(this.getWsUrl(token));
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.handlers.onConnected?.();
    };

    socket.onmessage = (event) => {
      this.handleRawMessage(event.data);
    };

    socket.onclose = (e) => {
      if ((e.target as WebSocket) !== this.socket) return;
      this.socket = null;
      this.handlers.onDisconnected?.();
      if (!this.manualDisconnect && getAccessToken() && !isUiPreviewMode()) {
        this.scheduleReconnect();
      }
    };
  }

  private handleRawMessage(raw: string | Blob) {
    if (typeof raw !== 'string') return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = msg.type;
    if (typeof type !== 'string') return;

    switch (type) {
      case 'message':
      case 'new_message':
      case 'mailbox_deliver':
        this.handlers.onNewMessage?.(msg);
        break;
      case 'ack':
        this.handlers.onMessageAck?.(msg);
        break;
      case 'message_deleted':
        this.handlers.onMessageDeleted?.(msg);
        break;
      case 'chat_pinned_message_updated':
        this.handlers.onChatPinnedMessageUpdated?.(msg);
        break;
      case 'message_reactions_updated':
        this.handlers.onMessageReactionsUpdated?.(msg);
        break;
      default:
        break;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      BACKOFF_BASE_MS * 2 ** this.reconnectAttempt,
      BACKOFF_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const token = getAccessToken();
      if (!this.manualDisconnect && token && !isUiPreviewMode()) {
        this.handlers.onConnecting?.();
        this.openSocket(token);
      }
    }, delay);
  }
}

export const wsClient = new WsClient();
