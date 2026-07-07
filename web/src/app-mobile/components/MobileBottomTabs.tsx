import { useLocation, useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';

type TabId = 'chats' | 'contacts' | 'settings';

function ChatsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.6}>
      {active ? (
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      ) : (
        <path
          d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function ContactsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.6}>
      {active ? (
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      ) : (
        <>
          <path
            d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6}>
      <circle cx="12" cy="12" r="3" fill={active ? 'currentColor' : 'none'} />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TABS: { id: TabId; label: string; to: string; Icon: typeof ChatsIcon }[] = [
  { id: 'chats', label: 'Чаты', to: '/', Icon: ChatsIcon },
  { id: 'contacts', label: 'Контакты', to: '/contacts', Icon: ContactsIcon },
  { id: 'settings', label: 'Настройки', to: '/settings', Icon: SettingsIcon },
];

export function shouldShowMobileTabs(pathname: string): boolean {
  if (pathname.includes('/chat/')) return false;
  if (pathname.includes('/settings/profile')) return false;
  return pathname === '/' || pathname === '/contacts' || pathname === '/settings';
}

function formatBadge(count: number): string {
  if (count > 999) return '999+';
  return String(count);
}

export function MobileBottomTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: chats } = useChatsQuery();

  const totalUnread = (chats ?? [])
    .filter((c) => !c.is_archived)
    .reduce((acc, chat) => acc + Math.max(0, chat.unread_count ?? 0), 0);

  const activeTab: TabId = pathname.startsWith('/settings')
    ? 'settings'
    : pathname.startsWith('/contacts')
      ? 'contacts'
      : 'chats';

  return (
    <nav className="mobile-tab-bar" aria-label="Основная навигация">
      <div className="mobile-tab-bar__pill">
        {TABS.map(({ id, label, to, Icon }) => {
          const active = activeTab === id;
          const showBadge = id === 'chats' && totalUnread > 0;
          return (
            <button
              key={id}
              type="button"
              className={`mobile-tab-bar__item${active ? ' mobile-tab-bar__item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={
                id === 'chats' && totalUnread > 0 ? `${label}, ${totalUnread} непрочитанных` : label
              }
              onClick={() => navigate({ to })}
            >
              <span className="mobile-tab-bar__icon">
                <Icon active={active} />
                {showBadge ? (
                  <span className="mobile-tab-bar__badge">{formatBadge(totalUnread)}</span>
                ) : null}
              </span>
              <span className="mobile-tab-bar__label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
