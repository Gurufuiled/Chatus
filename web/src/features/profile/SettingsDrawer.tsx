import { useChatUiStore } from '@/stores/chatUiStore';
import { HamburgerMenu } from './HamburgerMenu';

export function SettingsDrawer() {
  const isOpen = useChatUiStore((s) => s.isSettingsDrawerOpen);
  const anchorRect = useChatUiStore((s) => s.menuAnchorRect);
  const setSettingsDrawerOpen = useChatUiStore((s) => s.setSettingsDrawerOpen);

  if (!isOpen) return null;

  return (
    <HamburgerMenu
      anchorRect={anchorRect}
      onClose={() => setSettingsDrawerOpen(false)}
    />
  );
}
