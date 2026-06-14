import { create } from 'zustand';

interface ChatUiState {
  searchQuery: string;
  isSettingsDrawerOpen: boolean;
  menuAnchorRect: DOMRect | null;
  setSearchQuery: (query: string) => void;
  setSettingsDrawerOpen: (open: boolean) => void;
  setMenuAnchorRect: (rect: DOMRect | null) => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  searchQuery: '',
  isSettingsDrawerOpen: false,
  menuAnchorRect: null,
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSettingsDrawerOpen: (isSettingsDrawerOpen) =>
    set({ isSettingsDrawerOpen, ...(isSettingsDrawerOpen ? {} : { menuAnchorRect: null }) }),
  setMenuAnchorRect: (menuAnchorRect) => set({ menuAnchorRect }),
}));
