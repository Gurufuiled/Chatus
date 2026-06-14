import { create } from 'zustand';

interface SelectionState {
  chatId: string | null;
  selectedIds: string[];
  isActive: boolean;
  enterSelection: (chatId: string, messageId: string) => void;
  toggleMessage: (messageId: string) => void;
  setSelected: (messageId: string, selected: boolean) => void;
  clearSelection: () => void;
  exitSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  chatId: null,
  selectedIds: [],
  isActive: false,
  enterSelection: (chatId, messageId) =>
    set({ chatId, selectedIds: [messageId], isActive: true }),
  toggleMessage: (messageId) => {
    const { selectedIds } = get();
    if (selectedIds.includes(messageId)) {
      const next = selectedIds.filter((id) => id !== messageId);
      set({
        selectedIds: next,
        isActive: next.length > 0,
        chatId: next.length > 0 ? get().chatId : null,
      });
    } else {
      set({ selectedIds: [...selectedIds, messageId] });
    }
  },
  setSelected: (messageId, selected) => {
    const { selectedIds } = get();
    if (selected && !selectedIds.includes(messageId)) {
      set({ selectedIds: [...selectedIds, messageId], isActive: true });
    } else if (!selected) {
      const next = selectedIds.filter((id) => id !== messageId);
      set({
        selectedIds: next,
        isActive: next.length > 0,
        chatId: next.length > 0 ? get().chatId : null,
      });
    }
  },
  clearSelection: () => set({ selectedIds: [], isActive: false, chatId: null }),
  exitSelection: () => set({ selectedIds: [], isActive: false, chatId: null }),
}));
