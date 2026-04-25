import { create } from 'zustand';
import type { Chat } from './types';

type ChatState = {
  chats: Chat[];
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
};

const initialState: ChatState = {
  chats: [],
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
      return {
        chats: chats.map((chat) =>
          preserveLocalContactName(chat, existingMap.get(chat.id))
        ),
      };
    }),

  addChat: (chat) =>
    set((state) => ({
      chats: state.chats.some((c) => c.id === chat.id)
        ? state.chats
        : [...state.chats, chat],
    })),

  addOrUpdateChat: (chat) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id);
      if (idx >= 0) {
        const next = [...state.chats];
        next[idx] = preserveLocalContactName(chat, state.chats[idx]);
        return { chats: next };
      }
      return { chats: [chat, ...state.chats] };
    }),

  updateChat: (chat) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chat.id ? chat : c)),
    })),

  incrementUnread: (chatId) =>
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              unread_count: (chat.unread_count ?? 0) + 1,
            }
          : chat
      ),
    })),

  clearUnread: (chatId) =>
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId && chat.unread_count !== 0
          ? {
              ...chat,
              unread_count: 0,
            }
          : chat
      ),
    })),

  removeChat: (chatId) =>
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      selectedChatId: state.selectedChatId === chatId ? null : state.selectedChatId,
    })),

  setSelectedChat: (id) => set({ selectedChatId: id }),

  setLoading: (loading) => set({ isLoading: loading }),

  clearChats: () => set(initialState),
}));
