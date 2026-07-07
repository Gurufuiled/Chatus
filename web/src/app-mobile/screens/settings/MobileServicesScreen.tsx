import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { listMiniApps, openChatusFatherChat, type MiniAppSummary } from '@/services/miniAppsService';
import { resolveMediaUrl } from '@/services/mediaService';
import { SettingsSubpageLayout } from '../../components/settings/SettingsSubpageLayout';

export function MobileServicesScreen() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<MiniAppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await listMiniApps());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить сервисы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openChatusFather = async () => {
    try {
      const { chat } = await openChatusFatherChat();
      void navigate({ to: '/chat/$chatId', params: { chatId: chat.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть ChatusFather');
    }
  };

  return (
    <SettingsSubpageLayout title="Сервисы">
      {error ? <div className="mobile-settings__error">{error}</div> : null}
      <button type="button" className="mobile-settings-services__father" onClick={() => void openChatusFather()}>
        <span className="mobile-settings-services__father-icon">CF</span>
        <span className="mobile-settings-services__father-text">
          <span className="mobile-settings-services__father-title">@ChatusFather</span>
          <span className="mobile-settings-services__father-subtitle">
            Зарегистрировать мини-приложение, /newapp, /myapps
          </span>
        </span>
      </button>

      <p className="mobile-settings__section-title">Опубликованные приложения</p>
      {loading ? (
        <div className="mobile-settings__loading">Загрузка…</div>
      ) : apps.length === 0 ? (
        <div className="mobile-settings-services__empty">
          <p className="mobile-settings-services__empty-title">Пока нет мини-приложений</p>
          <p className="mobile-settings-services__empty-subtitle">
            Разработчики могут опубликовать своё приложение через @ChatusFather.
          </p>
        </div>
      ) : (
        <div className="mobile-settings-card">
          {apps.map((app, index) => {
            const iconUrl = app.icon_url ? resolveMediaUrl(app.icon_url) : null;
            return (
              <button
                key={app.id}
                type="button"
                className={`mobile-settings-services__row${index > 0 ? ' mobile-settings-services__row--bordered' : ''}`}
                onClick={() =>
                  void navigate({
                    to: '/settings/coming-soon',
                    search: { title: app.title },
                  })
                }
              >
                <span className="mobile-settings-services__icon">
                  {iconUrl ? (
                    <img src={iconUrl} alt="" />
                  ) : (
                    <span>{(app.title[0] ?? '?').toUpperCase()}</span>
                  )}
                </span>
                <span className="mobile-settings-services__row-text">
                  <span className="mobile-settings-services__row-title">{app.title}</span>
                  {app.description ? (
                    <span className="mobile-settings-services__row-subtitle">{app.description}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </SettingsSubpageLayout>
  );
}
