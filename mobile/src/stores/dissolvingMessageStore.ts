import { useSyncExternalStore } from 'react';
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

/** Подписка на снимок для dissolve; без неё React.memo не увидит только `end()`. */
export function useDissolveSnapshot(chatId: string, messageId: string): Message | null {
  return useSyncExternalStore(
    (onStoreChange) => dissolvingMessageStore.subscribe(onStoreChange),
    () => dissolvingMessageStore.getState().getSnapshot(chatId, messageId),
    () => null,
  );
}
