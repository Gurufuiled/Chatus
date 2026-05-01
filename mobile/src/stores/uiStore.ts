import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { AppAppearancePreference } from '../theme/palettes';

export type ConnectionStatus = 'offline' | 'connecting' | 'online';

export type TypingEntry = { userId: string; at: number };
export type PresenceEntry = { is_online: boolean; last_seen?: number };

export type PushNotificationData = {
  id: string;
  chatId: string;
  title: string;
  messagePreview: string;
  avatarUrl?: string;
  messageType?: string;
};

type UIState = {
  connectionStatus: ConnectionStatus;
  transportStatusVersion: number;
  activeModal: string | null;
  typingUsersByChatId: Record<string, TypingEntry[]>;
  presenceByUserId: Record<string, PresenceEntry>;
  pinnedMessageIdByChatId: Record<string, string | null>;
  isPinnedMessagesHydrated: boolean;
  chatThemeIdByChatId: Record<string, string>;
  isChatThemesHydrated: boolean;
  blockedUserIds: Record<string, true>;
  isBlockedUsersHydrated: boolean;
  pushNotification: PushNotificationData | null;
  /** Global app appearance: system / light / dark */
  appAppearancePreference: AppAppearancePreference;
  isAppAppearanceHydrated: boolean;
};

type UIActions = {
  setConnectionStatus: (status: ConnectionStatus) => void;
  bumpTransportStatus: () => void;
  setActiveModal: (modalId: string | null) => void;
  clearActiveModal: () => void;
  setTypingUser: (chatId: string, userId: string) => void;
  clearStaleTyping: (staleMs?: number) => void;
  setPresence: (userId: string, entry: PresenceEntry) => void;
  setPinnedMessage: (chatId: string, messageId: string | null) => void;
  hydratePinnedMessages: () => Promise<void>;
  setChatTheme: (chatId: string, themeId: string) => void;
  removeChatTheme: (chatId: string) => void;
  hydrateChatThemes: () => Promise<void>;
  setUserBlocked: (userId: string, blocked: boolean) => void;
  hydrateBlockedUsers: () => Promise<void>;
  showPushNotification: (data: Omit<PushNotificationData, 'id'>) => void;
  dismissPushNotification: () => void;
  setAppAppearancePreference: (preference: AppAppearancePreference) => void;
  hydrateAppAppearance: () => Promise<void>;
};

const TYPING_STALE_MS = 5000;
const PINNED_MESSAGES_KEY = 'ui.pinnedMessageIdByChatId';
const CHAT_THEMES_KEY = 'ui.chatThemeIdByChatId';
const BLOCKED_USERS_KEY = 'ui.blockedUserIds';
const APP_APPEARANCE_KEY = 'ui.appAppearancePreference';

const initialState: UIState = {
  connectionStatus: 'offline',
  transportStatusVersion: 0,
  activeModal: null,
  typingUsersByChatId: {},
  presenceByUserId: {},
  pinnedMessageIdByChatId: {},
  isPinnedMessagesHydrated: false,
  chatThemeIdByChatId: {},
  isChatThemesHydrated: false,
  blockedUserIds: {},
  isBlockedUsersHydrated: false,
  pushNotification: null,
  appAppearancePreference: 'system',
  isAppAppearanceHydrated: false,
};

