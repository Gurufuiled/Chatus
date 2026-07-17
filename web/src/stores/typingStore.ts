import { create } from 'zustand';

export const TYPING_TTL_MS = 6_000;
export const TYPING_SEND_INTERVAL_MS = 4_500;

export type TypingEntry = { userId: string; at: number };

interface TypingState {
  typingUsersByChatId: Record<string, TypingEntry[]>;
  setTypingUser: (chatId: string, userId: string, isTyping: boolean) => void;
  clearUserTyping: (chatId: string, userId: string) => void;
  clearStaleTyping: (staleMs?: number) => void;
  clearChatTyping: (chatId: string) => void;
}

export const useTypingStore = create<TypingState>((set) => ({
  typingUsersByChatId: {},

  setTypingUser: (chatId, userId, isTyping) =>
    set((s) => {
      const existing = s.typingUsersByChatId[chatId] ?? [];
      if (!isTyping) {
        const next = existing.filter((e) => e.userId !== userId);
        if (next.length === existing.length) return s;
        const map = { ...s.typingUsersByChatId };
        if (next.length === 0) delete map[chatId];
        else map[chatId] = next;
        return { typingUsersByChatId: map };
      }

      const filtered = existing.filter((e) => e.userId !== userId);
      return {
        typingUsersByChatId: {
          ...s.typingUsersByChatId,
          [chatId]: [...filtered, { userId, at: Date.now() }],
        },
      };
    }),

  clearUserTyping: (chatId, userId) =>
    set((s) => {
      const existing = s.typingUsersByChatId[chatId];
      if (!existing?.length) return s;
      const next = existing.filter((e) => e.userId !== userId);
      if (next.length === existing.length) return s;
      const map = { ...s.typingUsersByChatId };
      if (next.length === 0) delete map[chatId];
      else map[chatId] = next;
      return { typingUsersByChatId: map };
    }),

  clearStaleTyping: (staleMs = TYPING_TTL_MS) =>
    set((s) => {
      const now = Date.now();
      let changed = false;
      const next: Record<string, TypingEntry[]> = {};
      for (const [chatId, entries] of Object.entries(s.typingUsersByChatId)) {
        const fresh = entries.filter((e) => now - e.at < staleMs);
        if (fresh.length !== entries.length) changed = true;
        if (fresh.length > 0) next[chatId] = fresh;
        else if (entries.length > 0) changed = true;
      }
      if (!changed) return s;
      return { typingUsersByChatId: next };
    }),

  clearChatTyping: (chatId) =>
    set((s) => {
      if (!s.typingUsersByChatId[chatId]) return s;
      const map = { ...s.typingUsersByChatId };
      delete map[chatId];
      return { typingUsersByChatId: map };
    }),
}));
