import { useEffect } from 'react';
import { useChatUiStore } from '@/stores/chatUiStore';
import { useComposerStore } from '@/stores/composerStore';
import { useMenuStore } from '@/stores/menuStore';
import { useMessageContextStore } from '@/stores/messageContextStore';
import { useSelectionStore } from '@/stores/selectionStore';

interface GlobalEscapeOptions {
  forwardOpen?: boolean;
  onCloseForward?: () => void;
}

/**
 * Closes the topmost open overlay on Escape (menus, drawers, pickers, selection).
 * Pass `null` to disable (e.g. when a child pane handles overlays).
 */
export function useGlobalEscape(options?: GlobalEscapeOptions | null) {
  const forwardOpen = options?.forwardOpen ?? false;
  const onCloseForward = options?.onCloseForward;
  const enabled = options !== null;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      if (forwardOpen && onCloseForward) {
        onCloseForward();
        return;
      }

      const messageCtx = useMessageContextStore.getState();
      if (messageCtx.messageId) {
        if (messageCtx.mode === 'delete') {
          messageCtx.setMenuMode('actions');
        } else {
          messageCtx.closeMessageMenu();
        }
        return;
      }

      const chatMenu = useMenuStore.getState();
      if (chatMenu.chatMenuChatId) {
        chatMenu.closeChatMenu();
        return;
      }

      const composer = useComposerStore.getState();
      if (composer.isStickerPickerOpen) {
        composer.setStickerPickerOpen(false);
        return;
      }

      const chatUi = useChatUiStore.getState();
      if (chatUi.isSettingsDrawerOpen) {
        chatUi.setSettingsDrawerOpen(false);
        return;
      }

      const selection = useSelectionStore.getState();
      if (selection.isActive) {
        selection.exitSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, forwardOpen, onCloseForward]);
}
