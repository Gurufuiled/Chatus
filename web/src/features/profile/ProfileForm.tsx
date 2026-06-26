import type { AuthUser } from '@/types/auth';
import type { ProfileFormValues } from '@/types/profile';
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  LAST_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@/types/profile';
import { birthdayMsToInputValue, formatBirthday } from './profileFormatters';
import './profile.css';

interface ProfileFormProps {
  values: ProfileFormValues;
  onChange: (values: ProfileFormValues) => void;
  error?: string | null;
}

const USERNAME_RE = /^[a-zA-Z0-9_]*$/;

export function userToFormValues(user: AuthUser): ProfileFormValues {
  return {
    firstName: user.display_name ?? '',
    lastName: user.last_name ?? '',
    bio: user.bio ?? '',
    birthday: birthdayMsToInputValue(user.birthday),
    username: user.handle ?? '',
  };
}

export function validateProfileForm(values: ProfileFormValues): string | null {
  if (!values.firstName.trim()) {
    return 'Имя обязательно для заполнения';
  }
  if (values.firstName.trim().length > DISPLAY_NAME_MAX_LENGTH) {
    return `Имя: не более ${DISPLAY_NAME_MAX_LENGTH} символов`;
  }
  if (values.lastName.trim().length > LAST_NAME_MAX_LENGTH) {
    return `Фамилия: не более ${LAST_NAME_MAX_LENGTH} символов`;
  }
  const username = values.username.trim();
  if (username) {
    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
      return `Имя пользователя: ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} символов`;
    }
    if (!USERNAME_RE.test(username)) {
      return 'Имя пользователя может содержать только буквы, цифры и _';
    }
  }
  if (values.bio.length > BIO_MAX_LENGTH) {
    return `О себе: не более ${BIO_MAX_LENGTH} символов`;
  }
  return null;
}

export function ProfileForm({ values, onChange, error }: ProfileFormProps) {
  const birthdayDisplay = values.birthday
    ? formatBirthday(new Date(`${values.birthday}T12:00:00.000Z`).getTime())
    : null;

  const setField = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
      {error ? <p className="profile-form__error" role="alert">{error}</p> : null}

      <div className="profile-form__field">
        <label className="profile-form__label" htmlFor="profile-first-name">
          Имя (обязательно)
        </label>
        <input
          id="profile-first-name"
          className="profile-form__input"
          value={values.firstName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(e) => setField('firstName', e.target.value)}
          autoComplete="given-name"
        />
      </div>

      <div className="profile-form__field">
        <label className="profile-form__label" htmlFor="profile-last-name">
          Фамилия (необязательно)
        </label>
        <input
          id="profile-last-name"
          className="profile-form__input"
          value={values.lastName}
          maxLength={LAST_NAME_MAX_LENGTH}
          onChange={(e) => setField('lastName', e.target.value)}
          autoComplete="family-name"
        />
      </div>

      <div className="profile-form__field">
        <label className="profile-form__label" htmlFor="profile-bio">
          О себе
        </label>
        <div className="profile-form__textarea-wrap">
          <textarea
            id="profile-bio"
            className="profile-form__textarea"
            value={values.bio}
            maxLength={BIO_MAX_LENGTH}
            onChange={(e) => setField('bio', e.target.value)}
          />
          <span className="profile-form__char-count">{BIO_MAX_LENGTH - values.bio.length}</span>
        </div>
        <p className="profile-form__hint">
          Любые подробности, например: возраст, род занятий или город. Пример: 23 года, дизайнер из
          Санкт-Петербурга.
        </p>
      </div>

      <div className="profile-form__field">
        <label className="profile-form__label" htmlFor="profile-birthday">
          День рождения
        </label>
        <div className="profile-form__birthday-row">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <rect x="3" y="6" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3 9h14M7 4v3M13 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            id="profile-birthday"
            type="date"
            value={values.birthday}
            onChange={(e) => setField('birthday', e.target.value)}
            aria-label="День рождения"
          />
          {birthdayDisplay ? (
            <span className="profile-form__birthday-label">{birthdayDisplay}</span>
          ) : null}
          {values.birthday ? (
            <button
              type="button"
              className="profile-form__birthday-clear"
              onClick={() => setField('birthday', '')}
            >
              Удалить
            </button>
          ) : null}
        </div>
        <p className="profile-form__hint">
          Вы можете выбрать, кто будет видеть Ваш день рождения, в настройках.
        </p>
      </div>

      <p className="profile-form__section-title">Имя пользователя</p>
      <div className="profile-form__field">
        <label className="profile-form__label" htmlFor="profile-username">
          Имя пользователя
        </label>
        <div className="profile-form__username-prefix">
          <span>@</span>
          <input
            id="profile-username"
            className="profile-form__input"
            value={values.username}
            maxLength={USERNAME_MAX_LENGTH}
            onChange={(e) => setField('username', e.target.value.replace(/^@+/, ''))}
            autoComplete="username"
            spellCheck={false}
          />
        </div>
      </div>
    </form>
  );
}
