import { useLocation, useNavigate } from '@tanstack/react-router';
import { useChatsQuery } from '@/queries/chats.queries';
import { TELEGRAM_TAB_GLYPHS, type TabGlyphKey } from '../icons/telegramTabGlyphs';

type TabId = 'chats' | 'contacts' | 'settings';

function TabGlyphIcon({ tab, active }: { tab: TabGlyphKey; active: boolean }) {
  const glyph = active ? TELEGRAM_TAB_GLYPHS[tab].active : TELEGRAM_TAB_GLYPHS[tab].inactive;
  return (
    <svg viewBox="0 0 72 72" aria-hidden>
      <path d={glyph.d} fill="currentColor" fillRule={glyph.fillRule ?? 'nonzero'} />
    </svg>
  );
}

const TABS: { id: TabId; label: string; to: string; glyph: TabGlyphKey }[] = [
  { id: 'chats', label: 'Чаты', to: '/', glyph: 'chats' },
  { id: 'contacts', label: 'Контакты', to: '/contacts', glyph: 'contacts' },
  { id: 'settings', label: 'Настройки', to: '/settings', glyph: 'settings' },
];

export function shouldShowMobileTabs(pathname: string): boolean {
  if (pathname.includes('/chat/')) return false;
  if (pathname.startsWith('/miniapp/')) return false;
  if (pathname.startsWith('/settings/') && pathname !== '/settings') return false;
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
        {TABS.map(({ id, label, to, glyph }) => {
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
                <TabGlyphIcon tab={glyph} active={active} />
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
