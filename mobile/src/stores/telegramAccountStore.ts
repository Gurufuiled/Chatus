import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { resetTelegramPushRegistrationFlag } from '../services/pushNotificationsService';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import {
  cancelBackgroundTdlibRecovery,
  clearTdlibLoggingOutExpectation,
  ensureTdlibReadyForPhoneLogin,
  markTdlibLoggingOut,
  setTdlibEmptyDatabaseHandler,
  setTdlibStickySessionProbe,
} from '../services/tdlib/tdlibBootstrap';
import { clearUserNameCache } from '../services/tdlib/userNameCache';
import { logTdlibEvent } from '../services/clientRemoteLog';
import {
  normalizeTelegramDialogRow,
  normalizeTelegramDialogRows,
} from '../screens/telegramChat/telegramDialogFallback';

const STORAGE_KEY = 'chatus.telegram.account.v1';
const DIALOGS_CACHE_KEY = 'telegram-dialogs.v1.json';
const DIALOGS_CACHE_MAX_ROWS = 80;
const dialogsCachePath = `${FileSystem.documentDirectory ?? ''}${DIALOGS_CACHE_KEY}`;

export type TelegramAuthStatus =
  | 'idle'
  | 'waiting_parameters'
  | 'waiting_phone'
  | 'waiting_code'
  | 'waiting_password'
  | 'ready'
  | 'error';

/** Keep SecureStore payload small — dialog lists exceed iOS Keychain size limits and break persist. */
type PersistedTelegramAccount = {
  authStatus: TelegramAuthStatus;
  telegramUserId: number | null;
  phoneNumberHint: string | null;
};

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
  /** Patch one dialog row in memory (e.g. clear unread after open/send). */
  patchDialog: (chatId: string, patch: Partial<TelegramDialogRow>) => void;
  /** True while a Telegram account is bound on this device (until Settings logout). */
  hasLocalSession: () => boolean;
  /**
   * Clear JS/SecureStore session without calling TDLib `logOut`
   * (use when the on-disk DB is already gone after LoggingOut / failed recover).
   */
  clearLocalTelegramSession: () => Promise<void>;
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

function buildPersistPayload(s: TelegramAccountState): PersistedTelegramAccount {
  const authStatus = s.authStatus === 'error' ? 'ready' : s.authStatus;
  return {
    authStatus,
    telegramUserId: s.telegramUserId,
    phoneNumberHint: s.phoneNumberHint,
  };
}

function compactDialogsForCache(rows: TelegramDialogRow[]): TelegramDialogRow[] {
  return rows.slice(0, DIALOGS_CACHE_MAX_ROWS).map((row) => ({
    id: row.id,
    chatId: row.chatId,
    title: row.title,
    lastMessagePreview: row.lastMessagePreview,
    lastMessagePreviewAccent: row.lastMessagePreviewAccent,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
    chatType: row.chatType,
    memberCount: row.memberCount,
    isPinned: row.isPinned,
    avatarUri: row.avatarUri ?? null,
    lastMessageThumbnailUris: row.lastMessageThumbnailUris?.slice(0, 3) ?? [],
  }));
}

