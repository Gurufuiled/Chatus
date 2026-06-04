import { create } from 'zustand';
import type { Chat } from './types';

type ChatState = {
  chats: Chat[];
  chatsMap: Record<string, Chat>;
  selectedChatId: string | null;
  isLoading: boolean;
};

type ChatActions = {
  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  addOrUpdateChat: (chat: Chat) => void;
  updateChat: (chat: Chat) => void;
  incrementUnread: (chatId: string) => void;
  clearUnread: (chatId: string) => void;
  removeChat: (chatId: string) => void;
  setSelectedChat: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  clearChats: () => void;
  getChatById: (chatId: string) => Chat | undefined;
};

const initialState: ChatState = {
  chats: [],
  chatsMap: {},
  selectedChatId: null,
  isLoading: false,
};

function preserveLocalContactName(incoming: Chat, existing?: Chat): Chat {
  return {
    ...incoming,
    local_contact_name:
      incoming.local_contact_name !== undefined
        ? incoming.local_contact_name
        : existing?.local_contact_name ?? null,
  };
}

export const chatStore = create<ChatState & ChatActions>((set) => ({
  ...initialState,

  setChats: (chats) =>
    set((state) => {
      const existingMap = new Map(state.chats.map((c) => [c.id, c]));
      const nextChats = chats.map((chat) =>
        preserveLocalContactName(chat, existingMap.get(chat.id))
      );
      const chatsMap: Record<string, Chat> = {};
      nextChats.forEach((c) => { chatsMap[c.id] = c; });
      return {
        chats: nextChats,
        chatsMap,
      };
    }),

  addChat: (chat) =>
    set((state) => {
      if (state.chatsMap[chat.id]) return state;
      const nextChats = [...state.chats, chat];
      return {
        chats: nextChats,
        chatsMap: { ...state.chatsMap, [chat.id]: chat },
      };
    }),

  addOrUpdateChat: (chat) =>
    set((state) => {
      const existing = state.chatsMap[chat.id];
      if (existing) {
        const nextChat = preserveLocalContactName(chat, existing);
        return {
          chats: state.chats.map((c) => (c.id === chat.id ? nextChat : c)),
          chatsMap: { ...state.chatsMap, [chat.id]: nextChat },
        };
      }
      return {
        chats: [chat, ...state.chats],
        chatsMap: { ...state.chatsMap, [chat.id]: chat },
      };
    }),

  updateChat: (chat) =>
    set((state) => {
      const exists = state.chatsMap[chat.id];
      if (!exists) return state;
      return {
        chats: state.chats.map((c) => (c.id === chat.id ? chat : c)),
        chatsMap: { ...state.chatsMap, [chat.id]: chat },
      };
    }),

  incrementUnread: (chatId) =>
    set((state) => {
      const existing = state.chatsMap[chatId];
      if (!existing) return state;
      const updated = { ...existing, unread_count: (existing.unread_count ?? 0) + 1 };
      return {
        chats: state.chats.map((c) => (c.id === chatId ? updated : c)),
        chatsMap: { ...state.chatsMap, [chatId]: updated },
      };
    }),

  clearUnread: (chatId) =>
    set((state) => {
      const existing = state.chatsMap[chatId];
      if (!existing || existing.unread_count === 0) return state;
      const updated = { ...existing, unread_count: 0 };
      return {
        chats: state.chats.map((c) => (c.id === chatId ? updated : c)),
        chatsMap: { ...state.chatsMap, [chatId]: updated },
      };
    }),

  removeChat: (chatId) =>
    set((state) => {
      const nextChatsMap = { ...state.chatsMap };
      delete nextChatsMap[chatId];
      return {
        chats: state.chats.filter((c) => c.id !== chatId),
        chatsMap: nextChatsMap,
        selectedChatId: state.selectedChatId === chatId ? null : state.selectedChatId,
      };
    }),

  setSelectedChat: (id) => set({ selectedChatId: id }),

  setLoading: (loading) => set({ isLoading: loading }),

  clearChats: () => set(initialState),

  getChatById: (chatId: string) => {
    return chatStore.getState().chatsMap[chatId];
  },
}));
