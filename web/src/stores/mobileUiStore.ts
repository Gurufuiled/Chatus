import { create } from 'zustand';

export type AppAppearancePreference = 'system' | 'light' | 'dark';
export type ChatListFilter = 'all' | 'chatus_only' | 'telegram_only';

const APPEARANCE_KEY = 'mobile-app.appearance';
const CHAT_FILTER_KEY = 'mobile-app.chatListFilter';

type MobileUiState = {
  appAppearancePreference: AppAppearancePreference;
  chatListFilter: ChatListFilter;
  hydrated: boolean;
};

type MobileUiActions = {
  hydrate: () => void;
  setAppAppearancePreference: (preference: AppAppearancePreference) => void;
  setChatListFilter: (filter: ChatListFilter) => void;
};

function readAppearance(): AppAppearancePreference {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

function readChatFilter(): ChatListFilter {
  try {
    const raw = localStorage.getItem(CHAT_FILTER_KEY);
    if (raw === 'all' || raw === 'chatus_only' || raw === 'telegram_only') return raw;
  } catch {
    /* ignore */
  }
  return 'all';
}

export const useMobileUiStore = create<MobileUiState & MobileUiActions>((set) => ({
  appAppearancePreference: 'system',
  chatListFilter: 'all',
  hydrated: false,
  hydrate: () => {
    set({
      appAppearancePreference: readAppearance(),
      chatListFilter: readChatFilter(),
      hydrated: true,
    });
  },
  setAppAppearancePreference: (preference) => {
    try {
      localStorage.setItem(APPEARANCE_KEY, preference);
    } catch {
      /* ignore */
    }
    set({ appAppearancePreference: preference });
  },
  setChatListFilter: (filter) => {
    try {
      localStorage.setItem(CHAT_FILTER_KEY, filter);
    } catch {
      /* ignore */
    }
    set({ chatListFilter: filter });
  },
}));
