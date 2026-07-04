/**
 * WebSocketProvider - connects WebSocket when authenticated, sets handlers,
 * disconnects on logout.
 */

import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { WebSocketService } from '../services/WebSocketService';
import { TransportService } from '../services/TransportService';
import { SignalingService } from '../services/SignalingService';
import { SyncService } from '../services/SyncService';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import { chatStore } from '../stores/chatStore';
import { channelStore } from '../stores/channelStore';
import { uiStore } from '../stores/uiStore';
import { ChatDao, MessageDao, LineSyncEventDao } from '../db';
import { PeerDeliveryService } from '../services/PeerDeliveryService';
import { LineSyncDataChannelService } from '../services/LineSyncDataChannelService';
import { LineSyncService } from '../services/LineSyncService';
import type { Message } from '../stores/types';
import { resolveMediaUrl } from '../config';
import { decodeServerWaveform } from '../services/waveformTransport';
import { normalizeMessageFlag } from '../utils/messageFlags';
import { normalizeMessageTransport } from '../utils/messageTransport';
import { normalizeTimestampRequired } from '../utils/timestamp';
import { buildMessageListPreviewText } from '../utils/messageListPreview';
import { buildPendingLineSyncRowForText, shouldLinkLineSyncOptimisticEchoToServer } from '../services/lineSyncEventBuilder';
import { getChatListTitle } from '../presentation';
import {
  notifyChatusInboundMessagePreview,
  registerPushWithBackendAfterLogin,
} from '../services/pushNotificationsService';

/** Server message payload shape (MappedMessage from backend) */
interface ServerMessagePayload {
  id: string;
  client_temp_id?: string | null;
  chat_id: string;
  sender_id: string;
  sender_avatar_url?: string | null;
  content: string | null;
  msg_type: string;
  status: string;
  transport?: string | null;
  reply_to_id?: string | null;
  thread_root_message_id?: string | null;
  is_channel_post?: boolean;
  view_count?: number;
  comment_count?: number;
  forwarded_from_message_id?: string | null;
  forwarded_from_name?: string | null;
  forwarded_from_chat_id?: string | null;
  forwarded_from_sender_id?: string | null;
  is_edited?: boolean | number;
  is_deleted?: boolean | number;
  created_at: number | string;
  media?: {
    media_type?: string | null;
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
  reactions?: {
    emoji: string;
    count: number;
    reacted_by_me: boolean;
    reactors?: { user_id: string; avatar_url: string | null }[];
  }[];
}

const MEDIA_ACK_TYPES = new Set([
  'voice',
  'video_note',
  'image',
  'video',
  'file',
]);

/**
 * After send_message ACK, replace optimistic file:// remote_url with server HTTP URL from content
 * when needed; synthesize media row if server payload omitted it.
 */
function mergeMediaOnOptimisticAck(sending: Message, mapped: Message): Message['media'] | undefined {
  const serverList = mapped.media ?? [];
  const content = mapped.content?.trim() ?? '';
  const urlFromContent =
    /^https?:\/\//i.test(content) ||
    content.startsWith('/uploads/') ||
    content.startsWith('/api/uploads/')
      ? resolveMediaUrl(content) ?? content
      : null;

  if (serverList.length > 0) {
    const first = serverList[0];
    const remote = first.remote_url?.trim() ?? '';
    const remoteIsLocal =
      remote.startsWith('file') ||
      remote.startsWith('content') ||
      remote.startsWith('blob');
    const shouldPatchRemote =
      !!urlFromContent?.startsWith('http') &&
      mapped.msg_type != null &&
      MEDIA_ACK_TYPES.has(mapped.msg_type) &&
      (!remote || remoteIsLocal);

    const fixedFirst = shouldPatchRemote ? { ...first, remote_url: urlFromContent } : first;
    return [fixedFirst, ...serverList.slice(1)];
  }

  if (
    urlFromContent?.startsWith('http') &&
    mapped.msg_type != null &&
    MEDIA_ACK_TYPES.has(mapped.msg_type)
  ) {
    const base = sending.media?.[0] ?? {};
    return [{ ...base, remote_url: urlFromContent }] as NonNullable<Message['media']>;
  }

  return undefined;
}

function mapServerMessageToMessage(payload: ServerMessagePayload): Message {
  const createdAt = normalizeTimestampRequired(payload.created_at);

  const msg: Message = {
    id: payload.id,
    chat_id: payload.chat_id,
    sender_id: payload.sender_id,
    sender_avatar_url:
      resolveMediaUrl(payload.sender_avatar_url) ?? payload.sender_avatar_url ?? undefined,
    msg_type: payload.msg_type,
    content: payload.content,
    reply_to_id: payload.reply_to_id ?? null,
    thread_root_message_id: payload.thread_root_message_id ?? null,
    is_channel_post: payload.is_channel_post ? 1 : 0,
    view_count: payload.view_count ?? 0,
    comment_count: payload.comment_count ?? 0,
    forwarded_from_message_id: payload.forwarded_from_message_id ?? null,
    forwarded_from_name: payload.forwarded_from_name ?? null,
    forwarded_from_chat_id: payload.forwarded_from_chat_id ?? null,
    forwarded_from_sender_id: payload.forwarded_from_sender_id ?? null,
    is_edited: normalizeMessageFlag(payload.is_edited),
    is_deleted: normalizeMessageFlag(payload.is_deleted),
    status: payload.status,
    transport: normalizeMessageTransport(payload.transport),
    server_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  if (payload.media?.length) {
    msg.media = payload.media.map((m, index) => ({
      id: `media-${payload.id}-${index}`,
      message_id: payload.id,
      media_type: m.media_type ?? undefined,
      waveform: decodeServerWaveform(m.waveform),
      duration_ms: m.duration_ms ?? undefined,
      remote_url: resolveMediaUrl(m.remote_url) ?? m.remote_url ?? undefined,
      thumbnail_url: resolveMediaUrl(m.thumbnail_url) ?? m.thumbnail_url ?? undefined,
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      file_name: m.file_name ?? undefined,
      file_size: m.file_size ?? undefined,
      is_round: m.is_round,
    }));
  }
  if (payload.reactions != null) {
    msg.reactions = payload.reactions.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      reacted_by_me: r.reacted_by_me,
    }));
  }
  return msg;
}