async function readDialogsCache(): Promise<TelegramDialogRow[]> {
  try {
    if (!dialogsCachePath) return [];
    const info = await FileSystem.getInfoAsync(dialogsCachePath);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(dialogsCachePath);
    const parsed = JSON.parse(raw) as TelegramDialogRow[];
    return normalizeTelegramDialogRows(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

async function writeDialogsCache(rows: TelegramDialogRow[]): Promise<void> {
  try {
    if (!dialogsCachePath) return;
    await FileSystem.writeAsStringAsync(
      dialogsCachePath,
      JSON.stringify(compactDialogsForCache(rows)),
    );
  } catch {
    // Ignore dialogs cache write failures.
  }
}

export const telegramAccountStore = create<TelegramAccountState & TelegramAccountActions>((set, get) => ({
  ...initial,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      const cachedDialogs = await readDialogsCache();
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TelegramAccountState>;
      let authStatus = (parsed.authStatus as TelegramAuthStatus) ?? 'idle';
      // Stale persisted «error» is often a false positive from transient TDLib close.
      if (authStatus === 'error') {
        authStatus = 'ready';
      }
      // Legacy snapshots stored huge dialog arrays in Keychain; ignore them on hydrate.
      set({
        authStatus,
        telegramUserId:
          typeof parsed.telegramUserId === 'number' ? parsed.telegramUserId : null,
        phoneNumberHint:
          typeof parsed.phoneNumberHint === 'string' ? parsed.phoneNumberHint : null,
        lastError: null,
        dialogs: cachedDialogs,
      });
      // Rewrite slim snapshot so next persist cannot fail on legacy oversized values.
      if (Array.isArray(parsed.dialogs) && parsed.dialogs.length > 0) {
        void get().persistSnapshot();
      }
    } catch {
      set({ lastError: 'Не удалось загрузить состояние Telegram' });
    }
  },

  persistSnapshot: async () => {
    try {
      const payload = buildPersistPayload(get());
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      if (__DEV__) {
        console.warn('[telegramAccountStore] persistSnapshot failed', e);
      }
    }
  },

  setAuthStatus: (authStatus) => set({ authStatus }),
  setTelegramUserId: (telegramUserId) => set({ telegramUserId }),
  setPhoneHint: (phoneNumberHint) => set({ phoneNumberHint }),
  setLastError: (lastError) => set({ lastError }),
  setDialogs: (dialogs) => {
    const normalized = normalizeTelegramDialogRows(dialogs);
    set({ dialogs: normalized });
    void writeDialogsCache(normalized);
  },
  setDialogsSyncing: (dialogsSyncing) => set({ dialogsSyncing }),

  patchDialog: (chatId, patch) => {
    const key = String(chatId);
    const dialogs = get().dialogs;
    const index = dialogs.findIndex((row) => row.chatId === key || row.id === key);
    if (index === -1) return;
    const next = [...dialogs];
    next[index] = normalizeTelegramDialogRow({ ...next[index]!, ...patch, chatId: key, id: key });
    if (patch.lastMessageAt != null) {
      next.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
    }
    set({ dialogs: next });
    void writeDialogsCache(next);
  },

  hasLocalSession: () => {
    const s = get();
    return (
      s.authStatus === 'ready' ||
      s.authStatus === 'error' ||
      s.telegramUserId != null ||
      s.dialogs.length > 0
    );
  },

  clearLocalTelegramSession: async () => {
    cancelBackgroundTdlibRecovery();
    clearTdlibLoggingOutExpectation();
    resetTelegramPushRegistrationFlag();
    clearUserNameCache();
    set({
      ...initial,
      authStatus: 'waiting_phone',
    });
    await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => undefined);
    if (dialogsCachePath) {
      await FileSystem.deleteAsync(dialogsCachePath, { idempotent: true }).catch(() => undefined);
    }
  },

  resetTelegramSession: async () => {
    logTdlibEvent('resetTelegramSession called', {
      level: 'warn',
      data: {
        prevStatus: get().authStatus,
        hasUserId: get().telegramUserId != null,
        dialogs: get().dialogs.length,
      },
      flushSoon: true,
    });
    markTdlibLoggingOut();
    try {
      await tdlibClient.send({ '@type': 'logOut' });
    } catch {
      /* native TDLib may be unavailable in dev stub */
    }
    await get().clearLocalTelegramSession();
    // Recreate Closed → WaitPhone so Settings → Telegram can show the phone form immediately.
    try {
      await ensureTdlibReadyForPhoneLogin();
    } catch {
      /* auth screen will retry on focus / submit */
    }
  },
}));

setTdlibStickySessionProbe(() => telegramAccountStore.getState().hasLocalSession());
setTdlibEmptyDatabaseHandler(() => {
  const store = telegramAccountStore.getState();
  if (!store.hasLocalSession()) return;
  logTdlibEvent('clearLocalTelegramSession (empty TDLib DB)', {
    level: 'warn',
    data: { prevStatus: store.authStatus },
    flushSoon: true,
  });
  void store.clearLocalTelegramSession();
});
