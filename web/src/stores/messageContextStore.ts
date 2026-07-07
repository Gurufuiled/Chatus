import { create } from 'zustand';

export type MessageMenuMode = 'actions' | 'delete';

export interface MessageMenuAnchor {
  x: number;
  y: number;
  width?: number;
  height?: number;
  isOutgoing?: boolean;
}

interface MessageContextState {
  chatId: string | null;
  messageId: string | null;
  position: MessageMenuAnchor | null;
  mode: MessageMenuMode;
  openMessageMenu: (chatId: string, messageId: string, position: MessageMenuAnchor) => void;
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
