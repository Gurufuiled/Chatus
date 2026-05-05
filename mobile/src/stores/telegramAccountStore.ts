import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { resetTdlibParametersLock } from '../services/tdlib/tdlibBootstrap';

const STORAGE_KEY = 'chatus.telegram.account.v1';

export type TelegramAuthStatus =
  | 'idle'
  | 'waiting_parameters'
  | 'waiting_phone'
  | 'waiting_code'
  | 'waiting_password'
  | 'ready'
  | 'error';

/**
 * Simplified Telegram chat type resolved from TDLib `chat.type`.
 * - `'private'`     → chatTypePrivate (1-to-1 with user)
 * - `'group'`       → chatTypeBasicGroup (basic group ≤ 1000 members)
 * - `'supergroup'`  → chatTypeSupergroup with is_channel = false (mega-group)
 * - `'channel'`     → chatTypeSupergroup with is_channel = true (broadcast channel)
 * - `'secret'`      → chatTypeSecret (E2E secret chat)
 */
export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel' | 'secret';

export type TelegramDialogRow = {
  id: string;
  title: string;
  lastMessagePreview: string;
  avatarUri?: string | null;
  lastMessageAt?: number | null;
  unreadCount?: number;
  /** TDLib internal chat id as string */
  chatId: string;
  /** Resolved chat type (undefined if not yet loaded). */
  chatType?: TelegramChatType;
  /** Member / subscriber count (undefined if not loaded). */
  memberCount?: number;
};

type TelegramAccountState = {
  authStatus: TelegramAuthStatus;
  /** TDLib user id when authorized */
  telegramUserId: number | null;
  phoneNumberHint: string | null;
  lastError: string | null;
  dialogs: TelegramDialogRow[];
};

type TelegramAccountActions = {
  hydrate: () => Promise<void>;
  persistSnapshot: () => Promise<void>;
  setAuthStatus: (s: TelegramAuthStatus) => void;
  setTelegramUserId: (id: number | null) => void;
  setPhoneHint: (phone: string | null) => void;
  setLastError: (msg: string | null) => void;
  setDialogs: (rows: TelegramDialogRow[]) => void;
  resetTelegramSession: () => Promise<void>;
};

const initial: TelegramAccountState = {
  authStatus: 'idle',
  telegramUserId: null,
  phoneNumberHint: null,
  lastError: null,
  dialogs: [],
};

export const telegramAccountStore = create<TelegramAccountState & TelegramAccountActions>((set, get) => ({
  ...initial,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TelegramAccountState>;
      set({
        authStatus: (parsed.authStatus as TelegramAuthStatus) ?? 'idle',
        telegramUserId:
          typeof parsed.telegramUserId === 'number' ? parsed.telegramUserId : null,
        phoneNumberHint:
          typeof parsed.phoneNumberHint === 'string' ? parsed.phoneNumberHint : null,
        lastError: null,
        dialogs: Array.isArray(parsed.dialogs) ? parsed.dialogs : [],
      });
    } catch {
      set({ lastError: 'Не удалось загрузить состояние Telegram' });
    }
  },

  persistSnapshot: async () => {
    const s = get();
    const payload = {
      authStatus: s.authStatus,
      telegramUserId: s.telegramUserId,
      phoneNumberHint: s.phoneNumberHint,
      dialogs: s.dialogs,
    };
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(payload));
  },

  setAuthStatus: (authStatus) => set({ authStatus }),
  setTelegramUserId: (telegramUserId) => set({ telegramUserId }),
  setPhoneHint: (phoneNumberHint) => set({ phoneNumberHint }),
  setLastError: (lastError) => set({ lastError }),
  setDialogs: (dialogs) => set({ dialogs }),

  resetTelegramSession: async () => {
    resetTdlibParametersLock();
    set({ ...initial });
    await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => undefined);
  },
}));
