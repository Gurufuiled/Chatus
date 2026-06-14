import { create } from 'zustand';

export type MessageMenuMode = 'actions' | 'delete';

interface MessageContextState {
  chatId: string | null;
  messageId: string | null;
  position: { x: number; y: number } | null;
  mode: MessageMenuMode;
  openMessageMenu: (
    chatId: string,
    messageId: string,
    position: { x: number; y: number },
  ) => void;
  setMenuMode: (mode: MessageMenuMode) => void;
  closeMessageMenu: () => void;
}

export const useMessageContextStore = create<MessageContextState>((set) => ({
  chatId: null,
  messageId: null,
  position: null,
  mode: 'actions',
  openMessageMenu: (chatId, messageId, position) =>
    set({ chatId, messageId, position, mode: 'actions' }),
  setMenuMode: (mode) => set({ mode }),
  closeMessageMenu: () =>
    set({ chatId: null, messageId: null, position: null, mode: 'actions' }),
}));