function buildMessagePreview(msg: Message): string {
  return buildMessageListPreviewText(msg);
}

function warnLineSyncLocalInsert(reason: string, detail?: unknown): void {
  if (detail !== undefined) console.warn(`[LineSync] ${reason}`, detail);
  else console.warn(`[LineSync] ${reason}`);
}

async function resolveChatType(
  chatId: string,
): Promise<'private' | 'group' | 'channel' | 'discussion' | null> {
  const fromStore = chatStore.getState().chats.find((c) => c.id === chatId);
  if (fromStore?.chat_type) return fromStore.chat_type;
  const row = await new ChatDao().getById(chatId);
  const chatType = row?.chat_type;
  if (
    chatType === 'private' ||
    chatType === 'group' ||
    chatType === 'channel' ||
    chatType === 'discussion'
  ) {
    return chatType;
  }
  return null;
}

/** Incoming text-only; skips non-text. Caller enforces sender policy (avoid own echoes vs optimistic msg:<tempId>). */
function scheduleInboundTextLineSyncFromMappedMessage(mapped: Message): void {
  const row = buildPendingLineSyncRowForText({
    id: mapped.id,
    chat_id: mapped.chat_id,
    sender_id: mapped.sender_id,
    msg_type: mapped.msg_type,
    content: mapped.content ?? null,
    reply_to_id: mapped.reply_to_id ?? null,
    created_at: mapped.created_at,
  });
  if (!row) return;
  void new LineSyncEventDao()
    .insert(row)
    .then((inserted) => {
      if (!inserted) {
        warnLineSyncLocalInsert('local event insert skipped (duplicate event_id)', mapped.id);
      }
    })
    .catch((err) => {
      warnLineSyncLocalInsert('local event insert failed', err);
    });
}

