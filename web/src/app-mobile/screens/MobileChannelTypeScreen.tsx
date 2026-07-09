import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useChannelDetailQuery,
  useUpdateChannelMutation,
} from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { FeatherIcon } from '../icons/featherIcons';
import {
  buildChannelInviteDeepLink,
  buildChannelSlugDeepLink,
} from '../utils/channelLinks';

const SLUG_REGEX = /^[a-z0-9_]*$/;
const SLUG_PREFIX = 'chatus://c/';

interface MobileChannelTypeScreenProps {
  channelId: string;
}

function mapChannelUpdateError(err: unknown): string {
  if (err instanceof Error) {
    if (/slug is already taken/i.test(err.message)) {
      return 'Эта ссылка уже занята';
    }
    return err.message;
  }
  return 'Попробуйте ещё раз';
}

export function MobileChannelTypeScreen({ channelId }: MobileChannelTypeScreenProps) {
  const navigate = useNavigate();
  const { data: me } = useMeQuery();
  const { data: detail, isLoading } = useChannelDetailQuery(channelId);
  const updateChannel = useUpdateChannelMutation();
  const channel = detail?.channel;
  const permissions = detail?.channel_permissions;
  const canEdit = permissions?.can_edit_channel === true;
  const canAdminOps =
    permissions?.can_add_admins === true ||
    permissions?.can_remove_admins === true ||
    permissions?.can_edit_admin_permissions === true ||
    permissions?.can_manage_admins === true;
  const canModerate = permissions?.can_moderate_subscribers === true;

  const isOwner = useMemo(() => {
    if (!channel || !me?.id) return false;
    const membership = channel.members?.find((m) => m.user_id === me.id);
    return membership?.role === 'owner';
  }, [channel, me?.id]);

  const hasAnyAdminAccess = isOwner || canEdit || canAdminOps || canModerate;

  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [slug, setSlug] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const goBack = useCallback(() => {
    navigate({ to: '/channel/$channelId/settings', params: { channelId } });
  }, [channelId, navigate]);

  useEffect(() => {
    if (channel) {
      setVisibility(channel.visibility === 'private' ? 'private' : 'public');
      setSlug(channel.slug ?? '');
    }
  }, [channel?.visibility, channel?.slug]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 2000);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  const handleSlugChange = useCallback((text: string) => {
    const lower = text.toLowerCase();
    if (!SLUG_REGEX.test(lower)) return;
    setSlug(lower);
    if (lower.length > 0 && lower.length < 5) {
      setSlugError('Минимальная длина — 5 символов');
    } else {
      setSlugError(null);
    }
  }, []);

  const inviteLink = channel?.invite_token
    ? buildChannelInviteDeepLink(channel.invite_token)
    : '';

  const handleSave = async () => {
    if (visibility === 'public' && slug.length > 0 && slug.length < 5) {
      setSlugError('Минимальная длина — 5 символов');
      return;
    }

    const payload: {
      visibility: 'public' | 'private';
      slug?: string;
      clear_slug?: boolean;
    } = { visibility };

    if (visibility === 'public') {
      if (slug.trim().length >= 5) {
        payload.slug = slug.trim();
      } else {
        payload.clear_slug = true;
      }
    }

    try {
      await updateChannel.mutateAsync({ channelId, payload });
      goBack();
    } catch (err) {
      setSnackbar(mapChannelUpdateError(err));
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setSnackbar('Скопировано');
    } catch {
      setSnackbar('Не удалось скопировать');
    }
  };

  const handleShareInvite = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: inviteLink });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    void handleCopyInvite();
  };

  const isPublic = visibility === 'public';

  const header = (
    <header className="mobile-channel-type__header">
      <button type="button" className="mobile-channel-type__header-btn" onClick={goBack}>
        Отмена
      </button>
      <h1 className="mobile-channel-type__header-title">Тип канала</h1>
      {channel && hasAnyAdminAccess ? (
        <button
          type="button"
          className="mobile-channel-type__header-btn mobile-channel-type__header-btn--done"
          disabled={!canEdit || updateChannel.isPending}
          onClick={() => void handleSave()}
        >
          {updateChannel.isPending ? '…' : 'Готово'}
        </button>
      ) : (
        <span className="mobile-channel-type__header-spacer" aria-hidden />
      )}
    </header>
  );

  if (isLoading && !channel) {
    return (
      <div className="mobile-channel-type">
        {header}
        <p className="mobile-channel-type__loading">Загрузка…</p>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="mobile-channel-type">
        {header}
        <p className="mobile-channel-type__loading">Канал недоступен</p>
      </div>
    );
  }

  if (!hasAnyAdminAccess) {
    return (
      <div className="mobile-channel-type">
        {header}
        <p className="mobile-channel-type__loading">Нет доступа к настройкам канала</p>
      </div>
    );
  }

  return (
    <div className="mobile-channel-type">
      {header}

      <div className="mobile-channel-type__scroll">
        <p className="mobile-channel-type__section-label">ССЫЛКА</p>
        <section className="mobile-channel-type__card">
          <button
            type="button"
            className="mobile-channel-type__radio-row"
            disabled={!canEdit}
            onClick={() => canEdit && setVisibility('public')}
          >
            {isPublic ? (
              <FeatherIcon name="check" size={20} className="mobile-channel-type__check" />
            ) : (
              <span className="mobile-channel-type__radio-empty" />
            )}
            <span>Публичная</span>
          </button>
          <div className="mobile-channel-type__divider" />
          <button
            type="button"
            className="mobile-channel-type__radio-row"
            disabled={!canEdit}
            onClick={() => canEdit && setVisibility('private')}
          >
            {!isPublic ? (
              <FeatherIcon name="check" size={20} className="mobile-channel-type__check" />
            ) : (
              <span className="mobile-channel-type__radio-empty" />
            )}
            <span>Частная</span>
          </button>
        </section>

        <p className="mobile-channel-type__hint">
          {isPublic
            ? 'Публичные каналы можно найти через поиск, подписаться на них может любой пользователь.'
            : 'На частные каналы можно подписаться только по ссылке-приглашению.'}
        </p>

        {isPublic ? (
          <>
            <div className="mobile-channel-type__slug-card">
              <span className="mobile-channel-type__slug-prefix">{SLUG_PREFIX}</span>
              <input
                className="mobile-channel-type__slug-input"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="your_channel"
                autoCapitalize="off"
                autoCorrect="off"
                disabled={!canEdit}
              />
              {slug.length > 0 ? (
                <button
                  type="button"
                  className="mobile-channel-type__slug-clear"
                  disabled={!canEdit}
                  onClick={() => {
                    setSlug('');
                    setSlugError(null);
                  }}
                  aria-label="Очистить"
                >
                  <FeatherIcon name="x" size={14} />
                </button>
              ) : null}
            </div>
            {slugError ? (
              <p className="mobile-channel-type__slug-error">{slugError}</p>
            ) : (
              <p className="mobile-channel-type__hint">
                Если у канала будет постоянная публичная ссылка, другие пользователи смогут найти
                его и подписаться.
              </p>
            )}
            <p className="mobile-channel-type__hint-small">
              Можно использовать латиницу (a-z), цифры (0-9) и подчёркивание. Минимальная длина — 5
              символов. Публичная ссылка:{' '}
              {slug.trim().length >= 5 ? buildChannelSlugDeepLink(slug.trim()) : '—'}
            </p>
          </>
        ) : (
          <>
            <p className="mobile-channel-type__section-label mobile-channel-type__section-label--spaced">
              ССЫЛКА-ПРИГЛАШЕНИЕ
            </p>
            <section className="mobile-channel-type__card mobile-channel-type__invite-card">
              <p className="mobile-channel-type__invite-pill">{inviteLink || 'Ссылка недоступна'}</p>
              <button
                type="button"
                className="mobile-channel-type__share-btn"
                disabled={!inviteLink}
                onClick={() => void handleShareInvite()}
              >
                Поделиться
              </button>
              <div className="mobile-channel-type__invite-actions">
                <button
                  type="button"
                  className="mobile-channel-type__secondary-btn"
                  disabled={!inviteLink}
                  onClick={() => void handleCopyInvite()}
                >
                  Копировать
                </button>
              </div>
            </section>
            <p className="mobile-channel-type__hint">
              По этой ссылке можно подписаться на канал. Отправьте её через «Поделиться» или
              скопируйте вручную.
            </p>
          </>
        )}
      </div>

      {snackbar ? (
        <div className="mobile-channel-settings__snackbar" role="status">
          {snackbar}
        </div>
      ) : null}
    </div>
  );
}
