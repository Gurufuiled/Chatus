import { create } from 'zustand';
import type { Message } from './types';

type Entry = { chatId: string; messageId: string; snapshot: Message };

type State = {
  entries: Record<string, Entry>;
};

function key(chatId: string, messageId: string) {
  return `${chatId}:${messageId}`;
}

export const dissolvingMessageStore = create<
  State & {
    begin: (entry: Entry) => void;
    end: (chatId: string, messageId: string) => void;
    getSnapshot: (chatId: string, messageId: string) => Message | null;
  }
>((set, get) => ({
  entries: {},

  begin: (entry) =>
    set((s) => ({
      entries: {
        ...s.entries,
        [key(entry.chatId, entry.messageId)]: entry,
      },
    })),

  end: (chatId, messageId) =>
    set((s) => {
      const next = { ...s.entries };
      delete next[key(chatId, messageId)];
      return { entries: next };
    }),

  getSnapshot: (chatId, messageId) => get().entries[key(chatId, messageId)]?.snapshot ?? null,
}));
