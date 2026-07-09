import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChannelDetailQuery,
  useUpdateChannelMutation,
} from '@/queries/channel.queries';
import { ApiError } from '@/services/apiClient';
import { ChannelRowIcon, FeatherIcon, type FeatherIconName } from '../icons/featherIcons';

interface MobileChannelDiscussionSettingsScreenProps {
  channelId: string;
}

type ToggleRowProps = {
  icon: FeatherIconName;
  iconBg: string;
  label: string;
  sublabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
};

function ToggleRow({
  icon,
  iconBg,
  label,
  sublabel,
  checked,
  disabled,
  onChange,
}: ToggleRowProps) {
  return (
    <div
      className={`mobile-channel-discussion-settings__row${
        disabled ? ' mobile-channel-discussion-settings__row--disabled' : ''
      }`}
    >
      <ChannelRowIcon name={icon} bgColor={iconBg} />
      <div className="mobile-channel-discussion-settings__row-body">
        <span className="mobile-channel-discussion-settings__row-title">{label}</span>
        {sublabel ? (
          <span className="mobile-channel-discussion-settings__row-sub">{sublabel}</span>
        ) : null}
      </div>
      <label className="mobile-channel-settings__switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="mobile-channel-settings__switch-slider" />
      </label>
    </div>
  );
}

