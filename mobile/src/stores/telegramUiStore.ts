import { create } from 'zustand';

/**
 * Какой TDLib-чат сейчас открыт (экран `TelegramChat`), чтобы не дублировать трей при активном чате.
 */
type TelegramUiState = {
  activeTelegramChatId: string | null;
};

type TelegramUiActions = {
  setActiveTelegramChatId: (chatId: string | null) => void;
};

export const telegramUiStore = create<TelegramUiState & TelegramUiActions>((set) => ({
  activeTelegramChatId: null,
  setActiveTelegramChatId: (activeTelegramChatId) => set({ activeTelegramChatId }),
}));
