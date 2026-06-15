import { create } from 'zustand';
import type { MessageMediaInput } from '@/services/messageService';
import type { MessageType } from '@/types/message';

export type VoiceRecordingState = 'idle' | 'recording' | 'processing';

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  sendAsFile: boolean;
  uploadedMedia?: MessageMediaInput;
  uploadedMsgType?: MessageType;
}

interface ComposerState {
  drafts: Record<string, string>;
  pendingAttachments: Record<string, PendingAttachment[]>;
  replyToMessageId: string | null;
  replyChatId: string | null;
  composerFocusNonce: number;
  isStickerPickerOpen: boolean;
  isAttachmentPickerOpen: boolean;
  voiceRecordingState: VoiceRecordingState;
  voiceRecordingChatId: string | null;
  dragDepth: number;
  composerErrors: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
  addPendingAttachment: (chatId: string, file: File, sendAsFile?: boolean) => void;
  removePendingAttachment: (chatId: string, id: string) => void;
  removePendingAttachmentsByIds: (chatId: string, ids: string[]) => void;
  markPendingAttachmentUploaded: (
    chatId: string,
    id: string,
    uploadedMedia: MessageMediaInput,
    uploadedMsgType: MessageType,
  ) => void;
  clearPendingAttachments: (chatId: string) => void;
  setReply: (chatId: string, messageId: string | null) => void;
  clearReply: () => void;
  setStickerPickerOpen: (open: boolean) => void;
  setAttachmentPickerOpen: (open: boolean) => void;
  setVoiceRecording: (state: VoiceRecordingState, chatId?: string | null) => void;
  incrementDragDepth: () => void;
  decrementDragDepth: () => void;
  resetDragDepth: () => void;
  setComposerError: (chatId: string, message: string | null) => void;
  requestComposerFocus: () => void;
}

const errorClearTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function revokePreviewUrl(url: string) {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export const useComposerStore = create<ComposerState>((set, get) => ({
  drafts: {},
  pendingAttachments: {},
  replyToMessageId: null,
  replyChatId: null,
  composerFocusNonce: 0,
  isStickerPickerOpen: false,
  isAttachmentPickerOpen: false,
  voiceRecordingState: 'idle',
  voiceRecordingChatId: null,
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
  addPendingAttachment: (chatId, file, sendAsFile = false) => {
    const existing = get().pendingAttachments[chatId] ?? [];
    if (existing.length >= 10) {
      get().setComposerError(chatId, 'Можно прикрепить не больше 10 файлов');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const item: PendingAttachment = {
      id: crypto.randomUUID(),
      file,
      previewUrl,
      sendAsFile,
    };
    set((state) => ({
      pendingAttachments: {
        ...state.pendingAttachments,
        [chatId]: [...existing, item],
      },
    }));
  },
  removePendingAttachment: (chatId, id) =>
    set((state) => {
      const list = state.pendingAttachments[chatId] ?? [];
      const removed = list.find((item) => item.id === id);
      if (removed) revokePreviewUrl(removed.previewUrl);
      const next = list.filter((item) => item.id !== id);
      const pendingAttachments = { ...state.pendingAttachments };
      if (next.length) pendingAttachments[chatId] = next;
      else delete pendingAttachments[chatId];
      return { pendingAttachments };
    }),
  removePendingAttachmentsByIds: (chatId, ids) => {
    const idSet = new Set(ids);
    set((state) => {
      const list = state.pendingAttachments[chatId] ?? [];
      for (const item of list) {
        if (idSet.has(item.id)) revokePreviewUrl(item.previewUrl);
      }
      const next = list.filter((item) => !idSet.has(item.id));
      const pendingAttachments = { ...state.pendingAttachments };
      if (next.length) pendingAttachments[chatId] = next;
      else delete pendingAttachments[chatId];
      return { pendingAttachments };
    });
  },
  markPendingAttachmentUploaded: (chatId, id, uploadedMedia, uploadedMsgType) =>
    set((state) => {
      const list = state.pendingAttachments[chatId];
      if (!list?.length) return state;
      return {
        pendingAttachments: {
          ...state.pendingAttachments,
          [chatId]: list.map((item) =>
            item.id === id ? { ...item, uploadedMedia, uploadedMsgType } : item,
          ),
        },
      };
    }),
  clearPendingAttachments: (chatId) =>
    set((state) => {
      const list = state.pendingAttachments[chatId] ?? [];
      for (const item of list) revokePreviewUrl(item.previewUrl);
      const pendingAttachments = { ...state.pendingAttachments };
      delete pendingAttachments[chatId];
      return { pendingAttachments };
    }),
  setReply: (chatId, messageId) =>
    set({ replyChatId: chatId, replyToMessageId: messageId }),
  clearReply: () => set({ replyChatId: null, replyToMessageId: null }),
  setStickerPickerOpen: (isStickerPickerOpen) => set({ isStickerPickerOpen }),
  setAttachmentPickerOpen: (isAttachmentPickerOpen) => set({ isAttachmentPickerOpen }),
  setVoiceRecording: (voiceRecordingState, chatId) =>
    set({
      voiceRecordingState,
      voiceRecordingChatId:
        voiceRecordingState === 'idle' ? null : (chatId ?? get().voiceRecordingChatId),
    }),
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
