import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { fetchFeedbackList, type FeedbackEntry } from '@/services/feedbackService';
import { resolveMediaUrl } from '@/services/mediaService';
import { SettingsSubpageLayout } from '../../components/settings/SettingsSubpageLayout';

interface MobileFeedbackListScreenProps {
  kind: 'bug' | 'suggestion';
}

function formatListDate(ms: number): string {
  return new Date(ms).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MobileFeedbackListScreen({ kind }: MobileFeedbackListScreenProps) {
  const navigate = useNavigate();
  const title = kind === 'bug' ? 'Баги' : 'Предложения';
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchFeedbackList(kind));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SettingsSubpageLayout
      title={title}
      headerRight={
        <button
          type="button"
          className="mobile-settings__header-action"
          onClick={() =>
            navigate({ to: '/settings/feedback/compose', search: { kind } })
          }
        >
          Новая
        </button>
      }
    >
      {error ? <div className="mobile-settings__error">{error}</div> : null}
      {loading ? (
        <div className="mobile-settings__loading">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="mobile-settings-services__empty">
          <p className="mobile-settings-services__empty-title">Пока пусто</p>
          <p className="mobile-settings-services__empty-subtitle">
            Создайте новую заявку, чтобы сообщить команде.
          </p>
        </div>
      ) : (
        <div className="mobile-settings-card mobile-settings-feedback">
          {items.map((item, index) => {
            const author = item.author?.display_name?.trim() || item.author?.handle || 'Пользователь';
            const avatarUrl = item.author?.avatar_url
              ? resolveMediaUrl(item.author.avatar_url)
              : null;
            return (
              <article
                key={item.id}
                className={`mobile-settings-feedback__item${index > 0 ? ' mobile-settings-feedback__item--bordered' : ''}`}
              >
                <div className="mobile-settings-feedback__meta">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="mobile-settings-feedback__avatar" />
                  ) : (
                    <span className="mobile-settings-feedback__avatar-fallback">
                      {author.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="mobile-settings-feedback__meta-text">
                    <span className="mobile-settings-feedback__author">{author}</span>
                    <span className="mobile-settings-feedback__date">{formatListDate(item.created_at)}</span>
                  </div>
                  <span
                    className={`mobile-settings-feedback__status mobile-settings-feedback__status--${item.status}`}
                  >
                    {item.status === 'open' ? 'Открыто' : 'Закрыто'}
                  </span>
                </div>
                <h3 className="mobile-settings-feedback__title">{item.title}</h3>
                <p className="mobile-settings-feedback__body">{item.body}</p>
                {item.attachment_url ? (
                  <img
                    src={resolveMediaUrl(item.attachment_url)}
                    alt=""
                    className="mobile-settings-feedback__attachment"
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </SettingsSubpageLayout>
  );
}
