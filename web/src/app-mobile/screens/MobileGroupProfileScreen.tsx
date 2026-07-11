import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useAddGroupMembersMutation,
  useChatsQuery,
  useCreatePrivateChatMutation,
  useDeleteChatMutation,
  useLeaveGroupMutation,
  useMuteChatMutation,
  useRemoveGroupMemberMutation,
  useUpdateGroupChatMutation,
  useUpdateGroupMemberTagMutation,
} from '@/queries/chats.queries';
import { useMessagesQuery } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { resolveMediaUrl, uploadFile } from '@/services/mediaService';
import { formatVoiceDuration } from '@/utils/formatFileSize';
import { getAvatarColor, resolveAvatarSrc } from '../utils/avatar';
import { formatMemberCount } from '../utils/channelUtils';
import { MobileGroupAddMembersModal } from '../components/MobileGroupAddMembersModal';
import { MobileGroupMemberTagModal } from '../components/group-profile/MobileGroupMemberTagModal';
import {
  DEFAULT_MEMBER_TAG_COLOR,
  getGroupMemberTagOption,
  isGroupMemberTagColor,
  type GroupMemberTagColor,
} from '../components/group-profile/groupProfile.constants';

import type { MappedChatMember } from '@/types/chat';
import type { MappedMessage } from '@/types/message';

interface MobileGroupProfileScreenProps {
  chatId: string;
}

type GroupTab = 'participants' | 'media' | 'files' | 'voice';

type MemberMenuState = {
  member: MappedChatMember;
  top: number;
  left: number;
} | null;

const GROUP_TAB_ITEMS: [GroupTab, string][] = [
  ['participants', 'Участники'],
  ['media', 'Медиа'],
  ['files', 'Файлы'],
  ['voice', 'Голосовые'],
];

function getMemberDisplayName(member: MappedChatMember) {
  return (
    member.user?.display_name?.trim() ||
    member.user?.username?.trim() ||
    member.user?.handle?.trim() ||
    'Участник'
  );
}

function formatMessageDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function formatRuFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function getFileExtension(fileName: string) {
  const parts = fileName.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1]!.slice(0, 4).toUpperCase();
}

