import { useNavigate } from '@tanstack/react-router';
import { logoutPublicAuth } from '@/auth/publicAuth';
import { queryClient } from '@/app/queryClient-app';
import { useMeQuery } from '@/queries/profile.queries';
import { resolveMediaUrl } from '@/services/mediaService';
import { getDisplayName, formatLastSeen } from '@/features/profile/profileFormatters';

export function MobileSettingsHomeScreen() {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();

  const displayName = me ? getDisplayName(me) : 'Профиль';
  const avatarUrl = me?.avatar_url ? resolveMediaUrl(me.avatar_url) : null;
  const initials = displayName.slice(0, 1).toUpperCase();

  const handleLogout = () => {
    queryClient.clear();
    logoutPublicAuth();
  };

  return (
    <div className="mobile-settings">
      <header className="mobile-chat-list__toolbar">
        <h1 className="mobile-chat-list__title">Настройки</h1>
      </header>
      <div className="mobile-settings__scroll">
        <button
          type="button"
          className="mobile-settings__profile-row"
          onClick={() => navigate({ to: '/settings/profile' })}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="mobile-settings__avatar" />
          ) : (
            <span className="mobile-settings__avatar-fallback">{initials}</span>
          )}
          <span className="mobile-settings__profile-text">
            <span className="mobile-settings__profile-name">{displayName}</span>
            {me ? (
              <span className="mobile-settings__profile-status">{formatLastSeen(me)}</span>
            ) : null}
          </span>
          <svg className="mobile-settings__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <section className="mobile-settings__section">
          <p className="mobile-settings__section-label">Скоро</p>
          <div className="mobile-settings__stub">Контакты</div>
          <div className="mobile-settings__stub">Внешний вид</div>
          <div className="mobile-settings__stub">Уведомления</div>
        </section>

        <section className="mobile-settings__section">
          <button type="button" className="mobile-settings__logout" onClick={handleLogout}>
            Выйти
          </button>
        </section>
      </div>
    </div>
  );
}
