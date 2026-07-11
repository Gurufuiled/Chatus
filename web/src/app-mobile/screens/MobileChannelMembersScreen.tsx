import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useBanChannelMemberMutation,
  useChannelDetailQuery,
  useChannelMembersQuery,
  useRemoveChannelMemberMutation,
  useUnbanChannelMemberMutation,
  useUpdateChannelMemberRolePermissionsMutation,
  type ChannelMembersMode,
} from '@/queries/channel.queries';
import type { ChannelMemberItem } from '@/services/channelService';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { FeatherIcon } from '../icons/featherIcons';

interface MobileChannelMembersScreenProps {
  channelId: string;
  mode: ChannelMembersMode;
}

function roleLabel(role: string, isBanned: boolean): string {
  if (role === 'owner') return 'Владелец';
  if (role === 'admin') return 'Администратор';
  if (isBanned) return 'Подписчик • заблокирован';
  return 'Подписчик';
}

function memberDisplayName(item: ChannelMemberItem): string {
  return (
    item.user?.display_name?.trim() ||
    item.user?.username?.trim() ||
    item.user?.handle?.trim() ||
    item.user_id
  );
}

type ActionSheetState =
  | { kind: 'subscriber'; item: ChannelMemberItem }
  | { kind: 'unban'; item: ChannelMemberItem }
  | null;