function extractMediaUrl(message: MappedMessage): string | null {
  const media = message.media?.[0];
  const candidates = [media?.thumbnail_url, media?.remote_url, message.content];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    return resolveMediaUrl(candidate);
  }
  return null;
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
  const updateGroup = useUpdateGroupChatMutation();
  const updateMemberTag = useUpdateGroupMemberTagMutation();
  const createPrivateChat = useCreatePrivateChatMutation();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<GroupTab>('participants');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [memberMenu, setMemberMenu] = useState<MemberMenuState>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [tagEditorMember, setTagEditorMember] = useState<MappedChatMember | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [tagColorDraft, setTagColorDraft] = useState<GroupMemberTagColor>(DEFAULT_MEMBER_TAG_COLOR);
  const [actionError, setActionError] = useState<string | null>(null);

  const chat = chats?.find((c) => c.id === chatId);
  const members = chat?.members ?? [];

  const myMembership = useMemo(
    () => members.find((m) => m.user_id === me?.id),
    [members, me?.id],
  );
  const isOwner = myMembership?.role === 'owner';
  const canManageMembers = isOwner;

  useEffect(() => {
    if (!chat || isEditMode) return;
    setNameDraft(chat.name ?? '');
    setDescriptionDraft(chat.description ?? '');
    setAvatarDraftUrl(chat.avatar_url ?? null);
  }, [chat, isEditMode]);

  const displayName = isEditMode
    ? nameDraft.trim() || 'Группа'
    : chat
      ? getChatDisplayName(chat)
      : 'Группа';
  const avatarSrc = resolveAvatarSrc(isEditMode ? avatarDraftUrl : chat?.avatar_url);
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const description = isEditMode
    ? descriptionDraft.trim()
    : chat?.description?.trim() || '';

  const mediaItems = useMemo(() => {
    return (messages ?? [])
      .filter((m) => !m.is_deleted && (m.msg_type === 'image' || m.msg_type === 'video'))
      .flatMap((m) => {
        const media = m.media?.[0];
        if (!media?.remote_url) return [];
        const url = resolveMediaUrl(media.remote_url);
        const thumb = media.thumbnail_url ? resolveMediaUrl(media.thumbnail_url) : url;
        return [{ id: m.id, url, thumb, kind: m.msg_type as 'image' | 'video' }];
      });
  }, [messages]);

  const fileItems = useMemo(() => {
    return (messages ?? [])
      .filter((m) => !m.is_deleted && m.msg_type === 'file')
      .map((m) => {
        const media = m.media?.[0];
        const title = media?.file_name || m.content || 'Файл';
        return {
          id: m.id,
          title,
          extension: getFileExtension(media?.file_name || 'FILE'),
          size: formatRuFileSize(media?.file_size),
          date: formatMessageDate(m.created_at),
          uri: extractMediaUrl(m),
        };
      });
  }, [messages]);

  const voiceItems = useMemo(() => {
    return (messages ?? [])
      .filter(
        (m) => !m.is_deleted && (m.msg_type === 'voice' || m.msg_type === 'video_note'),
      )
      .map((m) => {
        const media = m.media?.[0];
        const member = members.find((item) => item.user_id === m.sender_id);
        const title =
          m.msg_type === 'video_note'
            ? m.sender_id === me?.id
              ? 'Вы'
              : member
                ? getMemberDisplayName(member)
                : 'Участник'
            : m.msg_type === 'voice'
              ? 'Голосовое сообщение'
              : 'Видеосообщение';
        return {
          id: m.id,
          kind: m.msg_type as 'voice' | 'video_note',
          title,
          durationLabel: formatVoiceDuration(media?.duration_ms ?? 0),
          date: formatMessageDate(m.created_at),
          uri: media?.remote_url ? resolveMediaUrl(media.remote_url) : null,
          thumb:
            m.msg_type === 'video_note' && media?.thumbnail_url
              ? resolveMediaUrl(media.thumbnail_url)
              : null,
        };
      });
  }, [messages, members, me?.id]);

  const excludedUserIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);

  const enterEditMode = () => {
    if (!chat) return;
    setNameDraft(chat.name ?? '');
    setDescriptionDraft(chat.description ?? '');
    setAvatarDraftUrl(chat.avatar_url ?? null);
    setActionError(null);
    setIsEditMode(true);
    setShowMoreMenu(false);
    setMemberMenu(null);
  };

  const cancelEditMode = () => {
    if (!chat) return;
    setNameDraft(chat.name ?? '');
    setDescriptionDraft(chat.description ?? '');
    setAvatarDraftUrl(chat.avatar_url ?? null);
    setIsEditMode(false);
  };

  const handleSaveGroup = () => {
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setActionError('Введите название группы');
      return;
    }
    setActionError(null);
    updateGroup.mutate(
      {
        chatId,
        name: trimmedName,
        description: descriptionDraft.trim(),
        avatar_url: avatarDraftUrl ?? '',
      },
      {
        onSuccess: () => setIsEditMode(false),
        onError: (err) =>
          setActionError(err instanceof Error ? err.message : 'Не удалось сохранить группу'),
      },
    );
  };

  const handleAvatarPick = async (file: File) => {
    setAvatarUploading(true);
    setActionError(null);
    try {
      const uploaded = await uploadFile(file);
      setAvatarDraftUrl(uploaded.url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLeave = () => {
    setShowMoreMenu(false);
    if (!window.confirm('Покинуть группу?')) return;
    setActionError(null);
    leaveGroup.mutate(chatId, {
      onSuccess: () => navigate({ to: '/' }),
      onError: (err) =>
        setActionError(err instanceof Error ? err.message : 'Не удалось покинуть группу'),
    });
  };

  const handleDelete = () => {
    setShowMoreMenu(false);
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

  const handleRemoveMember = (member: MappedChatMember) => {
    const name = getMemberDisplayName(member);
    if (!window.confirm(`Исключить ${name} из группы?`)) return;
    setActionError(null);
    setMemberMenu(null);
    removeMember.mutate(
      { chatId, memberId: member.user_id },
      {
        onError: (err) =>
          setActionError(err instanceof Error ? err.message : 'Не удалось удалить участника'),
      },
    );
  };

  const handleWriteMember = (member: MappedChatMember) => {
    if (member.user_id === me?.id) return;
    setMemberMenu(null);
    setActionError(null);
    createPrivateChat.mutate(member.user_id, {
      onSuccess: (directChat) => {
        void navigate({ to: '/chat/$chatId', params: { chatId: directChat.id } });
      },
      onError: (err) =>
        setActionError(err instanceof Error ? err.message : 'Не удалось открыть чат'),
    });
  };

  const openTagEditor = (member: MappedChatMember) => {
    setMemberMenu(null);
    setTagDraft(member.tag?.trim() ?? '');
    setTagColorDraft(
      isGroupMemberTagColor(member.tag_color) ? member.tag_color : DEFAULT_MEMBER_TAG_COLOR,
    );
    setTagEditorMember(member);
  };

  const handleSaveMemberTag = () => {
    if (!tagEditorMember) return;
    setActionError(null);
    updateMemberTag.mutate(
      {
        chatId,
        memberId: tagEditorMember.user_id,
        tag: tagDraft,
        tag_color: tagDraft.trim() ? tagColorDraft : undefined,
      },
      {
        onSuccess: () => {
          setTagEditorMember(null);
          setTagDraft('');
          setTagColorDraft(DEFAULT_MEMBER_TAG_COLOR);
        },
        onError: (err) =>
          setActionError(err instanceof Error ? err.message : 'Не удалось сохранить тег'),
      },
    );
  };

  const openMemberMenu = (member: MappedChatMember, event: MouseEvent<HTMLElement>) => {
    if (member.user_id === me?.id) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setShowMoreMenu(false);
    setMemberMenu({
      member,
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 220),
    });
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
      <header className="mobile-chat-profile__toolbar mobile-group-profile__toolbar">
        <button
          type="button"
          className="mobile-group-profile__pill"
          onClick={() => {
            if (isEditMode) {
              cancelEditMode();
              return;
            }
            void navigate({ to: '/chat/$chatId', params: { chatId } });
          }}
        >
          {isEditMode ? 'Отмена' : 'Назад'}
        </button>
        {isOwner ? (
          <button
            type="button"
            className="mobile-group-profile__pill mobile-group-profile__pill--primary"
            disabled={updateGroup.isPending || avatarUploading}
            onClick={() => {
              if (isEditMode) {
                handleSaveGroup();
                return;
              }
              enterEditMode();
            }}
          >
            {updateGroup.isPending ? '…' : isEditMode ? 'Готово' : 'Изм.'}
          </button>
        ) : (
          <span className="mobile-chat-profile__toolbar-title">Группа</span>
        )}
      </header>

      <div className="mobile-chat-profile__scroll">
        <div className="mobile-chat-profile__hero mobile-group-profile__hero">
          <button
            type="button"
            className="mobile-group-profile__avatar-btn"
            disabled={!isEditMode || avatarUploading}
            onClick={() => {
              if (isEditMode) avatarInputRef.current?.click();
            }}
            aria-label={isEditMode ? 'Выбрать фотографию' : undefined}
          >
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
            {avatarUploading ? (
              <span className="mobile-group-profile__avatar-overlay">…</span>
            ) : null}
          </button>

          {isEditMode ? (
            <>
              <button
                type="button"
                className="mobile-group-profile__change-photo"
                disabled={avatarUploading}
                onClick={() => avatarInputRef.current?.click()}
              >
                Выбрать фотографию
              </button>
              <div className="mobile-group-profile__edit-card">
                <input
                  type="text"
                  className="mobile-group-profile__edit-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Название группы"
                  maxLength={80}
                />
                <textarea
                  className="mobile-group-profile__edit-textarea"
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Описание"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </>
          ) : (
            <>
              <h1 className="mobile-chat-profile__name">{displayName}</h1>
              <p className="mobile-chat-profile__status">{formatMemberCount(members.length)}</p>

              <div className="mobile-group-profile__quick-actions">
                <button
                  type="button"
                  className="mobile-group-profile__quick-action"
                  onClick={() => muteChat.mutate({ chatId, muted: !chat.is_muted })}
                >
                  <span className="mobile-group-profile__quick-action-icon" aria-hidden>
                    {chat.is_muted ? '🔇' : '🔔'}
                  </span>
                  Звук
                </button>
                <div className="mobile-group-profile__more-wrap">
                  <button
                    type="button"
                    className="mobile-group-profile__quick-action"
                    onClick={() => {
                      setMemberMenu(null);
                      setShowMoreMenu((prev) => !prev);
                    }}
                    aria-expanded={showMoreMenu}
                  >
                    <span className="mobile-group-profile__quick-action-icon" aria-hidden>
                      ⋯
                    </span>
                    Ещё
                  </button>
                  {showMoreMenu ? (
                    <div className="mobile-group-profile__menu" role="menu">
                      {!isOwner ? (
                        <button
                          type="button"
                          className="mobile-group-profile__menu-item mobile-group-profile__menu-item--danger"
                          role="menuitem"
                          onClick={handleLeave}
                        >
                          Покинуть группу
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="mobile-group-profile__menu-item mobile-group-profile__menu-item--danger"
                          role="menuitem"
                          onClick={handleDelete}
                        >
                          Удалить группу
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>

        {!isEditMode ? (
          <section className="mobile-group-profile__description-card">
            <h2 className="mobile-group-profile__description-title">Описание</h2>
            <p className="mobile-group-profile__description-text">
              {description || 'Пока без описания'}
            </p>
          </section>
        ) : null}

        {!isEditMode ? (
          <>
            <div className="mobile-group-profile__tabs" role="tablist">
              {GROUP_TAB_ITEMS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  className={`mobile-group-profile__tab${tab === key ? ' mobile-group-profile__tab--active' : ''}`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
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
                      +
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
                  const tagOption = member.tag?.trim()
                    ? getGroupMemberTagOption(member.tag_color)
                    : null;

                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      className="mobile-group-profile__member-row mobile-group-profile__member-row--button"
                      onClick={(event) => openMemberMenu(member, event)}
                      disabled={member.user_id === me?.id}
                    >
                      {memberAvatar ? (
                        <img
                          className="mobile-group-profile__member-avatar"
                          src={memberAvatar}
                          alt=""
                        />
                      ) : (
                        <div
                          className="mobile-group-profile__member-avatar-fallback"
                          style={{ backgroundColor: getAvatarColor(name) }}
                        >
                          {(name.trim()[0] || '?').toUpperCase()}
                        </div>
                      )}
                      <div className="mobile-group-profile__member-body">
                        <span className="mobile-group-profile__member-name-row">
                          <span className="mobile-group-profile__member-name">{name}</span>
                          {tagOption ? (
                            <span
                              className="mobile-group-profile__member-tag"
                              style={{
                                backgroundColor: tagOption.bubble,
                                color: tagOption.text,
                              }}
                            >
                              {member.tag}
                            </span>
                          ) : null}
                        </span>
                        {roleLabel ? (
                          <span className="mobile-group-profile__member-role">{roleLabel}</span>
                        ) : member.user?.is_online ? (
                          <span className="mobile-group-profile__member-role">в сети</span>
                        ) : (
                          <span className="mobile-group-profile__member-role">был(а) недавно</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {tab === 'media' ? (
              <section className="mobile-group-profile__section mobile-group-profile__section--media">
                {mediaItems.length > 0 ? (
                  <div className="mobile-chat-profile__media-grid">
                    {mediaItems.map((item) => (
                      <a
                        key={item.id}
                        className="mobile-chat-profile__media-tile"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img src={item.thumb} alt="" loading="lazy" />
                        {item.kind === 'video' ? (
                          <span className="mobile-chat-profile__media-badge" aria-hidden>
                            ▶
                          </span>
                        ) : null}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mobile-group-profile__empty-tab">Нет медиа</p>
                )}
              </section>
            ) : null}

            {tab === 'files' ? (
              <section className="mobile-group-profile__section">
                {fileItems.length > 0 ? (
                  fileItems.map((item) => (
                    <a
                      key={item.id}
                      className="mobile-group-profile__file-row"
                      href={item.uri ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="mobile-group-profile__file-badge">{item.extension}</span>
                      <span className="mobile-group-profile__file-body">
                        <span className="mobile-group-profile__file-title">{item.title}</span>
                        <span className="mobile-group-profile__file-meta">
                          {[item.size, item.date].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </a>
                  ))
                ) : (
                  <p className="mobile-group-profile__empty-tab">Нет файлов</p>
                )}
              </section>
            ) : null}

            {tab === 'voice' ? (
              <section className="mobile-group-profile__section">
                {voiceItems.length > 0 ? (
                  voiceItems.map((item) => (
                    <div key={item.id} className="mobile-group-profile__voice-row">
                      {item.kind === 'video_note' && item.thumb ? (
                        <img
                          className="mobile-group-profile__voice-thumb"
                          src={item.thumb}
                          alt=""
                        />
                      ) : (
                        <span className="mobile-group-profile__voice-icon" aria-hidden>
                          {item.kind === 'video_note' ? '◎' : '♪'}
                        </span>
                      )}
                      <span className="mobile-group-profile__voice-body">
                        <span className="mobile-group-profile__voice-title">{item.title}</span>
                        <span className="mobile-group-profile__voice-meta">
                          {item.durationLabel} · {item.date}
                        </span>
                      </span>
                      {item.uri ? (
                        <a
                          className="mobile-group-profile__voice-open"
                          href={item.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Открыть
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="mobile-group-profile__empty-tab">Нет голосовых</p>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {actionError ? (
          <p className="mobile-group-profile__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleAvatarPick(file);
        }}
      />

      {memberMenu ? (
        <>
          <button
            type="button"
            className="mobile-group-profile__menu-backdrop"
            aria-label="Закрыть меню"
            onClick={() => setMemberMenu(null)}
          />
          <div
            className="mobile-group-profile__menu mobile-group-profile__menu--anchored"
            role="menu"
            style={{ top: memberMenu.top, left: memberMenu.left }}
          >
            <button
              type="button"
              className="mobile-group-profile__menu-item"
              role="menuitem"
              onClick={() => handleWriteMember(memberMenu.member)}
            >
              Написать
            </button>
            {isOwner ? (
              <button
                type="button"
                className="mobile-group-profile__menu-item"
                role="menuitem"
                onClick={() => openTagEditor(memberMenu.member)}
              >
                {memberMenu.member.tag?.trim()
                  ? 'Изменить тег участника'
                  : 'Добавить тег участника'}
              </button>
            ) : null}
            {isOwner && memberMenu.member.role !== 'owner' ? (
              <button
                type="button"
                className="mobile-group-profile__menu-item mobile-group-profile__menu-item--danger"
                role="menuitem"
                onClick={() => handleRemoveMember(memberMenu.member)}
              >
                Исключить
              </button>
            ) : null}
          </div>
        </>
      ) : null}

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

      {tagEditorMember ? (
        <MobileGroupMemberTagModal
          member={tagEditorMember}
          tagDraft={tagDraft}
          tagColorDraft={tagColorDraft}
          saving={updateMemberTag.isPending}
          onChangeTag={setTagDraft}
          onChangeColor={setTagColorDraft}
          onClose={() => setTagEditorMember(null)}
          onSave={handleSaveMemberTag}
        />
      ) : null}
    </div>
  );
}