type UpdateChatLastMessageOutcome = {
  /** Чата не было в сторе до `refreshChats` (гонка или первое появление в списке). */
  chatRowWasMissing: boolean;
};

/**
 * Обновляет превью последнего сообщения в списке чатов. Если чата ещё нет в сторе — ждём
 * `refreshChats`, иначе `incrementUnread` в колбэках срабатывает по пустому списку и бейдж не появляется.
 */
async function updateChatLastMessage(
  chatId: string,
  mapped: Message,
): Promise<UpdateChatLastMessageOutcome> {
  let chat = chatStore.getState().chats.find((c) => c.id === chatId);
  if (!chat) {
    if (__DEV__) {
      console.log('[updateChatLastMessage] chat not in store; await refreshChats', chatId);
    }
    try {
      await SyncService.refreshChats();
    } catch {
      // ignore
    }
    chat = chatStore.getState().chats.find((c) => c.id === chatId);
    if (!chat) {
      void SyncService.fetchMessagesForChat(chatId);
      if (__DEV__) {
        console.warn('[updateChatLastMessage] chat still missing after refresh', chatId);
      }
      return { chatRowWasMissing: true };
    }
    chatStore.getState().updateChat({
      ...chat,
      last_message_id: mapped.id,
      last_message_at: mapped.created_at,
      last_message_preview: buildMessagePreview(mapped),
    });
    void SyncService.fetchMessagesForChat(chatId);
    return { chatRowWasMissing: true };
  }

  chatStore.getState().updateChat({
    ...chat,
    last_message_id: mapped.id,
    last_message_at: mapped.created_at,
    last_message_preview: buildMessagePreview(mapped),
  });
  return { chatRowWasMissing: false };
}

/** Не дублируем unread, если после refresh сервер уже отдал ненулевой счётчик. */
function bumpInboundUnreadAfterLastMessage(
  chatId: string,
  mapped: Message,
  outcome: UpdateChatLastMessageOutcome,
): void {
  const currentUserId = authStore.getState().user?.id ?? null;
  if (!currentUserId || mapped.sender_id === currentUserId) return;

  const selectedChatId = chatStore.getState().selectedChatId;
  if (selectedChatId === chatId) {
    chatStore.getState().clearUnread(chatId);
    return;
  }

  if (outcome.chatRowWasMissing) {
    const row = chatStore.getState().chats.find((c) => c.id === chatId);
    if (row && (row.unread_count ?? 0) === 0) {
      chatStore.getState().incrementUnread(chatId);
    }
  } else {
    chatStore.getState().incrementUnread(chatId);
  }
}

function sendMessageAck(
  chatId: string,
  messageId: string,
  status: 'delivered' | 'read',
): void {
  if (!WebSocketService.isConnected()) return;

  WebSocketService.sendEvent('ack', {
    chat_id: chatId,
    message_id: messageId,
    status,
  });
}

function getMessageStatusRank(status: string): number {
  switch (status) {
    case 'failed':
      return -1;
    case 'sending':
      return 0;
    case 'sent':
      return 1;
    case 'delivered':
      return 2;
    case 'read':
      return 3;
    default:
      return 0;
  }
}

