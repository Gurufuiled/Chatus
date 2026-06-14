import { create } from 'zustand';

interface MenuState {
  chatMenuChatId: string | null;
  chatMenuPosition: { x: number; y: number } | null;
  openChatMenu: (chatId: string, position: { x: number; y: number }) => void;
  closeChatMenu: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  chatMenuChatId: null,
  chatMenuPosition: null,
  openChatMenu: (chatMenuChatId, chatMenuPosition) =>
    set({ chatMenuChatId, chatMenuPosition }),
  closeChatMenu: () => set({ chatMenuChatId: null, chatMenuPosition: null }),
}));
