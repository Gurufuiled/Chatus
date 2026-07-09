import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { resetTelegramPushRegistrationFlag } from '../services/pushNotificationsService';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { clearUserNameCache } from '../services/tdlib/userNameCache';
import { normalizeTelegramDialogRows } from '../screens/telegramChat/telegramDialogFallback';

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
  /** До 3 миниатюр последнего поста (фото/видео) для списка диалогов. */
  lastMessageThumbnailUris?: string[];
  /** Подпись медиа accent-цветом («Фотография», «Видео»). */
  lastMessagePreviewAccent?: boolean;
  avatarUri?: string | null;
  /** TDLib small photo file id while avatar is still downloading (`updateFile` patches `avatarUri`). */
  avatarFileId?: number;
  lastMessageAt?: number | null;
  unreadCount?: number;
  /** TDLib internal chat id as string */
  chatId: string;
  /** Resolved chat type (undefined if not yet loaded). */
  chatType?: TelegramChatType;
  /** Member / subscriber count (undefined if not loaded). */
  memberCount?: number;
  /** Whether the chat is pinned in the main chat list. */
  isPinned?: boolean;
};

type TelegramAccountState = {
  authStatus: TelegramAuthStatus;
  /** TDLib user id when authorized */
  telegramUserId: number | null;
  phoneNumberHint: string | null;
  lastError: string | null;
  dialogs: TelegramDialogRow[];
  /** `refreshTelegramDialogs` in flight — for chat-list loading banner. */
  dialogsSyncing: boolean;
};

type TelegramAccountActions = {
  hydrate: () => Promise<void>;
  persistSnapshot: () => Promise<void>;
  setAuthStatus: (s: TelegramAuthStatus) => void;
  setTelegramUserId: (id: number | null) => void;
  setPhoneHint: (phone: string | null) => void;
  setLastError: (msg: string | null) => void;
  setDialogs: (rows: TelegramDialogRow[]) => void;
  setDialogsSyncing: (syncing: boolean) => void;
  resetTelegramSession: () => Promise<void>;
};

const initial: TelegramAccountState = {
  authStatus: 'idle',
  telegramUserId: null,
  phoneNumberHint: null,
  lastError: null,
  dialogs: [],
  dialogsSyncing: false,
};

export const telegramAccountStore = create<TelegramAccountState & TelegramAccountActions>((set, get) => ({
  ...initial,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TelegramAccountState>;
      let authStatus = (parsed.authStatus as TelegramAuthStatus) ?? 'idle';
      // Stale persisted «error» is often a false positive from transient TDLib close.
      if (authStatus === 'error') {
        authStatus = 'ready';
      }
      set({
        authStatus,
        telegramUserId:
          typeof parsed.telegramUserId === 'number' ? parsed.telegramUserId : null,
        phoneNumberHint:
          typeof parsed.phoneNumberHint === 'string' ? parsed.phoneNumberHint : null,
        lastError: null,
        dialogs: Array.isArray(parsed.dialogs)
          ? normalizeTelegramDialogRows(parsed.dialogs as TelegramDialogRow[])
          : [],
      });
    } catch {
      set({ lastError: 'Не удалось загрузить состояние Telegram' });
    }
  },

  persistSnapshot: async () => {
    const s = get();
    const authStatus = s.authStatus === 'error' ? 'ready' : s.authStatus;
    const payload = {
      authStatus,
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
  setDialogs: (dialogs) => set({ dialogs: normalizeTelegramDialogRows(dialogs) }),
  setDialogsSyncing: (dialogsSyncing) => set({ dialogsSyncing }),

  resetTelegramSession: async () => {
    try {
      await tdlibClient.send({ '@type': 'logOut' });
    } catch {
      /* native TDLib may be unavailable in dev stub */
    }
    resetTelegramPushRegistrationFlag();
    clearUserNameCache();
    set({ ...initial });
    await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => undefined);
  },
}));
