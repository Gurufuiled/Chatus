import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { logoutPublicAuth } from '@/auth/publicAuth';
import { queryClient } from '@/app/queryClient-app';
import { useMeQuery } from '@/queries/profile.queries';
import { resolveMediaUrl } from '@/services/mediaService';
import { uploadFile } from '@/services/mediaService';
import { updateProfile } from '@/services/profileService';
import { SettingsIconRow } from '../../components/settings/SettingsIconRow';
import { SETTINGS_ROW_GLYPHS } from '../../icons/settingsGlyphs';

export function MobileSettingsHomeScreen() {
  const navigate = useNavigate();
  const { data: me, refetch } = useMeQuery();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const profileTitle =
    [me?.display_name?.trim(), me?.last_name?.trim()].filter(Boolean).join(' ') ||
    me?.display_name?.trim() ||
    'Ваш профиль';
  const handleVal = me?.handle?.trim().replace(/^@/, '') ?? '';
  const phoneLine = me?.phone?.trim() || '';
  const handleLine = handleVal ? `@${handleVal}` : '';
  const avatarUrl = me?.avatar_url ? resolveMediaUrl(me.avatar_url) : null;
  const initials = profileTitle.slice(0, 1).toUpperCase();

  const handleLogout = () => {
    queryClient.clear();
    logoutPublicAuth();
  };

  const showComingSoon = useCallback((title: string) => {
    void navigate({ to: '/settings/coming-soon', search: { title } });
  }, [navigate]);

  const handleAvatarPick = async (file: File) => {
    setUploadingAvatar(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      await updateProfile({ avatar_url: uploaded.url });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const sg = SETTINGS_ROW_GLYPHS;

  return (
    <div className="mobile-settings">
      <header className="mobile-settings__header">
        <h1 className="mobile-settings__header-title">Настройки</h1>
        <button
          type="button"
          className="mobile-settings__edit-btn"
          onClick={() => navigate({ to: '/settings/profile/edit' })}
        >
          Изм.
        </button>
      </header>

      <div className="mobile-settings__scroll mobile-settings__scroll--home">
        {error ? <div className="mobile-settings__error">{error}</div> : null}

        <p className="mobile-settings__section-title">Аккаунт</p>
        <button
          type="button"
          className="mobile-settings__hero-card"
          onClick={() => navigate({ to: '/settings/profile' })}
        >
          <span className="mobile-settings__hero-avatar-wrap">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="mobile-settings__hero-avatar" />
            ) : (
              <span className="mobile-settings__hero-avatar-fallback">{initials}</span>
            )}
            {uploadingAvatar ? <span className="mobile-settings__hero-avatar-overlay" /> : null}
          </span>
          <span className="mobile-settings__hero-title">{profileTitle}</span>
          <span className="mobile-settings__hero-meta">
            {phoneLine && handleLine ? `${phoneLine} · ${handleLine}` : phoneLine || handleLine || ' '}
          </span>
        </button>

        <button
          type="button"
          className="mobile-settings__photo-btn"
          disabled={uploadingAvatar}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12 16a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M3 8a2 2 0 012-2h1l1-2h8l1 2h1a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          Изменить фотографию
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleAvatarPick(file);
          }}
        />

        <p className="mobile-settings__section-title">Настройки</p>
        <div className="mobile-settings-card">
          <SettingsIconRow
            title="Telegram"
            subtitle="Подключение диалогов Telegram"
            icon={
              <span className="mobile-settings-row__icon-bubble" style={{ backgroundColor: '#3390ec' }}>
                <svg viewBox="0 0 24 24" fill="#fff" aria-hidden>
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.48-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.16l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
              </span>
            }
            placeholder
            onPress={() => showComingSoon('Telegram')}
          />
          <SettingsIconRow
            title="Оформление"
            subtitle="Тема приложения"
            icon={
              <span className="mobile-settings-row__icon-bubble" style={{ backgroundColor: '#2fc1d6' }}>
                <svg viewBox="0 0 24 24" fill="#fff" aria-hidden>
                  <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z" />
                </svg>
              </span>
            }
            onPress={() => navigate({ to: '/settings/appearance' })}
          />
          <SettingsIconRow
            title="Настройки чатов"
            glyph={sg.chat}
            iconBgColor="#F2994A"
            onPress={() => navigate({ to: '/settings/chat' })}
          />
          <SettingsIconRow
            title="Уведомления и звуки"
            glyph={sg.sounds}
            iconBgColor="#FF4A4A"
            placeholder
            onPress={() => showComingSoon('Уведомления и звуки')}
          />
          <SettingsIconRow
            title="Конфиденциальность"
            glyph={sg.privacy}
            iconBgColor="#34C759"
            placeholder
            onPress={() => showComingSoon('Конфиденциальность')}
          />
          <SettingsIconRow
            title="Данные и память"
            glyph={sg.data}
            iconBgColor="#42A5F5"
            placeholder
            onPress={() => showComingSoon('Данные и память')}
          />
          <SettingsIconRow
            title="Язык"
            glyph={sg.language}
            iconBgColor="#AF52DE"
            placeholder
            onPress={() => showComingSoon('Язык')}
          />
          <SettingsIconRow
            title="Устройства"
            glyph={sg.devices}
            iconBgColor="#00C2CB"
            placeholder
            onPress={() => showComingSoon('Устройства')}
          />
          <SettingsIconRow
            title="Пароль и безопасность"
            glyph={sg.security}
            iconBgColor="#1E88E5"
            placeholder
            onPress={() => showComingSoon('Пароль и безопасность')}
          />
        </div>

        <p className="mobile-settings__section-title">Сервисы</p>
        <div className="mobile-settings-card">
          <SettingsIconRow
            title="Сервисы"
            subtitle="Мини-приложения и ChatusFather"
            icon={
              <span className="mobile-settings-row__icon-bubble" style={{ backgroundColor: '#3390ec' }}>
                <svg viewBox="0 0 24 24" fill="#fff" aria-hidden>
                  <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" />
                </svg>
              </span>
            }
            onPress={() => navigate({ to: '/settings/services' })}
          />
        </div>

        <p className="mobile-settings__section-title">Обратная связь</p>
        <div className="mobile-settings-card">
          <SettingsIconRow
            title="Сообщить о баге"
            subtitle="Список ваших сообщений и новая заявка"
            icon={
              <span className="mobile-settings-row__icon-bubble" style={{ backgroundColor: '#E53935' }}>
                <svg viewBox="0 0 24 24" fill="#fff" aria-hidden>
                  <path d="M7 9h10v2H7V9zm0 4h7v2H7v-2zm9-9H8a2 2 0 00-2 2v10l-2 2V6a4 4 0 014-4h10a4 4 0 014 4v6h-2V6a2 2 0 00-2-2z" />
                </svg>
              </span>
            }
            onPress={() => navigate({ to: '/settings/feedback/bug' })}
          />
          <SettingsIconRow
            title="Предложения"
            subtitle="Идеи по улучшению приложения"
            icon={
              <span className="mobile-settings-row__icon-bubble" style={{ backgroundColor: '#FFB300' }}>
                <svg viewBox="0 0 24 24" fill="#fff" aria-hidden>
                  <path d="M9 21h6v-1H9v1zm3-19a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2z" />
                </svg>
              </span>
            }
            onPress={() => navigate({ to: '/settings/feedback/suggestion' })}
          />
        </div>

        <div className="mobile-settings-card mobile-settings-card--logout">
          <SettingsIconRow
            title="Выйти из аккаунта"
            glyph={sg.power}
            iconBgColor="#E53935"
            destructive
            showChevron={false}
            onPress={handleLogout}
          />
        </div>
      </div>
    </div>
  );
}
