import { create } from 'zustand';

export type WsConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface WsUiState {
  status: WsConnectionStatus;
  hasEverConnected: boolean;
  setConnecting: () => void;
  setConnected: () => void;
  setDisconnected: () => void;
  reset: () => void;
}

export const useWsUiStore = create<WsUiState>((set) => ({
  status: 'disconnected',
  hasEverConnected: false,
  setConnecting: () => set({ status: 'connecting' }),
  setConnected: () => set({ status: 'connected', hasEverConnected: true }),
  setDisconnected: () => set({ status: 'disconnected' }),
  reset: () => set({ status: 'disconnected', hasEverConnected: false }),
}));
