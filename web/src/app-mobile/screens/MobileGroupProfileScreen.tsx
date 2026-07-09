import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useAddGroupMembersMutation,
  useChatsQuery,
  useDeleteChatMutation,
  useLeaveGroupMutation,
  useMuteChatMutation,
  useRemoveGroupMemberMutation,
} from '@/queries/chats.queries';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { resolveMediaUrl } from '@/services/mediaService';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { formatMemberCount } from '../utils/channelUtils';
import { MobileGroupAddMembersModal } from '../components/MobileGroupAddMembersModal';

import type { MappedChatMember } from '@/types/chat';

interface MobileGroupProfileScreenProps {
  chatId: string;
}

type GroupTab = 'participants' | 'media';

function getMemberDisplayName(member: MappedChatMember) {
  return (
    member.user?.display_name?.trim() ||
    member.user?.username?.trim() ||
    member.user?.handle?.trim() ||
    'Участник'
  );
}

export function MobileGroupProfileScreen({ chatId }: MobileGroupProfileScreenProps) {
  const navigate = useNavigate();
  const { data: chats, isLoading } = useChatsQuery();
  const { data: messages } = useMessagesQuery(chatId);
  const { data: me } = useMeQuery();
  const muteChat = useMuteChatMutation();
  const leaveGroup = useLeaveGroupMutation();
  const deleteChat = useDeleteChatMutation();
  const addMembers = useAddGroupMembersMutation();
  const removeMember = useRemoveGroupMemberMutation();

  const [tab, setTab] = useState<GroupTab>('participants');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const chat = chats?.find((c) => c.id === chatId);
  const displayName = chat ? getChatDisplayName(chat) : 'Группа';
  const avatarSrc = resolveAvatarSrc(chat?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const members = chat?.members ?? [];

  const myMembership = useMemo(
    () => members.find((m) => m.user_id === me?.id),
    [members, me?.id],
  );
  const isOwner = myMembership?.role === 'owner';
  const canManageMembers = isOwner;

  const mediaItems = useMemo(() => {
    return (messages ?? [])
      .filter((m) => !m.is_deleted && (m.msg_type === 'image' || m.msg_type === 'video'))
      .flatMap((m) => {
        const media = m.media?.[0];
        if (!media?.remote_url) return [];
        const url = resolveMediaUrl(media.remote_url);
        const thumb = media.thumbnail_url ? resolveMediaUrl(media.thumbnail_url) : url;
        return [{ id: m.id, url, thumb, kind: m.msg_type as 'image' | 'video' }];
      })
      .slice(0, 24);
  }, [messages]);

  const excludedUserIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);

  const handleLeave = () => {
    if (!window.confirm('Покинуть группу?')) return;
    setActionError(null);
    leaveGroup.mutate(chatId, {
      onSuccess: () => navigate({ to: '/' }),
      onError: (err) =>
        setActionError(err instanceof Error ? err.message : 'Не удалось покинуть группу'),
    });
  };

  const handleDelete = () => {
    if (!window.confirm('Удалить группу для всех участников?')) return;
    setActionError(null);
    deleteChat.mutate(
      { chatId, scope: 'all' },
      {
        onSuccess: () => navigate({ to: '/' }),
        onError: (err) =>
          setActionError(err instanceof Error ? err.message : 'Не удалось удалить группу'),
      },
    );
  };

  const handleRemoveMember = (memberId: string, name: string) => {
    if (!window.confirm(`Удалить ${name} из группы?`)) return;
    setActionError(null);
    removeMember.mutate(
      { chatId, memberId },
      {
        onError: (err) =>
          setActionError(err instanceof Error ? err.message : 'Не удалось удалить участника'),
      },
    );
  };

  if (isLoading) {
    return <div className="mobile-chat-profile__loading">Загрузка…</div>;
  }

  if (!chat || chat.chat_type !== 'group') {
    return (
      <div className="mobile-chat-profile">
        <header className="mobile-chat-profile__toolbar">
          <button
            type="button"
            className="mobile-chat__back"
            onClick={() => navigate({ to: '/' })}
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="mobile-chat-profile__toolbar-title">Группа</span>
        </header>
        <p className="mobile-chat-profile__empty">Группа не найдена</p>
      </div>
    );
  }

  return (
    <div className="mobile-chat-profile mobile-group-profile">
      <header className="mobile-chat-profile__toolbar">
        <button
          type="button"
          className="mobile-chat__back"
          onClick={() => navigate({ to: '/chat/$chatId', params: { chatId } })}
          aria-label="Назад к чату"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="mobile-chat-profile__toolbar-title">Группа</span>
      </header>

      <div className="mobile-chat-profile__scroll">
        <div className="mobile-chat-profile__hero">
          {avatarSrc ? (
            <img className="mobile-chat-profile__avatar" src={avatarSrc} alt="" />
          ) : (
            <div
              className="mobile-chat-profile__avatar-fallback"
              style={{ backgroundColor: getAvatarColor(displayName) }}
            >
              {initial}
            </div>
          )}
          <h1 className="mobile-chat-profile__name">{displayName}</h1>
          <p className="mobile-chat-profile__status">{formatMemberCount(members.length)}</p>
        </div>

        <div className="mobile-group-profile__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'participants'}
            className={`mobile-group-profile__tab${tab === 'participants' ? ' mobile-group-profile__tab--active' : ''}`}
            onClick={() => setTab('participants')}
          >
            Участники
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'media'}
            className={`mobile-group-profile__tab${tab === 'media' ? ' mobile-group-profile__tab--active' : ''}`}
            onClick={() => setTab('media')}
          >
            Медиа
          </button>
        </div>

        {tab === 'participants' ? (
          <section className="mobile-group-profile__section">
            {canManageMembers ? (
              <button
                type="button"
                className="mobile-group-profile__action-row"
                onClick={() => setShowAddMembers(true)}
              >
                <span className="mobile-group-profile__action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </span>
                Добавить участников
              </button>
            ) : null}
            {members.map((member) => {
              const name = getMemberDisplayName(member);
              const memberAvatar = resolveAvatarSrc(member.user?.avatar_url);
              const roleLabel =
                member.role === 'owner'
                  ? 'владелец'
                  : member.role === 'admin'
                    ? 'админ'
                    : null;
              const canRemove =
                canManageMembers && member.user_id !== me?.id && member.role !== 'owner';

              return (
                <div key={member.user_id} className="mobile-group-profile__member-row">
                  {memberAvatar ? (
                    <img className="mobile-group-profile__member-avatar" src={memberAvatar} alt="" />
                  ) : (
                    <div
                      className="mobile-group-profile__member-avatar-fallback"
                      style={{ backgroundColor: getAvatarColor(name) }}
                    >
                      {(name.trim()[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <div className="mobile-group-profile__member-body">
                    <span className="mobile-group-profile__member-name">{name}</span>
                    {roleLabel ? (
                      <span className="mobile-group-profile__member-role">{roleLabel}</span>
                    ) : member.user?.is_online ? (
                      <span className="mobile-group-profile__member-role">в сети</span>
                    ) : null}
                  </div>
                  {canRemove ? (
                    <button
                      type="button"
                      className="mobile-group-profile__member-remove"
                      onClick={() => handleRemoveMember(member.user_id, name)}
                      aria-label={`Удалить ${name}`}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : (
          <section className="mobile-chat-profile__section">
            {mediaItems.length > 0 ? (
              <div className="mobile-chat-profile__media-grid">
                {mediaItems.map((item) => (
                  <div key={item.id} className="mobile-chat-profile__media-tile">
                    <img src={item.thumb} alt="" loading="lazy" />
                    {item.kind === 'video' ? (
                      <span className="mobile-chat-profile__media-badge" aria-hidden>
                        ▶
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mobile-group-profile__empty-tab">Нет медиа</p>
            )}
          </section>
        )}

        <section className="mobile-chat-profile__section">
          <button
            type="button"
            className="mobile-group-profile__settings-row"
            onClick={() =>
              muteChat.mutate({ chatId, muted: !chat.is_muted })
            }
          >
            <span>Уведомления</span>
            <span>{chat.is_muted ? 'выкл.' : 'вкл.'}</span>
          </button>
        </section>

        <section className="mobile-group-profile__danger">
          {!isOwner ? (
            <button type="button" className="mobile-group-profile__danger-btn" onClick={handleLeave}>
              Покинуть группу
            </button>
          ) : null}
          {isOwner ? (
            <button type="button" className="mobile-group-profile__danger-btn" onClick={handleDelete}>
              Удалить группу
            </button>
          ) : null}
        </section>

        {actionError ? (
          <p className="mobile-group-profile__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      {showAddMembers ? (
        <MobileGroupAddMembersModal
          chatId={chatId}
          excludedUserIds={excludedUserIds}
          pending={addMembers.isPending}
          onClose={() => setShowAddMembers(false)}
          onAdd={(memberIds) => {
            addMembers.mutate(
              { chatId, memberIds },
              {
                onSuccess: () => setShowAddMembers(false),
                onError: (err) =>
                  setActionError(
                    err instanceof Error ? err.message : 'Не удалось добавить участников',
                  ),
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
