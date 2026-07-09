import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useCreateChannelMutation } from '@/queries/chats.queries';
import { SettingsSubpageLayout } from '../components/settings/SettingsSubpageLayout';

const NAME_LIMIT = 64;
const DESC_LIMIT = 255;

function ToggleRow({
  icon,
  iconColor,
  title,
  subtitle,
  checked,
  onChange,
}: {
  icon: ReactNode;
  iconColor: string;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="mobile-create-channel__toggle-row">
      <span className="mobile-create-channel__toggle-icon" style={{ backgroundColor: `${iconColor}24` }}>
        {icon}
      </span>
      <span className="mobile-create-channel__toggle-body">
        <span className="mobile-create-channel__toggle-title">{title}</span>
        <span className="mobile-create-channel__toggle-subtitle">{subtitle}</span>
      </span>
      <input
        type="checkbox"
        className="mobile-create-channel__switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function GlobeIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h4a8 8 0 018 8z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20s-7-4.5-7-9.5a4.5 4.5 0 018-2.2A4.5 4.5 0 0119 10.5C19 15.5 12 20 12 20z" />
    </svg>
  );
}

export function MobileCreateChannelScreen() {
  const navigate = useNavigate();
  const createChannel = useCreateChannelMutation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('4.99');
  const [allowComments, setAllowComments] = useState(true);
  const [allowReactions, setAllowReactions] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const parsedPrice = Number(price);
  const paidPriceCents =
    isPaid && Number.isFinite(parsedPrice) && parsedPrice > 0
      ? Math.round(parsedPrice * 100)
      : null;
  const canSubmit =
    trimmedName.length >= 2 &&
    !createChannel.isPending &&
    (!isPaid || paidPriceCents != null);

  const initial = useMemo(() => {
    const ch = trimmedName.charAt(0).toUpperCase();
    return ch || '•';
  }, [trimmedName]);

  const handleCreate = () => {
    if (!canSubmit) return;
    setError(null);
    createChannel.mutate(
      {
        name: trimmedName,
        description: description.trim(),
        visibility: isPrivate ? 'private' : 'public',
        access_type: isPaid ? 'paid' : 'free',
        subscription_price_cents: paidPriceCents ?? undefined,
        subscription_period_days: isPaid ? 30 : undefined,
        allow_comments: allowComments,
        allow_reactions: allowReactions,
      },
      {
        onSuccess: (chat) => {
          navigate({ to: '/channel/$channelId', params: { channelId: chat.id } });
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Не удалось создать канал');
        },
      },
    );
  };

  return (
    <SettingsSubpageLayout title="Новый канал" backTo="/compose">
      <div className="mobile-create-channel">
        <div className="mobile-create-channel__hero">
          <div className="mobile-create-channel__avatar">
            <span>{initial}</span>
            <span className="mobile-create-channel__avatar-badge" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
          </div>
          <h2 className="mobile-create-channel__hero-title">Новый канал</h2>
          <p className="mobile-create-channel__hero-subtitle">
            Каналы — способ делиться публикациями с неограниченной аудиторией.
          </p>
        </div>

        <p className="mobile-create-channel__section-label">ОСНОВНОЕ</p>
        <div className="mobile-create-channel__card">
          <div className="mobile-create-channel__field">
            <div className="mobile-create-channel__field-header">
              <span className="mobile-create-channel__field-label">Название</span>
              <span className="mobile-create-channel__field-counter">
                {name.length}/{NAME_LIMIT}
              </span>
            </div>
            <input
              className="mobile-create-channel__field-input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_LIMIT))}
              placeholder="Например, Ежедневные новости"
              maxLength={NAME_LIMIT}
            />
          </div>
          <div className="mobile-create-channel__divider" />
          <div className="mobile-create-channel__field">
            <div className="mobile-create-channel__field-header">
              <span className="mobile-create-channel__field-label">Описание</span>
              <span className="mobile-create-channel__field-counter">
                {description.length}/{DESC_LIMIT}
              </span>
            </div>
            <textarea
              className="mobile-create-channel__field-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESC_LIMIT))}
              placeholder="О чём ваш канал"
              maxLength={DESC_LIMIT}
              rows={3}
            />
          </div>
        </div>
        <p className="mobile-create-channel__hint">
          Название будет отображаться в списке чатов и в шапке канала.
        </p>

        <p className="mobile-create-channel__section-label">ДОСТУП</p>
        <div className="mobile-create-channel__card">
          <ToggleRow
            icon={isPrivate ? <LockIcon /> : <GlobeIcon />}
            iconColor={isPrivate ? '#8A6DF1' : 'var(--m-accent)'}
            title="Приватный канал"
            subtitle={
              isPrivate
                ? 'Только по ссылке-приглашению'
                : 'Доступен всем по ссылке и в поиске'
            }
            checked={isPrivate}
            onChange={setIsPrivate}
          />
          <div className="mobile-create-channel__divider mobile-create-channel__divider--indented" />
          <ToggleRow
            icon={<CardIcon />}
            iconColor="#F59E0B"
            title="Платная подписка"
            subtitle="Ежемесячный доступ за плату"
            checked={isPaid}
            onChange={setIsPaid}
          />
          {isPaid ? (
            <>
              <div className="mobile-create-channel__divider mobile-create-channel__divider--indented" />
              <div className="mobile-create-channel__price-row">
                <span
                  className="mobile-create-channel__toggle-icon"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)' }}
                >
                  <span style={{ color: '#F59E0B', fontWeight: 700 }}>$</span>
                </span>
                <span className="mobile-create-channel__toggle-title">Цена за месяц</span>
                <label className="mobile-create-channel__price-field">
                  <input
                    className="mobile-create-channel__price-input"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    maxLength={8}
                  />
                  <span className="mobile-create-channel__price-currency">$</span>
                </label>
              </div>
            </>
          ) : null}
        </div>

        <p className="mobile-create-channel__section-label">ОБСУЖДЕНИЕ</p>
        <div className="mobile-create-channel__card">
          <ToggleRow
            icon={<MessageIcon />}
            iconColor="#10B981"
            title="Разрешить комментарии"
            subtitle="Подписчики смогут писать под постами"
            checked={allowComments}
            onChange={setAllowComments}
          />
          <div className="mobile-create-channel__divider mobile-create-channel__divider--indented" />
          <ToggleRow
            icon={<HeartIcon />}
            iconColor="#EF4444"
            title="Разрешить реакции"
            subtitle="Эмодзи на постах видны всем"
            checked={allowReactions}
            onChange={setAllowReactions}
          />
        </div>
        <p className="mobile-create-channel__hint">
          Вы сможете поменять любую настройку позже в разделе «Управление каналом».
        </p>

        {error ? (
          <p className="mobile-create-channel__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mobile-create-channel__footer">
          <button
            type="button"
            className="mobile-create-channel__submit"
            disabled={!canSubmit}
            onClick={handleCreate}
          >
            {createChannel.isPending ? (
              <span className="mobile-auth__spinner" role="status" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Создать канал
              </>
            )}
          </button>
        </div>
      </div>
    </SettingsSubpageLayout>
  );
}
