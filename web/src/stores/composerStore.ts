import { create } from 'zustand';

export type VoiceRecordingState = 'idle' | 'recording' | 'processing';

interface ComposerState {
  drafts: Record<string, string>;
  replyToMessageId: string | null;
  replyChatId: string | null;
  composerFocusNonce: number;
  isStickerPickerOpen: boolean;
  isAttachmentPickerOpen: boolean;
  voiceRecordingState: VoiceRecordingState;
  dragDepth: number;
  composerErrors: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
  setReply: (chatId: string, messageId: string | null) => void;
  clearReply: () => void;
  setStickerPickerOpen: (open: boolean) => void;
  setAttachmentPickerOpen: (open: boolean) => void;
  setVoiceRecordingState: (state: VoiceRecordingState) => void;
  incrementDragDepth: () => void;
  decrementDragDepth: () => void;
  resetDragDepth: () => void;
  setComposerError: (chatId: string, message: string | null) => void;
  requestComposerFocus: () => void;
}

const errorClearTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useComposerStore = create<ComposerState>((set, get) => ({
  drafts: {},
  replyToMessageId: null,
  replyChatId: null,
  composerFocusNonce: 0,
  isStickerPickerOpen: false,
  isAttachmentPickerOpen: false,
  voiceRecordingState: 'idle',
  dragDepth: 0,
  composerErrors: {},
  setDraft: (chatId, text) =>
    set((state) => ({
      drafts: { ...state.drafts, [chatId]: text },
    })),
  clearDraft: (chatId) =>
    set((state) => {
      const { [chatId]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    }),
  setReply: (chatId, messageId) =>
    set({ replyChatId: chatId, replyToMessageId: messageId }),
  clearReply: () => set({ replyChatId: null, replyToMessageId: null }),
  setStickerPickerOpen: (isStickerPickerOpen) => set({ isStickerPickerOpen }),
  setAttachmentPickerOpen: (isAttachmentPickerOpen) => set({ isAttachmentPickerOpen }),
  setVoiceRecordingState: (voiceRecordingState) => set({ voiceRecordingState }),
  incrementDragDepth: () => set((s) => ({ dragDepth: s.dragDepth + 1 })),
  decrementDragDepth: () =>
    set((s) => ({ dragDepth: Math.max(0, s.dragDepth - 1) })),
  resetDragDepth: () => set({ dragDepth: 0 }),
  requestComposerFocus: () =>
    set((state) => ({ composerFocusNonce: state.composerFocusNonce + 1 })),
  setComposerError: (chatId, message) => {
    if (errorClearTimers[chatId]) clearTimeout(errorClearTimers[chatId]);
    set((state) => {
      const next = { ...state.composerErrors };
      if (message) next[chatId] = message;
      else delete next[chatId];
      return { composerErrors: next };
    });
    if (message) {
      errorClearTimers[chatId] = setTimeout(() => {
        const current = get().composerErrors[chatId];
        if (current === message) {
          set((state) => {
            const next = { ...state.composerErrors };
            delete next[chatId];
            return { composerErrors: next };
          });
        }
      }, 6000);
    }
  },
}));
