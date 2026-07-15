import { useState, useMemo, useEffect } from 'react';
import { Avatar } from '@/components/avatar/Avatar';
import { ImageLightbox } from './ImageLightbox';
import { ChatInfoAddMembersModal } from './ChatInfoAddMembersModal';
import { GroupSettingsPanel } from './GroupSettingsPanel';
import { useUserDetailQuery } from '@/queries/users.queries';
import { useMeQuery } from '@/queries/auth.queries';
import {
  useAddGroupMembersMutation,
  useUpdateGroupChatMutation,
} from '@/queries/chats.queries';
import { useMessagesQuery } from '@/queries/messages.queries';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { resolveMediaUrl } from '@/services/mediaService';
import { formatFileSize } from '@/utils/formatFileSize';
import { canSaveOrForwardContent, restrictSavingReason } from '@/utils/chatPermissions';
import type { ChatSummary } from '@/types/chat';
import './chat-info-sidebar.css';

interface ChatInfoSidebarProps {
  chat: ChatSummary;
  onClose: () => void;
}

export function ChatInfoSidebar({ chat, onClose }: ChatInfoSidebarProps) {
  const { data: me } = useMeQuery();
  const { data: messages } = useMessagesQuery(chat.id);
  const displayName = getChatDisplayName(chat);

  const peer = useMemo(() => {
    if (chat.chat_type !== 'private') return null;
    return chat.members?.find((m) => m.user_id !== me?.id) ?? null;
  }, [chat, me]);

  const { data: peerDetail } = useUserDetailQuery(peer?.user_id ?? undefined);

  const [activeTab, setActiveTab] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMembersError, setAddMembersError] = useState<string | null>(null);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [groupEditError, setGroupEditError] = useState<string | null>(null);
  const addMembers = useAddGroupMembersMutation();
  const updateGroup = useUpdateGroupChatMutation();

  const isGroupChat = chat.chat_type === 'group';
  const members = chat.members ?? [];
  const myMembership = useMemo(
    () => members.find((m) => m.user_id === me?.id),
    [members, me?.id],
  );
  const isOwner = myMembership?.role === 'owner';
  const isAdmin = myMembership?.role === 'admin';
  const canManageMembers = isGroupChat && isOwner;
  const canEditGroup = canManageMembers;
  const canOpenGroupSettings = isGroupChat && (isOwner || isAdmin);
  const allowSaveContent = canSaveOrForwardContent(chat, me);
  const excludedMemberIds = useMemo(
    () => new Set(members.map((m) => m.user_id).filter(Boolean)),
    [members],
  );

  useEffect(() => {
    setIsEditingGroup(false);
    setShowGroupSettings(false);
    setGroupEditError(null);
  }, [chat.id]);

  const enterGroupEdit = () => {
    setNameDraft(chat.name ?? displayName);
    setDescriptionDraft(chat.description ?? '');
    setGroupEditError(null);
    setIsEditingGroup(true);
  };

  const cancelGroupEdit = () => {
    setIsEditingGroup(false);
    setGroupEditError(null);
  };

  const saveGroupEdit = () => {
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setGroupEditError('Введите название группы');
      return;
    }
    setGroupEditError(null);
    updateGroup.mutate(
      {
        chatId: chat.id,
        name: trimmedName,
        description: descriptionDraft.trim(),
      },
      {
        onSuccess: () => setIsEditingGroup(false),
        onError: (err) =>
          setGroupEditError(
            err instanceof Error ? err.message : 'Не удалось сохранить группу',
          ),
      },
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || lightboxSrc || showAddMembers) return;
      if (showGroupSettings) {
        setShowGroupSettings(false);
        return;
      }
      if (isEditingGroup) {
        cancelGroupEdit();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, lightboxSrc, showAddMembers, isEditingGroup, showGroupSettings]);

  const isDobry = useMemo(() => {
    return displayName.toLowerCase().includes('добры') || (peer?.user_id && peer.user_id.includes('dmitry'));
  }, [displayName, peer]);

  const phone = peerDetail?.phone || peer?.user?.phone || (isDobry ? '+7 918 160 6676' : '');
  const username = peerDetail?.handle || peer?.user?.handle || (isDobry ? 'nikitabl4' : '');
  const bio = peerDetail?.bio || (isDobry ? 'бу' : '');
  const birthdayVal = peerDetail?.birthday || (isDobry ? 1080691200000 : null);

  const formattedBirthday = useMemo(() => {
    if (!birthdayVal) return '';
    const date = new Date(birthdayVal);
    const ruMonths = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    const day = date.getDate();
    const month = ruMonths[date.getMonth()];
    const year = date.getFullYear();
    const now = new Date();
    let age = now.getFullYear() - year;
    const monthDiff = now.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age--;
    }
    return `${day} ${month} (${age} лет)`;
  }, [birthdayVal]);

  const userStatus = useMemo(() => {
    if (chat.chat_type !== 'private') {
      return `${chat.members?.length ?? 0} участников`;
    }
    const targetUser = peerDetail ?? peer?.user;
    if (!targetUser) return 'был(а) недавно';
    if (targetUser.is_online) return 'в сети';
    if (isDobry) return 'был(а) недавно';

    const lastSeen = 'last_seen' in targetUser ? targetUser.last_seen : null;
    if (!lastSeen) return 'был(а) недавно';

    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'был(а) только что';
    if (diffMins < 60) return `был(а) ${diffMins} мин. назад`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `был(а) сегодня в ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `был(а) ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} в ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [chat, peer, peerDetail, isDobry]);

  const mediaMessages = useMemo(() => {
    return (messages ?? []).filter(
      (m) => !m.is_deleted && (m.msg_type === 'image' || m.msg_type === 'video'),
    );
  }, [messages]);

  const fileMessages = useMemo(() => {
    return (messages ?? []).filter((m) => !m.is_deleted && m.msg_type === 'file');
  }, [messages]);

  const linkMessages = useMemo(() => {
    const linkRegex = /(https?:\/\/[^\s]+)/i;
    return (messages ?? []).filter(
      (m) => !m.is_deleted && m.content && linkRegex.test(m.content),
    );
  }, [messages]);

  const voiceMessages = useMemo(() => {
    return (messages ?? []).filter(
      (m) => !m.is_deleted && (m.msg_type === 'voice' || m.msg_type === 'video_note'),
    );
  }, [messages]);

  const tabs = ['Медиа', 'Файлы', 'Ссылки', 'Голосовые'];

  const handleAvatarClick = () => {
    if (chat.avatar_url) {
      setLightboxSrc(resolveMediaUrl(chat.avatar_url));
    }
  };

  if (showGroupSettings && isGroupChat) {
    return (
      <div className="chat-info-sidebar">
        <GroupSettingsPanel
          chat={chat}
          meId={me?.id}
          isOwner={isOwner}
          onBack={() => setShowGroupSettings(false)}
          onCloseSidebar={onClose}
        />
      </div>
    );
  }

  return (
    <div className="chat-info-sidebar">
      <header className="chat-info-sidebar__header">
        <button
          type="button"
          className="chat-info-sidebar__close-btn"
          aria-label={isEditingGroup ? 'Отмена' : 'Закрыть'}
          onClick={() => {
            if (isEditingGroup) {
              cancelGroupEdit();
              return;
            }
            onClose();
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h2 className="chat-info-sidebar__title">
          {isEditingGroup ? 'Редактирование' : 'Информация'}
        </h2>
        {canEditGroup ? (
          <button
            type="button"
            className="chat-info-sidebar__edit-btn"
            aria-label={isEditingGroup ? 'Сохранить' : 'Редактировать группу'}
            disabled={updateGroup.isPending}
            onClick={() => {
              if (isEditingGroup) {
                saveGroupEdit();
                return;
              }
              enterGroupEdit();
            }}
          >
            {isEditingGroup ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
          </button>
        ) : (
          <span className="chat-info-sidebar__edit-btn chat-info-sidebar__edit-btn--spacer" aria-hidden />
        )}
      </header>

      <div className="chat-info-sidebar__scroll-content">
        <div className="chat-info-sidebar__profile-card">
          <div
            className={`chat-info-sidebar__avatar-wrap${chat.avatar_url && !isEditingGroup ? ' chat-info-sidebar__avatar-wrap--clickable' : ''}`}
            onClick={isEditingGroup ? undefined : handleAvatarClick}
          >
            <Avatar
              name={isEditingGroup ? nameDraft.trim() || displayName : displayName}
              imageUrl={chat.avatar_url}
              size={112}
            />
          </div>
          {isEditingGroup ? (
            <div className="chat-info-sidebar__edit-fields">
              <input
                type="text"
                className="chat-info-sidebar__edit-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Название группы"
                maxLength={80}
                aria-label="Название группы"
                disabled={updateGroup.isPending}
              />
              <textarea
                className="chat-info-sidebar__edit-textarea"
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="Описание"
                rows={3}
                maxLength={500}
                aria-label="Описание группы"
                disabled={updateGroup.isPending}
              />
              {groupEditError ? (
                <p className="chat-info-sidebar__edit-error" role="alert">
                  {groupEditError}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <h3 className="chat-info-sidebar__name">{displayName}</h3>
              <span className={`chat-info-sidebar__status${userStatus === 'в сети' ? ' chat-info-sidebar__status--online' : ''}`}>
                {userStatus}
              </span>
              {isGroupChat && chat.description?.trim() ? (
                <p className="chat-info-sidebar__description">{chat.description.trim()}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="chat-info-sidebar__details-box">
          {chat.chat_type === 'private' && (
            <>
              {phone && (
                <div className="chat-info-sidebar__detail-item">
                  <span className="chat-info-sidebar__detail-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                  <div className="chat-info-sidebar__detail-content">
                    <span className="chat-info-sidebar__detail-value">{phone}</span>
                    <span className="chat-info-sidebar__detail-label">Телефон</span>
                  </div>
                </div>
              )}
              {username && (
                <div className="chat-info-sidebar__detail-item">
                  <span className="chat-info-sidebar__detail-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
                    </svg>
                  </span>
                  <div className="chat-info-sidebar__detail-content">
                    <span className="chat-info-sidebar__detail-value">@{username}</span>
                    <span className="chat-info-sidebar__detail-label">Имя пользователя</span>
                  </div>
                </div>
              )}
              {bio && (
                <div className="chat-info-sidebar__detail-item">
                  <span className="chat-info-sidebar__detail-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </span>
                  <div className="chat-info-sidebar__detail-content">
                    <span className="chat-info-sidebar__detail-value">{bio}</span>
                    <span className="chat-info-sidebar__detail-label">О себе</span>
                  </div>
                </div>
              )}
              {formattedBirthday && (
                <div className="chat-info-sidebar__detail-item">
                  <span className="chat-info-sidebar__detail-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                  <div className="chat-info-sidebar__detail-content">
                    <span className="chat-info-sidebar__detail-value">{formattedBirthday}</span>
                    <span className="chat-info-sidebar__detail-label">День рождения</span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="chat-info-sidebar__detail-item">
            <span className="chat-info-sidebar__detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <div className="chat-info-sidebar__detail-content chat-info-sidebar__detail-content--row">
              <span id="notifications-label" className="chat-info-sidebar__detail-value">Уведомления</span>
              <label className="chat-info-sidebar__switch">
                <input
                  type="checkbox"
                  role="switch"
                  aria-labelledby="notifications-label"
                  checked={notificationsEnabled}
                  onChange={(e) => setNotificationsEnabled(e.target.checked)}
                />
                <span className="chat-info-sidebar__slider" />
              </label>
            </div>
          </div>
        </div>

        {canOpenGroupSettings ? (
          <div className="chat-info-sidebar__add-member-box">
            <button
              type="button"
              className="chat-info-sidebar__add-member-btn"
              onClick={() => setShowGroupSettings(true)}
            >
              <span className="chat-info-sidebar__add-member-icon" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
              <span className="chat-info-sidebar__add-member-label">Настройки группы</span>
            </button>
          </div>
        ) : null}

        {canManageMembers ? (
          <div className="chat-info-sidebar__add-member-box">
            <button
              type="button"
              className="chat-info-sidebar__add-member-btn"
              onClick={() => {
                setAddMembersError(null);
                setShowAddMembers(true);
              }}
            >
              <span className="chat-info-sidebar__add-member-icon" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </span>
              <span className="chat-info-sidebar__add-member-label">Добавить участника</span>
            </button>
          </div>
        ) : null}

        {isGroupChat && (
          <div className="chat-info-sidebar__members-box">
            <h4 className="chat-info-sidebar__section-title">Участники ({members.length})</h4>
            <div className="chat-info-sidebar__members-list">
              {members.map((member) => (
                <div key={member.user_id} className="chat-info-sidebar__member-row">
                  <Avatar name={member.user?.display_name || 'Group Member'} imageUrl={member.user?.avatar_url} size={38} />
                  <div className="chat-info-sidebar__member-details">
                    <span className="chat-info-sidebar__member-name">
                      {member.user?.display_name || 'Unknown'}
                    </span>
                    <span className={`chat-info-sidebar__member-role chat-info-sidebar__member-role--${member.role}`}>
                      {member.role === 'owner'
                        ? 'Владелец'
                        : member.role === 'admin'
                          ? 'Администратор'
                          : 'Участник'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="chat-info-sidebar__tabs-nav" role="tablist">
          {tabs.map((tab, idx) => (
            <button
              key={tab}
              type="button"
              id={`tab-${idx}`}
              role="tab"
              aria-selected={activeTab === idx}
              aria-controls={`tabpanel-${idx}`}
              className={`chat-info-sidebar__tab-btn${activeTab === idx ? ' chat-info-sidebar__tab-btn--active' : ''}`}
              onClick={() => setActiveTab(idx)}
            >
              {tab}
            </button>
          ))}
          <div
            className="chat-info-sidebar__tab-indicator"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${activeTab * 100}%)`,
            }}
          />
        </div>

        <div
          className="chat-info-sidebar__panel"
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 0 && (
            mediaMessages.length === 0 ? (
              <div className="chat-info-sidebar__empty-state">
                <span className="chat-info-sidebar__empty-icon" aria-hidden>🖼️</span>
                <p className="chat-info-sidebar__empty-text">Нет медиа файлов</p>
              </div>
            ) : (
              <div className="chat-info-sidebar__media-grid">
                {mediaMessages.map((msg) => {
                  const media = msg.media?.[0];
                  if (!media) return null;
                  const isVideo = media.media_type === 'video' || msg.msg_type === 'video';
                  const fullUrl = resolveMediaUrl(media.remote_url || '');
                  return (
                    <button
                      key={msg.id}
                      type="button"
                      className="chat-info-sidebar__media-item"
                      aria-label={isVideo ? 'Видео' : 'Фото'}
                      onClick={() => {
                        if (isVideo) return;
                        if (!allowSaveContent) return;
                        setLightboxSrc(fullUrl);
                      }}
                    >
                      <img
                        src={resolveMediaUrl(media.thumbnail_url || media.remote_url || '')}
                        alt=""
                        loading="lazy"
                        draggable={allowSaveContent}
                        onContextMenu={
                          allowSaveContent ? undefined : (e) => e.preventDefault()
                        }
                      />
                      {isVideo && (
                        <span className="chat-info-sidebar__video-play-badge">▶</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 1 && (
            fileMessages.length === 0 ? (
              <div className="chat-info-sidebar__empty-state">
                <span className="chat-info-sidebar__empty-icon" aria-hidden>📁</span>
                <p className="chat-info-sidebar__empty-text">Нет файлов</p>
              </div>
            ) : (
              <div className="chat-info-sidebar__files-list">
                {fileMessages.map((msg) => {
                  const media = msg.media?.[0];
                  if (!media) return null;
                  const resolved = resolveMediaUrl(media.remote_url || '');
                  if (!allowSaveContent) {
                    return (
                      <div
                        key={msg.id}
                        className="chat-info-sidebar__file-row chat-info-sidebar__file-row--restricted"
                        title={restrictSavingReason()}
                      >
                        <div className="chat-info-sidebar__file-icon">
                          {media.file_name?.split('.').pop()?.toUpperCase() || 'FILE'}
                        </div>
                        <div className="chat-info-sidebar__file-details">
                          <span className="chat-info-sidebar__file-name">{media.file_name}</span>
                          <span className="chat-info-sidebar__file-size">
                            {formatFileSize(media.file_size)} · скачивание запрещено
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <a
                      key={msg.id}
                      href={resolved}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chat-info-sidebar__file-row"
                      download={media.file_name ?? undefined}
                    >
                      <div className="chat-info-sidebar__file-icon">
                        {media.file_name?.split('.').pop()?.toUpperCase() || 'FILE'}
                      </div>
                      <div className="chat-info-sidebar__file-details">
                        <span className="chat-info-sidebar__file-name">{media.file_name}</span>
                        <span className="chat-info-sidebar__file-size">{formatFileSize(media.file_size)}</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 2 && (
            linkMessages.length === 0 ? (
              <div className="chat-info-sidebar__empty-state">
                <span className="chat-info-sidebar__empty-icon" aria-hidden>🔗</span>
                <p className="chat-info-sidebar__empty-text">Нет ссылок</p>
              </div>
            ) : (
              <div className="chat-info-sidebar__links-list">
                {linkMessages.map((msg) => {
                  const matches = msg.content?.match(/(https?:\/\/[^\s]+)/gi) || [];
                  return matches.map((link, idx) => (
                    <a
                      key={`${msg.id}-${idx}`}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chat-info-sidebar__link-row"
                    >
                      <div className="chat-info-sidebar__link-icon">🌍</div>
                      <div className="chat-info-sidebar__link-details">
                        <span className="chat-info-sidebar__link-url">{link}</span>
                        <span className="chat-info-sidebar__link-date">
                          {new Date(msg.created_at).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>
                    </a>
                  ));
                })}
              </div>
            )
          )}

          {activeTab === 3 && (
            voiceMessages.length === 0 ? (
              <div className="chat-info-sidebar__empty-state">
                <span className="chat-info-sidebar__empty-icon" aria-hidden>🎤</span>
                <p className="chat-info-sidebar__empty-text">Нет голосовых сообщений</p>
              </div>
            ) : (
              <div className="chat-info-sidebar__voice-list">
                {voiceMessages.map((msg) => {
                  const media = msg.media?.[0];
                  if (!media) return null;
                  const durationStr = media.duration_ms
                    ? `${Math.floor(media.duration_ms / 60000)}:${String(
                        Math.floor((media.duration_ms % 60000) / 1000),
                      ).padStart(2, '0')}`
                    : '0:00';
                  return (
                    <div key={msg.id} className="chat-info-sidebar__voice-row">
                      <div className="chat-info-sidebar__voice-icon">
                        {msg.msg_type === 'video_note' ? '📹' : '🎤'}
                      </div>
                      <div className="chat-info-sidebar__voice-details">
                        <span className="chat-info-sidebar__voice-title">
                          {msg.msg_type === 'video_note' ? 'Видеосообщение' : 'Голосовое сообщение'}
                        </span>
                        <span className="chat-info-sidebar__voice-duration">
                          {durationStr} • {new Date(msg.created_at).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
          allowDownload={allowSaveContent}
        />
      )}

      {showAddMembers ? (
        <ChatInfoAddMembersModal
          chatId={chat.id}
          excludedUserIds={excludedMemberIds}
          pending={addMembers.isPending}
          error={addMembersError}
          onClose={() => {
            setShowAddMembers(false);
            setAddMembersError(null);
          }}
          onAdd={(memberIds) => {
            setAddMembersError(null);
            addMembers.mutate(
              { chatId: chat.id, memberIds },
              {
                onSuccess: () => {
                  setShowAddMembers(false);
                  setAddMembersError(null);
                },
                onError: (err) =>
                  setAddMembersError(
                    err instanceof Error ? err.message : 'Не удалось добавить участника',
                  ),
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
