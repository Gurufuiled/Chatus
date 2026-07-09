import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChannelDetailQuery, useChannelMembersQuery } from '@/queries/channel.queries';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';

interface MobileChannelMembersScreenProps {
  channelId: string;
  mode: 'admins' | 'subscribers';
}

function roleLabel(role: string, isBanned: boolean): string {
  if (role === 'owner') return 'Владелец';
  if (role === 'admin') return 'Администратор';
  if (isBanned) return 'Подписчик • заблокирован';
  return 'Подписчик';
}

export function MobileChannelMembersScreen({ channelId, mode }: MobileChannelMembersScreenProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const { data: detail } = useChannelDetailQuery(channelId);
  const { data, isLoading, isError, refetch } = useChannelMembersQuery(channelId, mode, query);

  const title = mode === 'admins' ? 'Администраторы' : 'Подписчики';
  const placeholder =
    mode === 'admins' ? 'Поиск администраторов' : 'Поиск подписчиков';

  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (mode === 'admins') {
      return list.filter((item) => item.role === 'owner' || item.role === 'admin');
    }
    return list;
  }, [data?.items, mode]);

  const permissions = detail?.channel_permissions;
  const canAdminOps =
    permissions?.can_add_admins === true ||
    permissions?.can_remove_admins === true ||
    permissions?.can_edit_admin_permissions === true ||
    permissions?.can_manage_admins === true;
  const canModerate = permissions?.can_moderate_subscribers === true;
  const showMvpHint = mode === 'admins' ? !canAdminOps : !canModerate && !canAdminOps;

  return (
    <div className="mobile-channel-members">
      <header className="mobile-chat-profile__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={() =>
            navigate({ to: '/channel/$channelId/settings', params: { channelId } })
          }
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">{title}</span>
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

      {showMvpHint ? (
        <p className="mobile-channel-members__hint">
          Просмотр списка. Действия модерации и назначение админов — в следующих версиях.
        </p>
      ) : null}

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
            const displayName =
              item.user?.display_name?.trim() ||
              item.user?.username?.trim() ||
              item.user?.handle?.trim() ||
              item.user_id;
            const avatar = resolveAvatarSrc(item.user?.avatar_url);
            const initial = (displayName.trim()[0] || '?').toUpperCase();

            return (
              <li key={item.user_id} className="mobile-channel-members__row">
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