export const uiStore = create<UIState & UIActions>((set) => ({
  ...initialState,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  bumpTransportStatus: () =>
    set((s) => ({ transportStatusVersion: s.transportStatusVersion + 1 })),

  setActiveModal: (modalId) => set({ activeModal: modalId }),

  clearActiveModal: () => set({ activeModal: null }),

  setTypingUser: (chatId, userId) =>
    set((s) => {
      const now = Date.now();
      const existing = s.typingUsersByChatId[chatId] ?? [];
      const filtered = existing.filter((e) => e.userId !== userId);
      const next = [...filtered, { userId, at: now }];
      return {
        typingUsersByChatId: { ...s.typingUsersByChatId, [chatId]: next },
      };
    }),

  clearStaleTyping: (staleMs = TYPING_STALE_MS) =>
    set((s) => {
      const now = Date.now();
      const next: Record<string, TypingEntry[]> = {};
      for (const [chatId, entries] of Object.entries(s.typingUsersByChatId)) {
        const fresh = entries.filter((e) => now - e.at < staleMs);
        if (fresh.length > 0) next[chatId] = fresh;
      }
      return { typingUsersByChatId: next };
    }),

  setPresence: (userId, entry) =>
    set((s) => ({
      presenceByUserId: { ...s.presenceByUserId, [userId]: entry },
    })),

  setPinnedMessage: (chatId, messageId) =>
    set((s) => {
      const next = {
        ...s.pinnedMessageIdByChatId,
        [chatId]: messageId,
      };
      void SecureStore.setItemAsync(PINNED_MESSAGES_KEY, JSON.stringify(next)).catch(() => {});
      return {
        pinnedMessageIdByChatId: next,
      };
    }),

  hydratePinnedMessages: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PINNED_MESSAGES_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
      set({
        pinnedMessageIdByChatId: parsed,
        isPinnedMessagesHydrated: true,
      });
    } catch {
      set({ isPinnedMessagesHydrated: true });
    }
  },

  setChatTheme: (chatId, themeId) =>
    set((s) => {
      const next = {
        ...s.chatThemeIdByChatId,
        [chatId]: themeId,
      };
      void SecureStore.setItemAsync(CHAT_THEMES_KEY, JSON.stringify(next)).catch(() => {});
      return {
        chatThemeIdByChatId: next,
      };
    }),

  removeChatTheme: (chatId) =>
    set((s) => {
      const next = { ...s.chatThemeIdByChatId };
      delete next[chatId];
      void SecureStore.setItemAsync(CHAT_THEMES_KEY, JSON.stringify(next)).catch(() => {});
      return { chatThemeIdByChatId: next };
    }),

  hydrateChatThemes: async () => {
    try {
      const raw = await SecureStore.getItemAsync(CHAT_THEMES_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      set({
        chatThemeIdByChatId: parsed,
        isChatThemesHydrated: true,
      });
    } catch {
      set({ isChatThemesHydrated: true });
    }
  },

  setUserBlocked: (userId, blocked) =>
    set((s) => {
      const next = { ...s.blockedUserIds };
      if (blocked) {
        next[userId] = true;
      } else {
        delete next[userId];
      }
      void SecureStore.setItemAsync(BLOCKED_USERS_KEY, JSON.stringify(next)).catch(() => {});
      return {
        blockedUserIds: next,
      };
    }),

  hydrateBlockedUsers: async () => {
    try {
      const raw = await SecureStore.getItemAsync(BLOCKED_USERS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, true>) : {};
      set({
        blockedUserIds: parsed,
        isBlockedUsersHydrated: true,
      });
    } catch {
      set({ isBlockedUsersHydrated: true });
    }
  },

  showPushNotification: (data) =>
    set({
      pushNotification: { ...data, id: Date.now().toString() },
    }),

  dismissPushNotification: () => set({ pushNotification: null }),

  setAppAppearancePreference: (preference) => {
    void SecureStore.setItemAsync(APP_APPEARANCE_KEY, preference).catch(() => {});
    set({ appAppearancePreference: preference });
  },

  hydrateAppAppearance: async () => {
    try {
      const raw = await SecureStore.getItemAsync(APP_APPEARANCE_KEY);
      const allowed: AppAppearancePreference[] = ['system', 'light', 'dark'];
      const next =
        raw && allowed.includes(raw as AppAppearancePreference)
          ? (raw as AppAppearancePreference)
          : 'system';
      set({
        appAppearancePreference: next,
        isAppAppearanceHydrated: true,
      });
    } catch {
      set({ isAppAppearanceHydrated: true });
    }
  },
}));
