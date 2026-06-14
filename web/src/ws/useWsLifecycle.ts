import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthUiStore } from '@/stores/authUiStore';
import { useWsUiStore } from '@/stores/wsUiStore';
import { chatsQueryKey } from '@/queries/chats.queries';
import { messagesQueryKey } from '@/queries/messages.queries';
import type { ChatSummary } from '@/types/chat';
import type { MappedMessage } from '@/types/message';
import {
  getMessageStatusRank,
  getOutgoingMessagePreview,
} from '@/features/conversation/messageFormatters';
import { isUiPreviewMode } from '@/dev/uiPreview';
import { wsClient } from './wsClient';

function sortMessagesAsc(messages: MappedMessage[]): MappedMessage[] {
  return [...messages].sort((a, b) => a.created_at - b.created_at);
}

function mergeIncomingMessage(
  list: MappedMessage[],
  message: MappedMessage,
  currentUserId: string | null,
): MappedMessage[] {
  if (list.some((m) => m.id === message.id)) return list;

  const clientTempId =
    typeof message.client_temp_id === 'string' && message.client_temp_id.trim().length > 0
      ? message.client_temp_id.trim()
      : null;

  let replaceIdx = -1;

  if (clientTempId && currentUserId && message.sender_id === currentUserId) {
    replaceIdx = list.findIndex(
      (m) =>
        (m.id === `temp-${clientTempId}` ||
          m.id === clientTempId ||
          m.client_temp_id === clientTempId) &&
        m.sender_id === currentUserId,
    );
  }

  if (
    replaceIdx === -1 &&
    !clientTempId &&
    currentUserId &&
    message.sender_id === currentUserId
  ) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (
        m.status === 'sending' &&
        m.sender_id === currentUserId &&
        m.msg_type === message.msg_type &&
        (m.msg_type === 'text' ? m.content === message.content : true)
      ) {
        replaceIdx = i;
      }
    }
  }

  if (replaceIdx >= 0) {
    const next = [...list];
    next[replaceIdx] = message;
    return sortMessagesAsc(next);
  }

  return sortMessagesAsc([...list, message]);
}

function bumpUnreadForIncoming(
  chats: ChatSummary[],
  chatId: string,
  message: MappedMessage,
  currentUserId: string | null,
  activeChatId: string | undefined,
): ChatSummary[] {
  if (!currentUserId || message.sender_id === currentUserId) return chats;
  if (activeChatId === chatId) return chats;

  return chats.map((chat) =>
    chat.id === chatId ? { ...chat, unread_count: (chat.unread_count ?? 0) + 1 } : chat,
  );
}

export function useWsLifecycle(activeChatId?: string) {
  const ready = useAuthUiStore((s) => s.embedStatus === 'ready');
  const currentUserId = useAuthUiStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();
  const activeChatIdRef = useRef(activeChatId);
  const currentUserIdRef = useRef(currentUserId);
  const hasEverConnectedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);

  activeChatIdRef.current = activeChatId;
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    if (!ready || isUiPreviewMode()) return;

    wsClient.setHandlers({
      onConnecting: () => useWsUiStore.getState().setConnecting(),
      onConnected: () => {
        useWsUiStore.getState().setConnected();
        if (hasEverConnectedRef.current && wasDisconnectedRef.current) {
          void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
          const activeId = activeChatIdRef.current;
          if (activeId) {
            void queryClient.invalidateQueries({ queryKey: messagesQueryKey(activeId) });
          }
        }
        hasEverConnectedRef.current = true;
        wasDisconnectedRef.current = false;
      },
      onDisconnected: () => {
        useWsUiStore.getState().setDisconnected();
        wasDisconnectedRef.current = true;
      },
      onMessageDeleted: (payload) => {
        const chatId = payload.chat_id;
        const messageId = payload.message_id;
        if (typeof chatId !== 'string' || typeof messageId !== 'string') return;

        queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) =>
          old?.map((m) =>
            m.id === messageId ? { ...m, is_deleted: true, content: null } : m,
          ),
        );
      },
      onChatPinnedMessageUpdated: (payload) => {
        const chatId = payload.chat_id;
        const pinnedMessageId = payload.pinned_message_id;
        if (typeof chatId !== 'string') return;

        queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
          old?.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  pinned_message_id:
                    typeof pinnedMessageId === 'string' ? pinnedMessageId : null,
                }
              : chat,
          ),
        );
      },
      onMessageAck: (payload) => {
        const chatId = payload.chat_id;
        const messageId = payload.message_id;
        const status = payload.status;
        const userId = payload.user_id;
        const meId = currentUserIdRef.current;

        if (
          typeof chatId !== 'string' ||
          typeof messageId !== 'string' ||
          typeof status !== 'string' ||
          typeof userId !== 'string'
        ) {
          return;
        }

        // Process only when ack is from recipient (we are the sender).
        if (!meId || userId === meId) return;

        queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) => {
          if (!old) return old;
          return old.map((m) => {
            if (m.id !== messageId || m.sender_id !== meId) return m;
            if (getMessageStatusRank(status) < getMessageStatusRank(m.status)) return m;
            return { ...m, status };
          });
        });

        queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) =>
          old?.map((chat) => {
            if (chat.id !== chatId || chat.last_message?.id !== messageId) return chat;
            const lastStatus = chat.last_message.status;
            if (getMessageStatusRank(status) < getMessageStatusRank(lastStatus)) return chat;
            return {
              ...chat,
              last_message: { ...chat.last_message, status },
            };
          }),
        );
      },
      onNewMessage: (payload) => {
        const message = payload.message as MappedMessage | undefined;
        if (!message?.chat_id || !message.id) return;

        const meId = currentUserIdRef.current;
        const openChatId = activeChatIdRef.current;

        queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(message.chat_id), (old) =>
          mergeIncomingMessage(old ?? [], message, meId),
        );

        queryClient.setQueryData<ChatSummary[]>(chatsQueryKey, (old) => {
          if (!old) return old;
          const withLast = old.map((chat) =>
            chat.id === message.chat_id
              ? {
                  ...chat,
                  last_message: message,
                  last_message_id: message.id,
                  last_message_at: message.created_at,
                  last_message_preview:
                    getOutgoingMessagePreview(message) || chat.last_message_preview,
                }
              : chat,
          );
          return bumpUnreadForIncoming(withLast, message.chat_id, message, meId, openChatId);
        });
      },
    });

    useWsUiStore.getState().setConnecting();
    wsClient.connect();

    return () => {
      wsClient.disconnect();
      useWsUiStore.getState().reset();
    };
  }, [ready, queryClient]);

  useEffect(() => {
    if (!ready || isUiPreviewMode()) return;

    let prevToken = useAuthUiStore.getState().accessToken;
    const unsub = useAuthUiStore.subscribe((state) => {
      const token = state.accessToken;
      if (prevToken && !token) {
        wsClient.disconnect();
      } else if (prevToken && token && prevToken !== token) {
        wsClient.reconnect();
      }
      prevToken = token;
    });

    return unsub;
  }, [ready]);
}