export function MobileChannelDiscussionSettingsScreen({
  channelId,
}: MobileChannelDiscussionSettingsScreenProps) {
  const navigate = useNavigate();
  const { data: detail, isLoading, isError, error } = useChannelDetailQuery(channelId);
  const updateChannel = useUpdateChannelMutation();
  const channel = detail?.channel;
  const canEdit = detail?.channel_permissions?.can_edit_channel === true;

  const [disableNew, setDisableNew] = useState(false);
  const [disableAll, setDisableAll] = useState(false);
  const [disableVoice, setDisableVoice] = useState(false);
  const [disableMedia, setDisableMedia] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  useEffect(() => {
    if (!channel) return;
    setDisableNew(Boolean(channel.disable_comments_new));
    setDisableAll(Boolean(channel.disable_comments_all));
    setDisableVoice(Boolean(channel.disable_voice_comments));
    setDisableMedia(Boolean(channel.disable_media_comments));
    setCooldown(channel.comment_cooldown_sec ?? 0);
  }, [
    channel?.disable_comments_new,
    channel?.disable_comments_all,
    channel?.disable_voice_comments,
    channel?.disable_media_comments,
    channel?.comment_cooldown_sec,
    channel,
  ]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 1800);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  const goBack = useCallback(() => {
    navigate({ to: '/channel/$channelId/settings', params: { channelId } });
  }, [channelId, navigate]);

  const saveField = useCallback(
    async (payload: Parameters<typeof updateChannel.mutateAsync>[0]['payload']) => {
      if (!canEdit) {
        setSnackbar('Недостаточно прав');
        return false;
      }
      try {
        await updateChannel.mutateAsync({ channelId, payload });
        return true;
      } catch {
        setSnackbar('Не удалось сохранить');
        return false;
      }
    },
    [canEdit, channelId, updateChannel],
  );

  const handleDisableNew = async (next: boolean) => {
    setDisableNew(next);
    const ok = await saveField({ disable_comments_new: next });
    if (!ok) setDisableNew(!next);
  };

  const handleDisableAll = async (next: boolean) => {
    const prevNew = disableNew;
    setDisableAll(next);
    if (next) setDisableNew(true);
    const ok = await saveField({
      disable_comments_all: next,
      ...(next ? { disable_comments_new: true } : {}),
    });
    if (!ok) {
      setDisableAll(!next);
      if (next) setDisableNew(prevNew);
    }
  };

  const handleDisableVoice = async (next: boolean) => {
    setDisableVoice(next);
    const ok = await saveField({ disable_voice_comments: next });
    if (!ok) setDisableVoice(!next);
  };

  const handleDisableMedia = async (next: boolean) => {
    setDisableMedia(next);
    const ok = await saveField({ disable_media_comments: next });
    if (!ok) setDisableMedia(!next);
  };

  const handleCooldownChange = async (delta: number) => {
    const next = Math.max(0, Math.min(15, cooldown + delta));
    if (next === cooldown) return;
    const prev = cooldown;
    setCooldown(next);
    const ok = await saveField({ comment_cooldown_sec: next });
    if (!ok) setCooldown(prev);
  };

  if (isLoading) {
    return <div className="mobile-chat-profile__loading">Загрузка…</div>;
  }

  if (isError || !channel) {
    const message =
      error instanceof ApiError && error.status === 403
        ? 'Нет доступа к каналу'
        : error instanceof Error
          ? error.message
          : 'Канал не найден';
    return (
      <div className="mobile-channel-discussion-settings">
        <header className="mobile-chat-profile__toolbar">
          <button type="button" className="mobile-chat__back" onClick={goBack} aria-label="Назад">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Обсуждение</span>
        </header>
        <p className="mobile-chat-profile__empty">{message}</p>
      </div>
    );
  }

  return (
    <div className="mobile-channel-discussion-settings">
      <header className="mobile-chat-profile__toolbar">
        <button type="button" className="mobile-chat__back" onClick={goBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">Обсуждение</span>
      </header>

      <div className="mobile-channel-discussion-settings__scroll">
        <p className="mobile-channel-type__section-label">КОММЕНТАРИИ</p>
        <section className="mobile-channel-settings__card">
          <ToggleRow
            icon="message-square"
            iconBg="#3390EC"
            label="Откл. к новым постам"
            sublabel="Новые посты публикуются без комментариев"
            checked={disableNew}
            disabled={!canEdit || disableAll || updateChannel.isPending}
            onChange={(v) => void handleDisableNew(v)}
          />
          <div className="mobile-channel-settings__divider" />
          <ToggleRow
            icon="slash"
            iconBg="#EF4444"
            label="Откл. для всех постов"
            sublabel="Комментарии полностью отключены"
            checked={disableAll}
            disabled={!canEdit || updateChannel.isPending}
            onChange={(v) => void handleDisableAll(v)}
          />
        </section>

        {disableAll ? (
          <div className="mobile-channel-discussion-settings__notice" role="status">
            <FeatherIcon name="info" size={15} />
            <span>
              Комментарии отключены для всех постов. Это перекрывает настройку «только для новых».
            </span>
          </div>
        ) : null}

        <p className="mobile-channel-type__section-label mobile-channel-type__section-label--spaced">
          ОГРАНИЧЕНИЯ КОНТЕНТА
        </p>
        <section className="mobile-channel-settings__card">
          <ToggleRow
            icon="mic-off"
            iconBg="#8A6DF1"
            label="Запретить голосовые"
            sublabel="Пользователи не смогут отправлять голосовые сообщения"
            checked={disableVoice}
            disabled={!canEdit || updateChannel.isPending}
            onChange={(v) => void handleDisableVoice(v)}
          />
          <div className="mobile-channel-settings__divider" />
          <ToggleRow
            icon="image"
            iconBg="#F59E0B"
            label="Запретить медиа"
            sublabel="Фото и видео в комментариях запрещены"
            checked={disableMedia}
            disabled={!canEdit || updateChannel.isPending}
            onChange={(v) => void handleDisableMedia(v)}
          />
        </section>

        <p className="mobile-channel-type__section-label mobile-channel-type__section-label--spaced">
          АНТИФЛУД
        </p>
        <section className="mobile-channel-settings__card mobile-channel-discussion-settings__stepper-card">
          <div className="mobile-channel-discussion-settings__stepper-head">
            <ChannelRowIcon name="clock" bgColor="#10B981" />
            <div className="mobile-channel-discussion-settings__row-body">
              <span className="mobile-channel-discussion-settings__row-title">
                Таймер между сообщениями
              </span>
              <span className="mobile-channel-discussion-settings__row-sub">
                Мин. интервал в обсуждении
              </span>
            </div>
          </div>
          <div className="mobile-channel-discussion-settings__stepper">
            <button
              type="button"
              className="mobile-channel-discussion-settings__stepper-btn"
              disabled={!canEdit || cooldown <= 0 || updateChannel.isPending}
              onClick={() => void handleCooldownChange(-1)}
              aria-label="Уменьшить"
            >
              <FeatherIcon name="minus" size={18} />
            </button>
            <span
              className={`mobile-channel-discussion-settings__stepper-value${
                cooldown === 0 ? ' mobile-channel-discussion-settings__stepper-value--off' : ''
              }`}
            >
              {cooldown === 0 ? 'Выкл' : `${cooldown} сек`}
            </span>
            <button
              type="button"
              className="mobile-channel-discussion-settings__stepper-btn"
              disabled={!canEdit || cooldown >= 15 || updateChannel.isPending}
              onClick={() => void handleCooldownChange(1)}
              aria-label="Увеличить"
            >
              <FeatherIcon name="plus" size={18} />
            </button>
          </div>
          <div className="mobile-channel-discussion-settings__track" aria-hidden>
            <div className="mobile-channel-discussion-settings__track-bg" />
            <div
              className="mobile-channel-discussion-settings__track-fill"
              style={{ width: `${(cooldown / 15) * 100}%` }}
            />
          </div>
        </section>

        <p className="mobile-channel-type__hint">
          Минимальный интервал от 1 до 15 секунд между сообщениями одного пользователя (антифлуд).
          Установите 0 для отключения.
        </p>
      </div>

      {snackbar ? (
        <div className="mobile-channel-settings__snackbar" role="status">
          {snackbar}
        </div>
      ) : null}
    </div>
  );
}
