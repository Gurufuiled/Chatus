import { create } from 'zustand';
import type { Message } from './types';

type State = {
  hiddenByChatId: Record<string, Set<string>>;
  markHidden: (chatId: string, messageId: string) => void;
  /** True if this device hides the message from the chat list (others' messages only). */
  isHidden: (chatId: string, messageId: string) => boolean;
  hydrate: (rows: { chat_id: string; message_id: string }[]) => void;
};

export const locallyHiddenMessageStore = create<State>((set, get) => ({
  hiddenByChatId: {},
  markHidden: (chatId, messageId) =>
    set((s) => {
      const next = { ...s.hiddenByChatId };
      const setForChat = new Set(next[chatId] ?? []);
      setForChat.add(messageId);
      next[chatId] = setForChat;
      return { hiddenByChatId: next };
    }),
  isHidden: (chatId, messageId) =>
    get().hiddenByChatId[chatId]?.has(messageId) ?? false,
  hydrate: (rows) => {
    const hiddenByChatId: Record<string, Set<string>> = {};
    for (const r of rows) {
      if (!hiddenByChatId[r.chat_id]) hiddenByChatId[r.chat_id] = new Set();
      hiddenByChatId[r.chat_id].add(r.message_id);
    }
    set({ hiddenByChatId });
  },
}));

export function filterHiddenMessages<T extends Pick<Message, 'id'>>(
  chatId: string,
  messages: T[]
): T[] {
  const hidden = locallyHiddenMessageStore.getState().hiddenByChatId[chatId];
  if (!hidden || hidden.size === 0) return messages;
  return messages.filter((m) => !hidden.has(m.id));
}