export function MobileChannelMembersScreen({ channelId, mode }: MobileChannelMembersScreenProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [actionSheet, setActionSheet] = useState<ActionSheetState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: detail } = useChannelDetailQuery(channelId);
  const { data, isLoading, isError, refetch } = useChannelMembersQuery(channelId, mode, query);
  const banMember = useBanChannelMemberMutation();
  const unbanMember = useUnbanChannelMemberMutation();
  const removeMember = useRemoveChannelMemberMutation();
  const updateRole = useUpdateChannelMemberRolePermissionsMutation();

  const title =
    mode === 'admins' ? 'Администраторы' : mode === 'banned' ? 'Чёрный список' : 'Подписчики';
  const placeholder =
    mode === 'admins'
      ? 'Поиск администраторов'
      : mode === 'banned'
        ? 'Поиск в чёрном списке'
        : 'Поиск подписчиков';

  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (mode === 'admins') {
      return list.filter((item) => item.role === 'owner' || item.role === 'admin');
    }
    return list;
  }, [data?.items, mode]);

  const permissions = detail?.channel_permissions;
  const canAddAdmins = permissions?.can_add_admins === true;
  const canDemoteAdmins =
    permissions?.can_remove_admins === true || permissions?.can_manage_admins === true;
  const canModerate = permissions?.can_moderate_subscribers === true;
  const busy =
    banMember.isPending ||
    unbanMember.isPending ||
    removeMember.isPending ||
    updateRole.isPending;

  useEffect(() => {
    if (!actionError) return;
    const timer = window.setTimeout(() => setActionError(null), 2200);
    return () => window.clearTimeout(timer);
  }, [actionError]);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({
      to: mode === 'banned' ? '/channel/$channelId/settings' : '/channel/$channelId/profile',
      params: { channelId },
    });
  };

  const runAction = (
    mutation: { mutate: (vars: { channelId: string; memberId: string }, opts?: object) => void },
    memberId: string,
    onDone?: () => void,
  ) => {
    setActionError(null);
    mutation.mutate(
      { channelId, memberId },
      {
        onSuccess: () => {
          setActionSheet(null);
          onDone?.();
        },
        onError: (err: unknown) => {
          setActionError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
        },
      },
    );
  };

  const handleRowPress = (item: ChannelMemberItem) => {
    if (mode === 'admins') {
      if (!canDemoteAdmins || item.role === 'owner') return;
      setActionSheet({ kind: 'subscriber', item });
      return;
    }
    if (mode === 'banned') {
      if (!canModerate) return;
      setActionSheet({ kind: 'unban', item });
      return;
    }
    if (item.role !== 'member') return;
    if (!canModerate && !(canAddAdmins && !item.is_banned)) return;
    setActionSheet({ kind: 'subscriber', item });
  };

  const activeItem = actionSheet?.item ?? null;
  const activeName = activeItem ? memberDisplayName(activeItem) : '';

  return (
    <div className="mobile-channel-members">
      <header className="mobile-chat-profile__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={handleBack}
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">{title}</span>
        {mode === 'admins' && canAddAdmins ? (
          <button
            type="button"
            className="mobile-channel-members__add-btn"
            aria-label="Добавить администратора"
            onClick={() =>
              navigate({
                to: '/channel/$channelId/subscribers',
                params: { channelId },
              })
            }
          >
            <FeatherIcon name="plus" size={18} />
          </button>
        ) : null}
      </header>

      <div className="mobile-channel-members__search">
        <svg
          className="mobile-channel-members__search-icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="mobile-channel-members__search-input"
          placeholder={placeholder}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setQuery(searchDraft.trim());
          }}
        />
        <button
          type="button"
          className="mobile-channel-members__search-btn"
          onClick={() => setQuery(searchDraft.trim())}
        >
          Найти
        </button>
      </div>

      {isLoading ? (
        <div className="mobile-channel-members__loading">Загрузка…</div>
      ) : isError ? (
        <div className="mobile-channel-members__empty">
          <p>Не удалось загрузить список</p>
          <button type="button" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="mobile-channel-members__empty">Никого не найдено</p>
      ) : (
        <ul className="mobile-channel-members__list">
          {items.map((item) => {
            const displayName = memberDisplayName(item);
            const avatar = resolveAvatarSrc(item.user?.avatar_url);
            const initial = (displayName.trim()[0] || '?').toUpperCase();
            const interactive =
              (mode === 'admins' && canDemoteAdmins && item.role !== 'owner') ||
              (mode === 'banned' && canModerate) ||
              (mode === 'subscribers' &&
                item.role === 'member' &&
                (canModerate || (canAddAdmins && !item.is_banned)));

            return (
              <li key={item.user_id}>
                <button
                  type="button"
                  className={`mobile-channel-members__row${interactive ? '' : ' mobile-channel-members__row--static'}`}
                  disabled={!interactive || busy}
                  onClick={() => handleRowPress(item)}
                >
                  {avatar ? (
                    <img className="mobile-channel-members__avatar" src={avatar} alt="" />
                  ) : (
                    <div
                      className="mobile-channel-members__avatar-fallback"
                      style={{ backgroundColor: getAvatarColor(displayName) }}
                    >
                      {initial}
                    </div>
                  )}
                  <div className="mobile-channel-members__info">
                    <span className="mobile-channel-members__name">{displayName}</span>
                    <span className="mobile-channel-members__role">
                      {roleLabel(item.role, item.is_banned)}
                    </span>
                  </div>
                  {interactive ? (
                    <FeatherIcon name="chevron-right" size={18} className="mobile-channel-members__chevron" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {actionSheet?.kind === 'unban' && activeItem ? (
        <div className="mobile-channel-members__sheet" role="dialog" aria-modal="true">
          <button
            type="button"
            className="mobile-channel-members__sheet-backdrop"
            aria-label="Закрыть"
            onClick={() => !busy && setActionSheet(null)}
          />
          <div className="mobile-channel-members__sheet-card">
            <p className="mobile-channel-members__sheet-title">Разблокировать?</p>
            <p className="mobile-channel-members__sheet-body">
              Разблокировать {activeName}?
            </p>
            <button
              type="button"
              className="mobile-channel-members__sheet-action"
              disabled={busy}
              onClick={() => runAction(unbanMember, activeItem.user_id)}
            >
              Разблокировать
            </button>
            <button
              type="button"
              className="mobile-channel-members__sheet-cancel"
              disabled={busy}
              onClick={() => setActionSheet(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {actionSheet?.kind === 'subscriber' && activeItem ? (
        <div className="mobile-channel-members__sheet" role="dialog" aria-modal="true">
          <button
            type="button"
            className="mobile-channel-members__sheet-backdrop"
            aria-label="Закрыть"
            onClick={() => !busy && setActionSheet(null)}
          />
          <div className="mobile-channel-members__sheet-card">
            <p className="mobile-channel-members__sheet-title">
              {mode === 'admins' ? 'Администратор' : 'Модерация'}
            </p>
            <p className="mobile-channel-members__sheet-body">{activeName}</p>

            {mode === 'subscribers' && !activeItem.is_banned && canAddAdmins ? (
              <button
                type="button"
                className="mobile-channel-members__sheet-action"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  updateRole.mutate(
                    {
                      channelId,
                      memberId: activeItem.user_id,
                      payload: { role: 'admin', can_post: true },
                    },
                    {
                      onSuccess: () => setActionSheet(null),
                      onError: (err) =>
                        setActionError(
                          err instanceof Error ? err.message : 'Не удалось назначить',
                        ),
                    },
                  );
                }}
              >
                Назначить администратором
              </button>
            ) : null}

            {mode === 'admins' && activeItem.role === 'admin' && canDemoteAdmins ? (
              <button
                type="button"
                className="mobile-channel-members__sheet-action mobile-channel-members__sheet-action--danger"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  updateRole.mutate(
                    {
                      channelId,
                      memberId: activeItem.user_id,
                      payload: { role: 'member' },
                    },
                    {
                      onSuccess: () => setActionSheet(null),
                      onError: (err) =>
                        setActionError(
                          err instanceof Error ? err.message : 'Не удалось снять права',
                        ),
                    },
                  );
                }}
              >
                Снять права администратора
              </button>
            ) : null}

            {mode === 'subscribers' && canModerate ? (
              <>
                <button
                  type="button"
                  className="mobile-channel-members__sheet-action mobile-channel-members__sheet-action--danger"
                  disabled={busy}
                  onClick={() => {
                    if (activeItem.is_banned) {
                      runAction(unbanMember, activeItem.user_id);
                      return;
                    }
                    if (
                      !window.confirm(
                        `Заблокировать ${activeName}? Пользователь не сможет писать и читать канал.`,
                      )
                    ) {
                      return;
                    }
                    runAction(banMember, activeItem.user_id);
                  }}
                >
                  {activeItem.is_banned ? 'Разбанить' : 'Заблокировать'}
                </button>
                <button
                  type="button"
                  className="mobile-channel-members__sheet-action mobile-channel-members__sheet-action--danger"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Удалить ${activeName} из канала?`)) return;
                    runAction(removeMember, activeItem.user_id);
                  }}
                >
                  Удалить из канала
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="mobile-channel-members__sheet-cancel"
              disabled={busy}
              onClick={() => setActionSheet(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="mobile-channel-members__snackbar" role="alert">
          {actionError}
        </div>
      ) : null}
    </div>
  );
}
