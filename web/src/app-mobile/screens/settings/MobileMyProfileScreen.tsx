import { useMeQuery } from '@/queries/profile.queries';
import { resolveMediaUrl } from '@/services/mediaService';
import {
  formatBirthday,
  formatPhone,
  formatUsername,
  getDisplayName,
} from '@/features/profile/profileFormatters';
import { SettingsSubpageLayout } from '../../components/settings/SettingsSubpageLayout';

export function MobileMyProfileScreen() {
  const { data: me, isLoading } = useMeQuery();

  if (isLoading || !me) {
    return (
      <SettingsSubpageLayout title="Профиль">
        <div className="mobile-settings__loading">Загрузка…</div>
      </SettingsSubpageLayout>
    );
  }

  const displayName = getDisplayName(me);
  const avatarUrl = me.avatar_url ? resolveMediaUrl(me.avatar_url) : null;
  const rows = [
    { label: 'Телефон', value: formatPhone(me.phone) },
    { label: 'Имя пользователя', value: formatUsername(me.handle) },
    { label: 'День рождения', value: formatBirthday(me.birthday) },
    { label: 'О себе', value: me.bio },
  ];

  return (
    <SettingsSubpageLayout title="Профиль">
      <div className="mobile-settings-profile">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="mobile-settings-profile__avatar" />
        ) : (
          <span className="mobile-settings-profile__avatar-fallback">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <h2 className="mobile-settings-profile__name">{displayName}</h2>
        <div className="mobile-settings-card mobile-settings-profile__card">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={`mobile-settings-profile__row${index < rows.length - 1 ? ' mobile-settings-profile__row--bordered' : ''}`}
            >
              <span className="mobile-settings-profile__label">{row.label}</span>
              <span
                className={`mobile-settings-profile__value${row.value ? '' : ' mobile-settings-profile__value--muted'}`}
              >
                {row.value || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </SettingsSubpageLayout>
  );
}
