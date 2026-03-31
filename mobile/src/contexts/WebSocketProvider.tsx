/**
 * WebSocketProvider - connects WebSocket when authenticated, sets handlers,
 * disconnects on logout.
 */

import React, { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { WebSocketService } from '../services/WebSocketService';
import { TransportService } from '../services/TransportService';
import { SignalingService } from '../services/SignalingService';
import { USE_P2P } from '../config';
import { SyncService } from '../services/SyncService';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';
import type { Message } from '../stores/types';
import { decodeServerWaveform } from '../services/waveformTransport';

/** Server message payload shape (MappedMessage from backend) */
interface ServerMessagePayload {
  id: string;
  client_temp_id?: string | null;
  chat_id: string;
  sender_id: string;
  content: string | null;
  msg_type: string;
  status: string;
  reply_to_id?: string | null;
  created_at: number | string;
  media?: {
    duration_ms?: number | null;
    waveform?: string | null;
    remote_url?: string | null;
    thumbnail_url?: string | null;
    width?: number | null;
    height?: number | null;
    file_name?: string | null;
    file_size?: number | null;
    is_round?: boolean;
  }[];
}

function mapServerMessageToMessage(payload: ServerMessagePayload): Message {
  const createdAt =
    typeof payload.created_at === 'string'
      ? new Date(payload.created_at).getTime()
      : payload.created_at;

  const msg: Message = {
    id: payload.id,
    chat_id: payload.chat_id,
    sender_id: payload.sender_id,
    msg_type: payload.msg_type,
    content: payload.content,
    reply_to_id: payload.reply_to_id ?? null,
    is_edited: 0,
    is_deleted: 0,
    status: payload.status,
    transport: 'ws',
    server_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  if (payload.media?.length) {
    msg.media = payload.media.map((m) => ({
      waveform: decodeServerWaveform(m.waveform),
      duration_ms: m.duration_ms ?? undefined,
      remote_url: m.remote_url ?? undefined,
      thumbnail_url: m.thumbnail_url ?? undefined,
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      file_name: m.file_name ?? undefined,
      file_size: m.file_size ?? undefined,
      is_round: m.is_round,
    }));
  }
  return msg;
}

function buildMessagePreview(msg: Message): string {
  const maxLen = 100;
  if (msg.msg_type === 'text' && msg.content) {
    return msg.content.length <= maxLen ? msg.content : msg.content.slice(0, maxLen) + '...';
  }
  const placeholders: Record<string, string> = {
    voice: 'Voice message',
    image: 'Photo',
    video_note: 'Video note',
    video: 'Video',
    file: msg.media?.[0]?.file_name ?? 'File',
  };
  return placeholders[msg.msg_type] ?? 'Message';
}

function updateChatLastMessage(chatId: string, mapped: Message): void {
  const chat = chatStore.getState().chats.find((c) => c.id === chatId);
  if (!chat) {
    // Chat not in list (e.g. recipient got first message) - refresh chats then fetch messages
    if (__DEV__) console.log('[updateChatLastMessage] chat not found, refreshChats + fetchMessages', chatId);
    SyncService.refreshChats()
      .then(() => SyncService.fetchMessagesForChat(chatId))
      .catch(() => {});
    return;
  }
  chatStore.getState().updateChat({
    ...chat,
    last_message_id: mapped.id,
    last_message_at: mapped.created_at,
    last_message_preview: buildMessagePreview(mapped),
  });
}

type WebSocketProviderProps = {
  children: React.ReactNode;
};

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { isAuthenticated } = useAuth();
  const { isConnected: isNetworkConnected } = useNetworkStatus();
  const handlersSetRef = useRef(false);
  const prevNetworkConnectedRef = useRef<boolean | null>(null);

  // Reconnect WebSocket when network goes from offline to online (not on initial null->true)
  useEffect(() => {
    const wasOffline = prevNetworkConnectedRef.current === false;
    const isNowOnline = isNetworkConnected === true;
    prevNetworkConnectedRef.current = isNetworkConnected;

    if (wasOffline && isNowOnline && isAuthenticated) {
      WebSocketService.connect();
    }
  }, [isNetworkConnected, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      WebSocketService.disconnect();
      SignalingService.disconnect();
      return;
    }

    // Load chats immediately via HTTP (fixes empty list after app restart)
    SyncService.refreshChats().catch(() => {});

    TransportService.init().catch(() => {});
    if (USE_P2P) SignalingService.connect();

    if (!handlersSetRef.current) {
      WebSocketService.setHandlers({
        onConnected: () => {
          SyncService.runOnConnect().catch((err) =>
            console.warn('[WebSocket] runOnConnect failed:', err)
          );
          uiStore.getState().bumpTransportStatus();
        },
        onDisconnected: () => {
          uiStore.getState().bumpTransportStatus();
        },
        onNewMessage: (payload) => {
          const msg = (payload as { message?: ServerMessagePayload }).message;
          if (!msg?.chat_id || !msg?.id) return;
          // Deduplication: skip if we already have this message (same id)
          const existing = messageStore.getState().messagesByChatId[msg.chat_id] ?? [];
          if (existing.some((m) => m.id === msg.id)) return;
          if (__DEV__) {
            console.log('[WS onNewMessage] message from server', { id: msg.id, chat_id: msg.chat_id, content: msg.content, msg_type: msg.msg_type });
          }
          const mapped = mapServerMessageToMessage(msg);
          const currentUserId = authStore.getState().user?.id ?? null;
          const selectedChatId = chatStore.getState().selectedChatId;
          const clientTempId =
            typeof msg.client_temp_id === 'string' && msg.client_temp_id.trim().length > 0
              ? msg.client_temp_id.trim()
              : null;
          const sendingByTempId = clientTempId
            ? existing.find(
                (m) =>
                  m.id === clientTempId &&
                  m.status === 'sending' &&
                  m.sender_id === currentUserId &&
                  msg.sender_id === currentUserId
              )
            : undefined;
          const sendingCandidates = sendingByTempId
            ? []
            : existing.filter(
                (m) =>
                  m.status === 'sending' &&
                  m.sender_id === currentUserId &&
                  msg.sender_id === currentUserId &&
                  m.msg_type === msg.msg_type &&
                  (m.msg_type === 'text' ? m.content === msg.content : true)
              );
          // Take oldest (first sent) - array is [newest..oldest], confirmations arrive in order
          const sending =
            sendingByTempId ??
            (sendingCandidates.length > 0 ? sendingCandidates[sendingCandidates.length - 1] : undefined);
          if (sending) {
            messageStore.getState().updateMessage(msg.chat_id, sending.id, {
              id: mapped.id,
              content: mapped.content ?? null,
              reply_to_id: mapped.reply_to_id,
              status: mapped.status,
              transport: mapped.transport,
              created_at: mapped.created_at,
              updated_at: mapped.updated_at,
              ...(mapped.media?.length && { media: mapped.media }),
            });
          } else {
            if (__DEV__) console.log('[WS onNewMessage] recipient: prependMessage', { chat_id: msg.chat_id, content: mapped.content });
            messageStore.getState().prependMessage(msg.chat_id, mapped);
          }
          updateChatLastMessage(msg.chat_id, mapped);
          if (msg.sender_id !== currentUserId) {
            if (selectedChatId === msg.chat_id) {
              chatStore.getState().clearUnread(msg.chat_id);
            } else {
              chatStore.getState().incrementUnread(msg.chat_id);
            }
          }
        },

        onMessageAck: async (payload) => {
          const currentUserId = authStore.getState().user?.id ?? null;
          const { message_id, chat_id, status, user_id } = payload as {
            message_id?: string;
            chat_id?: string;
            status?: string;
            user_id?: string;
          };
          if (!chat_id || !message_id || !user_id || !status) return;
          // Process only when ack is from recipient (we are the sender)
          if (user_id === currentUserId) return;

          const messages = messageStore.getState().messagesByChatId[chat_id] ?? [];
          const msg = messages.find((m) => m.id === message_id);
          if (!msg || msg.sender_id !== currentUserId) return;

          messageStore.getState().updateMessage(chat_id, message_id, {
            status: status ?? 'sent',
          });
        },

        onMessageDeleted: (payload) => {
          const { chat_id, message_id } = payload as {
            chat_id?: string;
            message_id?: string;
          };
          if (!chat_id || !message_id) return;
          messageStore.getState().updateMessage(chat_id, message_id, {
            is_deleted: 1,
            content: null,
          });
          const chat = chatStore.getState().chats.find((item) => item.id === chat_id);
          if (chat?.pinned_message_id === message_id) {
            chatStore.getState().updateChat({
              ...chat,
              pinned_message_id: null,
            });
          }
        },

        onChatPinnedMessageUpdated: (payload) => {
          const { chat_id, pinned_message_id } = payload as {
            chat_id?: string;
            pinned_message_id?: string | null;
          };
          if (!chat_id) return;
          const chat = chatStore.getState().chats.find((item) => item.id === chat_id);
          if (!chat) return;
          chatStore.getState().updateChat({
            ...chat,
            pinned_message_id: pinned_message_id ?? null,
          });
        },

        onTyping: (payload) => {
          const currentUserId = authStore.getState().user?.id ?? null;
          const { chat_id, user_id } = payload as { chat_id?: string; user_id?: string };
          if (!chat_id || !user_id) return;
          if (user_id === currentUserId) return;

          uiStore.getState().setTypingUser(chat_id, user_id);
        },

        onPresence: (payload) => {
          const { user_id, is_online, last_seen } = payload as {
            user_id?: string;
            is_online?: boolean;
            last_seen?: number;
          };
          if (!user_id) return;
          uiStore.getState().setPresence(user_id, {
            is_online: is_online ?? false,
            last_seen,
          });
        },

        onError: (payload) => {
          const err = payload as { code?: string; message?: string };
          console.warn('[WebSocket] error:', err.code ?? err.message ?? payload);
        },
      });
      handlersSetRef.current = true;
    }

    WebSocketService.connect();

    return () => {
      WebSocketService.disconnect();
      SignalingService.disconnect();
    };
  }, [isAuthenticated]);

  return <>{children}</>;
}
