import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'chatus.inbox.mode.v1';

export type InboxMode = 'loginus' | 'telegram';

type InboxModeState = {
  activeInbox: InboxMode;
  isHydrated: boolean;
};

type InboxModeActions = {
  hydrate: () => Promise<void>;
  setActiveInbox: (mode: InboxMode) => void;
};

export const inboxModeStore = create<InboxModeState & InboxModeActions>((set) => ({
  activeInbox: 'loginus',
  isHydrated: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      set({
        activeInbox: raw === 'telegram' ? 'telegram' : 'loginus',
        isHydrated: true,
      });
    } catch {
      set({ activeInbox: 'loginus', isHydrated: true });
    }
  },

  setActiveInbox: (activeInbox) => {
    set({ activeInbox });
    void SecureStore.setItemAsync(STORAGE_KEY, activeInbox).catch(() => undefined);
  },
}));
