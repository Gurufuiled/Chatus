import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { useComposerStore } from '@/stores/composerStore';

function resetComposerStore() {
  useComposerStore.setState({
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
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetComposerStore();
});
