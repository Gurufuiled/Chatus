import { create } from 'zustand';
import {
  insertChatMessageNewestFirst,
  placeOptimisticAtEnd,
  sortChatMessagesNewestFirst,
} from '../utils/chatMessageOrder';
import { filterHiddenMessages, locallyHiddenMessageStore } from './locallyHiddenMessageStore';
import type { Message } from './types';

type MessageState = {
  messagesByChatId: Record<string, Message[]>;
  isLoading: boolean;
};

type MessageActions = {
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  /** Insert message maintaining newest-first order (for inverted chat list). */
  prependMessage: (chatId: string, message: Message) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updates: Partial<Message>
  ) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  clearMessages: (chatId: string) => void;
  setLoading: (loading: boolean) => void;
};

const initialState: MessageState = {
  messagesByChatId: {},
  isLoading: false,
};

export const messageStore = create<MessageState & MessageActions>((set) => ({
  ...initialState,

  setMessages: (chatId, messages) =>
    set((state) => {
      const filteredIncoming = filterHiddenMessages(chatId, messages);
      const existing = state.messagesByChatId[chatId] ?? [];
      const now = Date.now();
      const OPTIMISTIC_TTL_MS = 2 * 60 * 1000;
      const serverIds = new Set(filteredIncoming.map((m) => m.id));
      const pendingLocalOnly = existing.filter((m) => {
        if (!(m.status === 'sending' || m.status === 'failed')) return false;
        if (!m.id.startsWith('temp-')) return false;
        if (serverIds.has(m.id)) return false;
        if (now - m.created_at > OPTIMISTIC_TTL_MS) return false;
        const likelyServerTwin = filteredIncoming.some(
          (srv) =>
            srv.sender_id === m.sender_id &&
            srv.msg_type === m.msg_type &&
            Math.abs(srv.created_at - m.created_at) < 60_000,
        );
        return !likelyServerTwin;
      });
      const merged = sortChatMessagesNewestFirst(
        pendingLocalOnly.length > 0 ? [...pendingLocalOnly, ...filteredIncoming] : filteredIncoming,
      );
      return {
        messagesByChatId: { ...state.messagesByChatId, [chatId]: merged },
      };
    }),

  addMessage: (chatId, message) =>
    set((state) => {
      if (locallyHiddenMessageStore.getState().isHidden(chatId, message.id)) return state;
      const existing = state.messagesByChatId[chatId] ?? [];
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: insertChatMessageNewestFirst(existing, placeOptimisticAtEnd(existing, message)),
        },
      };
    }),

  prependMessage: (chatId, message) =>
    set((state) => {
      if (locallyHiddenMessageStore.getState().isHidden(chatId, message.id)) return state;
      const existing = state.messagesByChatId[chatId] ?? [];
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: insertChatMessageNewestFirst(existing, placeOptimisticAtEnd(existing, message)),
        },
      };
    }),

  updateMessage: (chatId, messageId, updates) =>
    set((state) => {
      const messages = state.messagesByChatId[chatId] ?? [];
      const index = messages.findIndex((m) => m.id === messageId);
      if (index === -1) return state;

      const updated = { ...messages[index], ...updates };
      const without = messages.filter(
        (m) => m.id !== messageId && m.id !== updated.id,
      );

      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: insertChatMessageNewestFirst(without, updated),
        },
      };
    }),

  removeMessage: (chatId, messageId) =>
    set((state) => {
      const messages = state.messagesByChatId[chatId] ?? [];
      const index = messages.findIndex((m) => m.id === messageId);
      if (index === -1) return state;
      
      const nextMessages = [...messages];
      nextMessages.splice(index, 1);
      
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: nextMessages,
        },
      };
    }),

  clearMessages: (chatId) =>
    set((state) => {
      const next = { ...state.messagesByChatId };
      delete next[chatId];
      return { messagesByChatId: next };
    }),

  setLoading: (loading) => set({ isLoading: loading }),
}));
