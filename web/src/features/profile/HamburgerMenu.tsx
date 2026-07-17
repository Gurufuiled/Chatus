import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Avatar } from '@/components/avatar/Avatar';
import { useMeQuery } from '@/queries/profile.queries';
import { useChatUiStore } from '@/stores/chatUiStore';
import { resolveMediaUrl } from '@/services/mediaService';
import {
  formatPhone,
  formatUsername,
  getDisplayName,
} from './profileFormatters';
import './profile.css';

interface HamburgerMenuProps {
  anchorRect: DOMRect | null;
  onClose: () => void;
}

interface MenuItemDef {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  showChevron?: boolean;
  onSelect?: () => void;
}

function MenuIcon({ children }: { children: ReactNode }) {
  return <span className="hamburger-menu__item-icon" aria-hidden>{children}</span>;
}

export function HamburgerMenu({ anchorRect, onClose }: HamburgerMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const setSettingsDrawerOpen = useChatUiStore((s) => s.setSettingsDrawerOpen);

  const displayName = me ? getDisplayName(me) : '…';
  const avatarUrl = me?.avatar_url ? resolveMediaUrl(me.avatar_url) : null;
  const subtitle = me
    ? formatUsername(me.handle) ?? formatPhone(me.phone) ?? null
    : null;

  const openProfile = () => {
    setSettingsDrawerOpen(false);
    void navigate({ to: '/settings/profile' });
    onClose();
  };

  const items: MenuItemDef[] = [
    {
      id: 'profile',
      label: 'Мой профиль',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
      onSelect: openProfile,
    },
    {
      id: 'settings',
      label: 'Настройки',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M10 3v1.2M10 15.8V17M17 10h-1.2M4.2 10H3M14.9 5.1l-.85.85M5.95 14.05l-.85.85M14.9 14.9l-.85-.85M5.95 5.95l-.85-.85"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ),
      onSelect: openProfile,
    },
  ];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!anchorRect) return null;

  const top = anchorRect.bottom + 6;
  const left = Math.min(anchorRect.left, window.innerWidth - 296);

  return (
    <>
      <div className="settings-drawer__backdrop" onMouseDown={onClose} aria-hidden />
      <div
        ref={ref}
        className="hamburger-menu"
        style={{ top, left }}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="hamburger-menu__profile" onClick={openProfile}>
          <Avatar name={displayName} imageUrl={avatarUrl} size={40} />
          <span className="hamburger-menu__profile-text">
            <span className="hamburger-menu__profile-name">{displayName}</span>
            {subtitle ? (
              <span className="hamburger-menu__profile-subtitle">{subtitle}</span>
            ) : null}
          </span>
        </button>
        <div className="hamburger-menu__divider" />
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="hamburger-menu__item"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect?.();
            }}
          >
            <MenuIcon>{item.icon}</MenuIcon>
            <span>{item.label}</span>
            {item.showChevron ? (
              <span className="hamburger-menu__item-chevron" aria-hidden>
                ›
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </>
  );
}