type WebSocketProviderProps = {
  children: React.ReactNode;
};

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { isAuthenticated } = useAuth();
  const { isConnected: isNetworkConnected } = useNetworkStatus();
  const handlersSetRef = useRef(false);
  const prevNetworkConnectedRef = useRef<boolean | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const accessTokenRef = useRef<string | null>(null);

  // After silent token refresh, reconnect chat + signaling so JWT in URL matches store.
  useEffect(() => {
    if (!isAuthenticated) {
      accessTokenRef.current = null;
      return undefined;
    }
    accessTokenRef.current = authStore.getState().accessToken;
    const unsub = authStore.subscribe(() => {
      const token = authStore.getState().accessToken;
      const prev = accessTokenRef.current;
      if (prev && token && prev !== token) {
        WebSocketService.reconnect();
        SignalingService.reconnect();
      }
      accessTokenRef.current = token;
    });
    return unsub;
  }, [isAuthenticated]);

  // Reconnect WebSocket when network goes from offline to online (not on initial null->true)
  useEffect(() => {
    const wasOffline = prevNetworkConnectedRef.current === false;
    const wasOnline = prevNetworkConnectedRef.current === true;
    const isNowOnline = isNetworkConnected === true;
    const isNowOffline = isNetworkConnected === false;
    prevNetworkConnectedRef.current = isNetworkConnected;

    if (wasOffline && isNowOnline && isAuthenticated) {
      WebSocketService.connect();
      LineSyncDataChannelService.closeAllSessions();
    }
    if (wasOnline && isNowOffline && isAuthenticated) {
      LineSyncDataChannelService.closeAllSessions();
    }
  }, [isNetworkConnected, isAuthenticated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;

      // LineSync blob DataChannel: stale ICE after minimize; next ensureOpen renegotiates (D1).
      if (nextState === 'background' && isAuthenticated) {
        LineSyncDataChannelService.closeAllSessions();
      }

      appStateRef.current = nextState;

      const cameToForeground =
        previousState !== 'active' && nextState === 'active';
      if (!cameToForeground || !isAuthenticated) return;

      void SyncService.refreshChats();
      // Remote push (FCM) when the app process is dead; keep server token fresh after resume.
      void registerPushWithBackendAfterLogin().catch(() => undefined);

      // Image/media picker often triggers inactive → active; reconnect() would close
      // the socket (code 1000) and reconnect unnecessarily. Only connect if down.
      if (!WebSocketService.isConnected()) {
        WebSocketService.connect();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const unsub = PeerDeliveryService.onDmDeliver((payload) => {
      void (async () => {
        let chatType = await resolveChatType(payload.chat_id);
        // Group text is always relayed via server WS; ignore parallel P2P fanout copies.
        if (chatType === 'group') {
          PeerDeliveryService.sendDmAck(payload.ack_key);
          return;
        }
        if (chatType === null) {
          try {
            await SyncService.refreshChats();
          } catch {
            // best-effort before re-checking chat type
          }
          chatType = await resolveChatType(payload.chat_id);
          if (chatType === 'group') {
            PeerDeliveryService.sendDmAck(payload.ack_key);
            return;
          }
          if (chatType === null) {
            console.warn('[dm_deliver] chat type unknown after refresh; applying dedupe only', {
              chat_id: payload.chat_id,
              temp_id: payload.temp_id,
            });
          }
        }

        const existing = messageStore.getState().messagesByChatId[payload.chat_id] ?? [];
        const ts = normalizeTimestampRequired(payload.sent_at);
        const isDuplicate =
          existing.some((m) => m.id === payload.temp_id) ||
          existing.some(
            (m) =>
              m.sender_id === payload.from_user_id &&
              m.msg_type === 'text' &&
              m.content === payload.content &&
              Math.abs(m.created_at - ts) < 60_000,
          );
        if (isDuplicate) {
          PeerDeliveryService.sendDmAck(payload.ack_key);
          return;
        }

        const mapped: Message = {
          id: payload.temp_id,
          chat_id: payload.chat_id,
          sender_id: payload.from_user_id,
          msg_type: 'text',
          content: payload.content,
          reply_to_id: payload.reply_to_id ?? null,
          thread_root_message_id: null,
          is_channel_post: 0,
          view_count: 0,
          comment_count: 0,
          is_edited: 0,
          is_deleted: 0,
          status: 'delivered',
          transport: normalizeMessageTransport('p2p'),
          server_id: null,
          created_at: ts,
          updated_at: ts,
        };
        const dao = new MessageDao();
        try {
          await dao.insert(mapped);
        } catch {
          /* duplicate insert */
        }
        messageStore.getState().prependMessage(payload.chat_id, mapped);
        const lastMsgOutcome = await updateChatLastMessage(payload.chat_id, mapped);

        const currentUserId = authStore.getState().user?.id ?? null;
        if (currentUserId && payload.from_user_id !== currentUserId) {
          scheduleInboundTextLineSyncFromMappedMessage(mapped);
          bumpInboundUnreadAfterLastMessage(payload.chat_id, mapped, lastMsgOutcome);
          const messageChat = chatStore.getState().chats.find((item) => item.id === payload.chat_id);

          if (chatStore.getState().selectedChatId !== payload.chat_id) {
            const chatTitle = messageChat ? getChatListTitle(messageChat) : 'Chat';
            void notifyChatusInboundMessagePreview({
              chatId: payload.chat_id,
              title: chatTitle,
              messagePreview: buildMessagePreview(mapped),
              avatarUrl: messageChat?.avatar_url ?? undefined,
              messageType: mapped.msg_type,
            });
          }
        }

        PeerDeliveryService.sendDmAck(payload.ack_key);
      })();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      WebSocketService.disconnect();
      SignalingService.disconnect();
      return;
    }

    // Load chats immediately via HTTP (fixes empty list after app restart)
    SyncService.refreshChats().catch(() => {});

    TransportService.init().catch(() => {});

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
        onMailboxDeliver: (payload) => {
          void (async () => {
            const msg = (payload as { message?: ServerMessagePayload }).message;
            if (!msg?.chat_id || !msg?.id) return;
            const mapped = mapServerMessageToMessage(msg);
            const dao = new MessageDao();
            try {
              await dao.insert(mapped);
            } catch {
              /* duplicate */
            }
            messageStore.getState().prependMessage(msg.chat_id, mapped);
            const lastMsgOutcome = await updateChatLastMessage(msg.chat_id, mapped);

            const currentUserId = authStore.getState().user?.id ?? null;
            if (currentUserId && msg.sender_id !== currentUserId) {
              scheduleInboundTextLineSyncFromMappedMessage(mapped);
              const messageChat = chatStore.getState().chats.find((item) => item.id === msg.chat_id);
              const shouldSendReceipts =
                messageChat?.chat_type === 'private' || messageChat?.chat_type === 'group';

              bumpInboundUnreadAfterLastMessage(msg.chat_id, mapped, lastMsgOutcome);

              if (chatStore.getState().selectedChatId !== msg.chat_id) {
                const chatTitle = messageChat ? getChatListTitle(messageChat) : 'Chat';

                void notifyChatusInboundMessagePreview({
                  chatId: msg.chat_id,
                  title: chatTitle,
                  messagePreview: buildMessagePreview(mapped),
                  avatarUrl: messageChat?.avatar_url ?? mapped.sender_avatar_url ?? undefined,
                  messageType: mapped.msg_type,
                });
              }

              if (shouldSendReceipts) {
                sendMessageAck(msg.chat_id, msg.id, 'delivered');
              }
            }

            WebSocketService.sendEvent('mailbox_ack', { message_id: msg.id });
          })();
        },

        onNewMessage: (payload) => {
          void (async () => {
          const msg = (payload as { message?: ServerMessagePayload }).message;
          if (!msg?.chat_id || !msg?.id) return;
          // Deduplication and optimistic match in a single pass
          const existing = messageStore.getState().messagesByChatId[msg.chat_id] ?? [];
          let sendingByTempId;
          let inboundPeerByTempId;
          let oldestSendingCandidate;
          const currentUserId = authStore.getState().user?.id ?? null;
          
          const clientTempId =
            typeof msg.client_temp_id === 'string' && msg.client_temp_id.trim().length > 0
              ? msg.client_temp_id.trim()
              : null;

          for (let i = 0; i < existing.length; i++) {
            const m = existing[i];
            if (m.id === msg.id) return; // Already have this message

            if (
              clientTempId &&
              m.id === clientTempId &&
              m.sender_id === msg.sender_id &&
              (msg.sender_id === currentUserId || m.transport === 'p2p')
            ) {
              if (msg.sender_id === currentUserId) {
                // Video note: TransportService pre-fills the bubble and sets status to "sent" after
                // upload+WS send, before the server echoes the final id — it is no longer "sending",
                // so we must still match by client_temp_id or we prepend a duplicate row.
                sendingByTempId = m;
              } else {
                inboundPeerByTempId = m;
              }
              continue;
            }

            if (
              m.status === 'sending' &&
              m.sender_id === currentUserId &&
              msg.sender_id === currentUserId
            ) {
              if (
                m.msg_type === msg.msg_type &&
                (m.msg_type === 'text' ? m.content === msg.content : true)
              ) {
                // Iterating newest-to-oldest, so the last match we find will be the oldest
                oldestSendingCandidate = m;
              }
            }
          }
          
          if (__DEV__) {
            console.log('[WS onNewMessage] message from server', { id: msg.id, chat_id: msg.chat_id, content: msg.content, msg_type: msg.msg_type });
          }
          const mapped = mapServerMessageToMessage(msg);
          const sending = sendingByTempId ?? oldestSendingCandidate;
          const mergedInboundPeer = !!inboundPeerByTempId;
          if (inboundPeerByTempId) {
            messageStore.getState().updateMessage(msg.chat_id, inboundPeerByTempId.id, {
              id: mapped.id,
              content: mapped.content ?? null,
              reply_to_id: mapped.reply_to_id,
              is_edited: mapped.is_edited,
              is_deleted: mapped.is_deleted,
              status: mapped.status,
              transport: mapped.transport,
              server_id: mapped.server_id,
              created_at: mapped.created_at,
              updated_at: mapped.updated_at,
            });
            const messageDao = new MessageDao();
            try {
              await messageDao.replaceId(inboundPeerByTempId.id, mapped);
            } catch (err) {
              console.warn('[WS onNewMessage] replaceId failed', {
                oldId: inboundPeerByTempId.id,
                newId: mapped.id,
                err,
              });
            }
            if (clientTempId) {
              void new LineSyncEventDao()
                .linkServerMessageIdForOptimisticTemp(clientTempId, mapped.id)
                .catch((err) => {
                  warnLineSyncLocalInsert('inbound peer→server LineSync link failed', err);
                });
            }
          } else if (sending) {
            const mergedMedia = mergeMediaOnOptimisticAck(sending, mapped);
            const media =
              mergedMedia ??
              (mapped.media?.length ? mapped.media : sending.media);
            messageStore.getState().updateMessage(msg.chat_id, sending.id, {
              id: mapped.id,
              content: mapped.content ?? null,
              reply_to_id: mapped.reply_to_id,
              forwarded_from_message_id: mapped.forwarded_from_message_id ?? null,
              forwarded_from_name: mapped.forwarded_from_name ?? null,
              forwarded_from_chat_id: mapped.forwarded_from_chat_id ?? null,
              forwarded_from_sender_id: mapped.forwarded_from_sender_id ?? null,
              is_edited: mapped.is_edited,
              is_deleted: mapped.is_deleted,
              status: mapped.status,
              transport: mapped.transport,
              created_at: mapped.created_at,
              updated_at: mapped.updated_at,
              /** После ACK `id` меняется → новый key в списке; без сброса Reanimated `entering` проигрался бы второй раз. */
              chatus_sticker_solo_send: undefined,
              ...(media ? { media } : {}),
            });
            if (
              clientTempId &&
              shouldLinkLineSyncOptimisticEchoToServer({
                msgType: msg.msg_type,
                matchedByClientTempId: !!sendingByTempId,
              })
            ) {
              void new LineSyncEventDao()
                .linkServerMessageIdForOptimisticTemp(clientTempId, mapped.id)
                .then((outcome) => {
                  if (outcome === 'conflict') {
                    warnLineSyncLocalInsert('optimistic server_message_id conflict', {
                      client_temp_id: clientTempId,
                      server_message_id: mapped.id,
                    });
                  }
                })
                .catch((err) => {
                  warnLineSyncLocalInsert('optimistic→server LineSync link failed', err);
                });
            }
          } else {
            if (__DEV__) console.log('[WS onNewMessage] recipient: prependMessage', { chat_id: msg.chat_id, content: mapped.content });
            messageStore.getState().prependMessage(msg.chat_id, mapped);
          }
          const lastMsgOutcome = await updateChatLastMessage(msg.chat_id, mapped);
          if (currentUserId && msg.sender_id !== currentUserId) {
            if (!mergedInboundPeer) {
              scheduleInboundTextLineSyncFromMappedMessage(mapped);
            }
            const messageChat = chatStore
              .getState()
              .chats.find((item) => item.id === msg.chat_id);
            const shouldSendReceipts =
              messageChat?.chat_type === 'private' || messageChat?.chat_type === 'group';

            if (shouldSendReceipts) {
              sendMessageAck(msg.chat_id, msg.id, 'delivered');
            }

            if (!mergedInboundPeer) {
              bumpInboundUnreadAfterLastMessage(msg.chat_id, mapped, lastMsgOutcome);

              if (chatStore.getState().selectedChatId !== msg.chat_id) {
                const chatTitle = messageChat ? getChatListTitle(messageChat) : 'Chat';

                void notifyChatusInboundMessagePreview({
                  chatId: msg.chat_id,
                  title: chatTitle,
                  messagePreview: buildMessagePreview(mapped),
                  avatarUrl: messageChat?.avatar_url || mapped.sender_avatar_url || undefined,
                  messageType: mapped.msg_type,
                });
              }
            }
          }
          })();
        },

        onChannelPost: (payload) => {
          const raw = payload as { channel_id?: string; message?: ServerMessagePayload };
          if (!raw.channel_id || !raw.message) return;
          const mapped = mapServerMessageToMessage(raw.message);
          channelStore.getState().prependFeedPost(raw.channel_id, mapped);
          const channel = chatStore.getState().chats.find((item) => item.id === raw.channel_id);
          if (channel) {
            chatStore.getState().updateChat({
              ...channel,
              last_message_id: mapped.id,
              last_message_at: mapped.created_at,
              last_message_preview: buildMessagePreview(mapped),
            });
          }
        },

        onDiscussionMessage: (payload) => {
          const raw = payload as {
            channel_id?: string;
            post_id?: string;
            message?: ServerMessagePayload;
          };
          if (!raw.channel_id || !raw.post_id || !raw.message) return;
          const mapped = mapServerMessageToMessage(raw.message);
          const key = `${raw.channel_id}:${raw.post_id}`;
          channelStore.getState().prependDiscussionMessage(key, mapped);
        },

        onMessageReactionsUpdated: (payload) => {
          const raw = payload as {
            chat_id?: string;
            message_id?: string;
            channel_id?: string;
            post_id?: string;
            discussion_chat_id?: string;
            reactions?: {
              emoji: string;
              count: number;
              reacted_by_me: boolean;
              reactors?: { user_id: string; avatar_url: string | null }[];
            }[];
          };
          if (!raw.message_id || !raw.reactions) return;

          if (raw.channel_id && raw.post_id && raw.discussion_chat_id === raw.chat_id) {
            channelStore
              .getState()
              .updateDiscussionMessage(`${raw.channel_id}:${raw.post_id}`, raw.message_id, {
                reactions: raw.reactions,
              });
            return;
          }

          if (raw.channel_id && raw.post_id && raw.chat_id === raw.channel_id) {
            channelStore.getState().updateFeedMessage(raw.channel_id, raw.message_id, {
              reactions: raw.reactions,
            });
            return;
          }

          if (raw.chat_id) {
            messageStore.getState().updateMessage(raw.chat_id, raw.message_id, {
              reactions: raw.reactions,
            });
          }
        },

        onChannelPostCommentCountUpdated: (payload) => {
          const raw = payload as {
            channel_id?: string;
            post_id?: string;
            comment_count?: number;
          };
          if (!raw.channel_id || !raw.post_id || typeof raw.comment_count !== 'number') return;
          channelStore.getState().updateFeedMessage(raw.channel_id, raw.post_id, {
            comment_count: raw.comment_count,
          });
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

          if (getMessageStatusRank(status) < getMessageStatusRank(msg.status)) {
            return;
          }

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
          // Локальная анимация удаления не используется — только обновление флага.
          messageStore.getState().updateMessage(chat_id, message_id, {
            is_deleted: 1,
          });
          const discussionState = channelStore.getState().discussionByKey;
          for (const key of Object.keys(discussionState)) {
            const thread = discussionState[key];
            if (!thread || thread.discussion_chat_id !== chat_id) continue;
            channelStore.getState().updateDiscussionMessage(key, message_id, {
              is_deleted: 1,
              content: null,
            });
          }
          const chat = chatStore.getState().chats.find((item) => item.id === chat_id);
          if (chat?.pinned_message_id === message_id) {
            chatStore.getState().updateChat({
              ...chat,
              pinned_message_id: null,
            });
          }
        },

        onChatDeleted: (payload) => {
          const { chat_id } = payload as { chat_id?: string; deleted_by_user_id?: string };
          if (!chat_id || typeof chat_id !== 'string') return;

          messageStore.getState().clearMessages(chat_id);
          chatStore.getState().removeChat(chat_id);
          channelStore.setState((s) => {
            const nextDiscussion = { ...s.discussionByKey };
            for (const key of Object.keys(nextDiscussion)) {
              const thread = nextDiscussion[key];
              if (thread?.discussion_chat_id === chat_id) {
                delete nextDiscussion[key];
              }
            }
            const nextDetails = { ...s.detailsById };
            for (const channelId of Object.keys(nextDetails)) {
              const detail = nextDetails[channelId];
              if (detail?.linked_discussion_chat_id === chat_id) {
                nextDetails[channelId] = {
                  ...detail,
                  linked_discussion_chat_id: null,
                };
              }
            }
            return { discussionByKey: nextDiscussion, detailsById: nextDetails };
          });
          uiStore.getState().removeChatTheme(chat_id);
          uiStore.getState().setPinnedMessage(chat_id, null);
          uiStore.setState((s) => {
            const nextTyping = { ...s.typingUsersByChatId };
            delete nextTyping[chat_id];
            return { typingUsersByChatId: nextTyping };
          });
          if (uiStore.getState().pushNotification?.chatId === chat_id) {
            uiStore.getState().dismissPushNotification();
          }

          void new ChatDao()
            .delete(chat_id)
            .catch(() => {});
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
          const previousPresence = uiStore.getState().presenceByUserId[user_id];
          uiStore.getState().setPresence(user_id, {
            is_online: is_online ?? false,
            last_seen: last_seen ?? previousPresence?.last_seen,
          });
        },

        onLineTail: (payload) => {
          void (async () => {
            try {
              await LineSyncService.mergeLineTailWebSocketMessage(payload);
            } catch (err) {
              let lineHint = '';
              if (
                typeof __DEV__ !== 'undefined' &&
                __DEV__ &&
                payload &&
                typeof payload === 'object' &&
                'line_id' in payload
              ) {
                const lid = (payload as { line_id?: unknown }).line_id;
                if (typeof lid === 'string' && lid.trim().length > 0) {
                  lineHint = lid.trim();
                }
              }
              console.warn(
                '[WebSocket] line_tail merge failed' + (lineHint ? ` line_id=${lineHint}` : ''),
                err
              );
            }
          })();
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
