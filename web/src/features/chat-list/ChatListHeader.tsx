import { useRef } from 'react';
import { IconButton } from '@/components/buttons/IconButton';
import { useChatUiStore } from '@/stores/chatUiStore';
import './chat-list.css';

export function ChatListHeader() {
  const menuRef = useRef<HTMLButtonElement>(null);
  const isOpen = useChatUiStore((s) => s.isSettingsDrawerOpen);
  const searchQuery = useChatUiStore((s) => s.searchQuery);
  const setSearchQuery = useChatUiStore((s) => s.setSearchQuery);
  const setSettingsDrawerOpen = useChatUiStore((s) => s.setSettingsDrawerOpen);
  const setMenuAnchorRect = useChatUiStore((s) => s.setMenuAnchorRect);

  const toggleMenu = () => {
    if (isOpen) {
      setSettingsDrawerOpen(false);
      return;
    }
    const rect = menuRef.current?.getBoundingClientRect() ?? null;
    setMenuAnchorRect(rect);
    setSettingsDrawerOpen(true);
  };

  return (
    <header className="chat-list-header">
      <IconButton
        ref={menuRef}
        label="Menu"
        className="chat-list-header__menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={toggleMenu}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </IconButton>
      <input
        className="chat-list-header__search"
        type="search"
        placeholder="Поиск"
        aria-label="Поиск чатов и пользователей"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </header>
  );
}
