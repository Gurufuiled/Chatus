import { useNavigate } from '@tanstack/react-router';
import { IconButton } from '@/components/buttons/IconButton';
import { Avatar } from '@/components/avatar/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMeQuery } from '@/queries/profile.queries';
import { resolveMediaUrl } from '@/services/mediaService';
import {
  formatBirthday,
  formatLastSeen,
  formatPhone,
  formatUsername,
  getDisplayName,
} from './profileFormatters';
import './profile.css';

interface ProfileSettingsPageProps {
  backTo?: string;
}

export function ProfileSettingsPage({ backTo = '/' }: ProfileSettingsPageProps) {
  const navigate = useNavigate();
  const { data: me, isLoading, isError, error } = useMeQuery();

  const goBack = () => {
    void navigate({ to: backTo });
  };

  const goEdit = () => {
    void navigate({ to: '/settings/profile/edit' });
  };

  if (isLoading) {
    return (
      <div className="profile-page">
        <Spinner label="Loading profile" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="profile-page">
        <EmptyState
          title="Не удалось загрузить профиль"
          description={error instanceof Error ? error.message : 'Unknown error'}
        />
      </div>
    );
  }

  const displayName = getDisplayName(me);
  const avatarUrl = me.avatar_url ? resolveMediaUrl(me.avatar_url) : null;
  const phone = formatPhone(me.phone);
  const username = formatUsername(me.handle);
  const birthday = formatBirthday(me.birthday);

  const infoRows = [
    { id: 'phone', label: 'Телефон', value: phone },
    { id: 'username', label: 'Имя пользователя', value: username },
    { id: 'birthday', label: 'День рождения', value: birthday },
    { id: 'bio', label: 'О себе', value: me.bio },
  ];

  return (
    <div className="profile-page">
      <header className="profile-page__header">
        <IconButton label="Назад" onClick={goBack}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M12 4L6 10l6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
        <h1 className="profile-page__title">Настройки</h1>
        <IconButton label="Изменить профиль" onClick={goEdit}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
      </header>

      <div className="profile-page__scroll">
        <section className="profile-hero">
          <Avatar name={displayName} imageUrl={avatarUrl} size={96} />
          <h2 className="profile-hero__name">{displayName}</h2>
          <p className="profile-hero__status">{formatLastSeen(me)}</p>
        </section>

        <div className="profile-info-list">
          {infoRows.map((row) => (
            <div key={row.id} className="profile-info-row">
              <span className="profile-info-row__label">{row.label}</span>
              <span
                className={`profile-info-row__value${row.value ? '' : ' profile-info-row__value--muted'}`}
              >
                {row.value ?? 'Не указано'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
