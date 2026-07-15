import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/avatar/Avatar';
import { SettingsNavRow, SettingsToggleRow } from './SettingsToggleRow';
import {
  isMissingEndpoint,
  useDeleteChatMutation,
  useGroupInviteLinkQuery,
  useGroupSettingsQuery,
  useLeaveGroupMutation,
  useRegenerateGroupInviteMutation,
  useRemoveGroupMemberMutation,
  useRevokeGroupInviteMutation,
  useUpdateGroupAdminMutation,
  useUpdateGroupSettingsMutation,
} from '@/queries/chats.queries';
import { ApiError } from '@/services/apiClient';
import type { ChatSummary, MappedChatMember } from '@/types/chat';
import type {
  GroupAdminPermissions,
  GroupMemberPermissions,
} from '@/types/groupSettings';
import {
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  defaultGroupSettings,
} from '@/types/groupSettings';
import './group-settings.css';

type SettingsView =
  | { kind: 'root' }
  | { kind: 'permissions' }
  | { kind: 'admins' }
  | { kind: 'admin-edit'; userId: string }
  | { kind: 'add-admin' }
  | { kind: 'members' };

interface GroupSettingsPanelProps {
  chat: ChatSummary;
  meId: string | undefined;
  isOwner: boolean;
  onBack: () => void;
  onCloseSidebar: () => void;
}

const MEMBER_PERM_ROWS: {
  key: keyof GroupMemberPermissions;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'can_send_messages',
    title: 'Отправлять сообщения',
    subtitle: 'Участники могут писать в группу',
  },
  {
    key: 'can_send_media',
    title: 'Отправлять медиа',
    subtitle: 'Фото, видео, файлы и голосовые',
  },
  {
    key: 'can_add_users',
    title: 'Добавлять участников',
    subtitle: 'Приглашать новых людей в группу',
  },
  {
    key: 'can_pin_messages',
    title: 'Закреплять сообщения',
    subtitle: 'Закрепление сообщений в чате',
  },
  {
    key: 'can_change_info',
    title: 'Изменять информацию о группе',
    subtitle: 'Название, фото и описание',
  },
  {
    key: 'can_create_polls',
    title: 'Создавать опросы',
    subtitle: 'Публиковать опросы в группе',
  },
];

const ADMIN_PERM_ROWS: {
  key: keyof GroupAdminPermissions;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'can_change_info',
    title: 'Изменять информацию о группе',
    subtitle: 'Название, фото и описание',
  },
  {
    key: 'can_delete_messages',
    title: 'Удалять сообщения',
    subtitle: 'Удалять чужие сообщения',
  },
  {
    key: 'can_ban_users',
    title: 'Блокировать пользователей',
    subtitle: 'Исключать и банить участников',
  },
  {
    key: 'can_pin_messages',
    title: 'Закреплять сообщения',
    subtitle: 'Закрепление сообщений в чате',
  },
  {
    key: 'can_invite_users',
    title: 'Добавлять участников',
    subtitle: 'Приглашать людей в группу',
  },
  {
    key: 'can_manage_invite_links',
    title: 'Управлять пригласительными ссылками',
    subtitle: 'Создавать и отзывать ссылки',
  },
  {
    key: 'can_add_admins',
    title: 'Добавлять администраторов',
    subtitle: 'Назначать новых админов',
  },
  {
    key: 'can_manage_video_chats',
    title: 'Управлять видеозвонками / звонками',
    subtitle: 'Начинать и управлять групповыми звонками',
  },
];

function memberDisplayName(member: MappedChatMember) {
  return (
    member.user?.display_name?.trim() ||
    member.user?.username?.trim() ||
    member.user?.handle?.trim() ||
    'Участник'
  );
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Владелец';
  if (role === 'admin') return 'Администратор';
  return 'Участник';
}

function buildInviteDisplay(
  inviteLink: string | null | undefined,
  inviteToken: string | null | undefined,
): string {
  if (inviteLink?.trim()) return inviteLink.trim();
  if (inviteToken?.trim()) return `chatus://join/${inviteToken.trim()}`;
  return '';
}

function adminPermsFromMember(member: MappedChatMember): GroupAdminPermissions {
  if (member.role === 'owner') {
    return {
      can_change_info: true,
      can_delete_messages: true,
      can_ban_users: true,
      can_invite_users: true,
      can_pin_messages: true,
      can_manage_invite_links: true,
      can_manage_video_chats: true,
      can_add_admins: true,
    };
  }
  return { ...DEFAULT_ADMIN_PERMISSIONS, ...(member.admin_permissions ?? {}) };
}

export function GroupSettingsPanel({
  chat,
  meId,
  isOwner,
  onBack,
  onCloseSidebar,
}: GroupSettingsPanelProps) {
  const [view, setView] = useState<SettingsView>({ kind: 'root' });
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [adminDraft, setAdminDraft] = useState<GroupAdminPermissions | null>(null);
  const [copied, setCopied] = useState(false);

  const settingsQuery = useGroupSettingsQuery(chat.id, true);
  const inviteQuery = useGroupInviteLinkQuery(chat.id, view.kind === 'root');
  const updateSettings = useUpdateGroupSettingsMutation(chat.id);
  const updateAdmin = useUpdateGroupAdminMutation(chat.id);
  const regenerateInvite = useRegenerateGroupInviteMutation(chat.id);
  const revokeInvite = useRevokeGroupInviteMutation(chat.id);
  const removeMember = useRemoveGroupMemberMutation();
  const leaveGroup = useLeaveGroupMutation();
  const deleteChat = useDeleteChatMutation();

  const settingsUnavailable = isMissingEndpoint(settingsQuery.error);
  const inviteUnavailable = isMissingEndpoint(inviteQuery.error);
  const settingsBusy = updateSettings.isPending;

  const settings = settingsQuery.data ?? defaultGroupSettings(chat.id);
  const memberPerms = settings.member_permissions ?? DEFAULT_MEMBER_PERMISSIONS;

  const inviteDisplay = buildInviteDisplay(
    inviteQuery.data?.invite_link,
    inviteQuery.data?.invite_token ?? settings.invite_token ?? chat.invite_token ?? null,
  );

  const members = chat.members ?? [];
  const adminList = useMemo(
    () => members.filter((m) => m.role === 'owner' || m.role === 'admin'),
    [members],
  );

  const editingMember = useMemo(() => {
    if (view.kind !== 'admin-edit') return null;
    return members.find((m) => m.user_id === view.userId) ?? null;
  }, [view, members]);

  const promoteCandidates = useMemo(
    () => members.filter((m) => m.role === 'member' && m.user_id !== meId),
    [members, meId],
  );

  const canManageInvite =
    settings.my_permissions?.can_manage_invite_links === true || isOwner;
  const canAddAdmins = settings.my_permissions?.can_add_admins === true || isOwner;
  const canChangeInfo = settings.my_permissions?.can_change_info === true || isOwner;
  const canBanUsers = settings.my_permissions?.can_ban_users === true || isOwner;

  useEffect(() => {
    if (!snackbar) return;
    const t = window.setTimeout(() => setSnackbar(null), 2200);
    return () => window.clearTimeout(t);
  }, [snackbar]);

  useEffect(() => {
    if (view.kind === 'admin-edit' && editingMember) {
      setAdminDraft(adminPermsFromMember(editingMember));
    } else {
      setAdminDraft(null);
    }
  }, [view, editingMember?.user_id, editingMember?.role, editingMember?.admin_permissions]);

  const headerTitle = (() => {
    switch (view.kind) {
      case 'permissions':
        return 'Права участников';
      case 'admins':
        return 'Администраторы';
      case 'admin-edit':
        return 'Права администратора';
      case 'add-admin':
        return 'Добавить администратора';
      case 'members':
        return 'Участники';
      default:
        return 'Настройки группы';
    }
  })();

  const handleBack = () => {
    if (view.kind === 'root') {
      onBack();
      return;
    }
    if (view.kind === 'admin-edit' || view.kind === 'add-admin') {
      setView({ kind: 'admins' });
      return;
    }
    setView({ kind: 'root' });
  };

  const showError = (err: unknown, fallback: string) => {
    if (isMissingEndpoint(err)) {
      setSnackbar('API настроек пока недоступен');
      return;
    }
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : fallback;
    setSnackbar(message || fallback);
  };

  const patchSettings = (patch: Parameters<typeof updateSettings.mutate>[0]) => {
    if (settingsUnavailable) {
      setSnackbar('API настроек пока недоступен');
      return;
    }
    updateSettings.mutate(patch, {
      onError: (err) => showError(err, 'Не удалось сохранить'),
    });
  };

  const toggleMemberPerm = (key: keyof GroupMemberPermissions, next: boolean) => {
    patchSettings({ member_permissions: { [key]: next } });
  };

  const copyInvite = async () => {
    if (!inviteDisplay) {
      setSnackbar('Ссылка недоступна');
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteDisplay);
      setCopied(true);
      setSnackbar('Ссылка скопирована');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setSnackbar('Не удалось скопировать');
    }
  };

  const handleRevokeInvite = () => {
    if (!window.confirm('Отозвать текущую пригласительную ссылку?')) return;
    revokeInvite.mutate(undefined, {
      onSuccess: () => setSnackbar('Ссылка отозвана'),
      onError: (err) => showError(err, 'Не удалось отозвать ссылку'),
    });
  };

  const handleRegenerateInvite = () => {
    if (inviteDisplay && !window.confirm('Создать новую ссылку? Старая перестанет работать.')) {
      return;
    }
    regenerateInvite.mutate(undefined, {
      onSuccess: () => setSnackbar('Новая ссылка создана'),
      onError: (err) => showError(err, 'Не удалось создать ссылку'),
    });
  };

  const saveAdminDraft = () => {
    if (view.kind !== 'admin-edit' || !adminDraft || !editingMember) return;
    if (editingMember.role === 'owner') {
      setSnackbar('Права владельца нельзя изменить');
      return;
    }
    updateAdmin.mutate(
      { memberId: view.userId, payload: adminDraft },
      {
        onSuccess: () => {
          setSnackbar('Права сохранены');
          setView({ kind: 'admins' });
        },
        onError: (err) => showError(err, 'Не удалось сохранить права'),
      },
    );
  };

  const demoteAdmin = () => {
    if (view.kind !== 'admin-edit') return;
    if (!window.confirm('Снять администратора?')) return;
    updateAdmin.mutate(
      { memberId: view.userId, payload: { role: 'member' } },
      {
        onSuccess: () => {
          setSnackbar('Администратор снят');
          setView({ kind: 'admins' });
        },
        onError: (err) => showError(err, 'Не удалось снять администратора'),
      },
    );
  };

  const promoteMember = (userId: string) => {
    updateAdmin.mutate(
      { memberId: userId, payload: { role: 'admin', ...DEFAULT_ADMIN_PERMISSIONS } },
      {
        onSuccess: () => {
          setSnackbar('Администратор добавлен');
          setView({ kind: 'admin-edit', userId });
        },
        onError: (err) => showError(err, 'Не удалось назначить администратора'),
      },
    );
  };

  const kickMember = (member: MappedChatMember) => {
    const name = memberDisplayName(member);
    if (!window.confirm(`Исключить ${name} из группы?`)) return;
    removeMember.mutate(
      { chatId: chat.id, memberId: member.user_id },
      {
        onSuccess: () => setSnackbar(`${name} исключён(а)`),
        onError: (err) => showError(err, 'Не удалось исключить участника'),
      },
    );
  };

  const handleLeave = () => {
    if (!window.confirm('Покинуть группу?')) return;
    leaveGroup.mutate(chat.id, {
      onSuccess: () => onCloseSidebar(),
      onError: (err) => showError(err, 'Не удалось покинуть группу'),
    });
  };

  const handleDelete = () => {
    if (!window.confirm('Удалить группу для всех участников?')) return;
    deleteChat.mutate(
      { chatId: chat.id, scope: 'all' },
      {
        onSuccess: () => onCloseSidebar(),
        onError: (err) => showError(err, 'Не удалось удалить группу'),
      },
    );
  };

  const togglesDisabled =
    settingsUnavailable ||
    settingsBusy ||
    !canChangeInfo ||
    settingsQuery.isLoading;
  const inviteActionsDisabled =
    inviteUnavailable || !canManageInvite || revokeInvite.isPending || regenerateInvite.isPending;
  const adminEditDisabled = !canAddAdmins || updateAdmin.isPending;

  return (
    <div className="group-settings">
      <header className="chat-info-sidebar__header">
        <button
          type="button"
          className="chat-info-sidebar__close-btn"
          aria-label="Назад"
          onClick={handleBack}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="chat-info-sidebar__title">{headerTitle}</h2>
        {view.kind === 'admin-edit' && editingMember?.role !== 'owner' && canAddAdmins ? (
          <button
            type="button"
            className="chat-info-sidebar__edit-btn"
            aria-label="Сохранить"
            disabled={updateAdmin.isPending || !adminDraft}
            onClick={saveAdminDraft}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        ) : (
          <span className="chat-info-sidebar__edit-btn chat-info-sidebar__edit-btn--spacer" aria-hidden />
        )}
      </header>

      <div className="chat-info-sidebar__scroll-content group-settings__scroll">
        {settingsUnavailable ? (
          <p className="group-settings__banner" role="status">
            Серверные настройки ещё не подключены — интерфейс готов, изменения временно недоступны.
          </p>
        ) : null}

        {view.kind === 'root' ? (
          <>
            <section className="group-settings__section">
              <h3 className="group-settings__section-label">Тип группы</h3>
              <div className="group-settings__card">
                <div className="group-settings__invite-block">
                  <span className="group-settings__invite-label">Пригласительная ссылка</span>
                  <p className="group-settings__invite-value">
                    {inviteDisplay || 'Ссылка не создана'}
                  </p>
                  <div className="group-settings__invite-actions">
                    <button
                      type="button"
                      className="group-settings__text-btn"
                      disabled={!inviteDisplay}
                      onClick={() => void copyInvite()}
                    >
                      {copied ? 'Скопировано' : 'Копировать'}
                    </button>
                    <button
                      type="button"
                      className="group-settings__text-btn"
                      disabled={inviteActionsDisabled || !inviteDisplay}
                      onClick={handleRevokeInvite}
                    >
                      Отозвать
                    </button>
                    <button
                      type="button"
                      className="group-settings__text-btn"
                      disabled={inviteActionsDisabled}
                      onClick={handleRegenerateInvite}
                    >
                      Новая ссылка
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="group-settings__section">
              <div className="group-settings__card">
                <SettingsNavRow
                  title="Права участников"
                  subtitle="Что могут делать обычные участники"
                  onClick={() => setView({ kind: 'permissions' })}
                />
                <SettingsNavRow
                  title="Администраторы"
                  subtitle="Список и права администраторов"
                  value={String(adminList.length)}
                  onClick={() => setView({ kind: 'admins' })}
                />
                <SettingsNavRow
                  title="Участники"
                  subtitle="Исключить участников из группы"
                  value={String(members.length)}
                  onClick={() => setView({ kind: 'members' })}
                />
              </div>
            </section>

            <section className="group-settings__section">
              <h3 className="group-settings__section-label">Дополнительно</h3>
              <div className="group-settings__card">
                <SettingsToggleRow
                  id="hide-members"
                  title="Скрывать участников"
                  subtitle="Список участников виден только администраторам"
                  checked={settings.hide_members === true}
                  disabled={togglesDisabled}
                  onChange={(next) => patchSettings({ hide_members: next })}
                />
                <SettingsToggleRow
                  id="restrict-saving"
                  title="Запретить сохранение контента"
                  subtitle="Нельзя пересылать и скачивать"
                  checked={settings.restrict_saving_content === true}
                  disabled={togglesDisabled}
                  onChange={(next) => patchSettings({ restrict_saving_content: next })}
                />
              </div>
            </section>

            <section className="group-settings__section">
              <h3 className="group-settings__section-label">Опасная зона</h3>
              <div className="group-settings__card">
                {!isOwner ? (
                  <SettingsNavRow title="Покинуть группу" danger onClick={handleLeave} />
                ) : (
                  <SettingsNavRow
                    title="Удалить группу"
                    subtitle="Группа будет удалена для всех"
                    danger
                    onClick={handleDelete}
                  />
                )}
              </div>
            </section>
          </>
        ) : null}

        {view.kind === 'permissions' ? (
          <section className="group-settings__section">
            <div className="group-settings__card">
              {MEMBER_PERM_ROWS.map((row) => (
                <SettingsToggleRow
                  key={row.key}
                  id={`member-perm-${row.key}`}
                  title={row.title}
                  subtitle={row.subtitle}
                  checked={memberPerms[row.key] !== false}
                  disabled={togglesDisabled}
                  onChange={(next) => toggleMemberPerm(row.key, next)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {view.kind === 'admins' ? (
          <section className="group-settings__section">
            {canAddAdmins ? (
              <button
                type="button"
                className="group-settings__add-admin-btn"
                onClick={() => setView({ kind: 'add-admin' })}
              >
                Добавить администратора
              </button>
            ) : null}
            <div className="group-settings__card">
              {adminList.map((admin) => {
                const name = memberDisplayName(admin);
                return (
                  <button
                    key={admin.user_id}
                    type="button"
                    className="group-settings__person-row"
                    onClick={() => setView({ kind: 'admin-edit', userId: admin.user_id })}
                  >
                    <Avatar name={name} imageUrl={admin.user?.avatar_url} size={40} />
                    <span className="group-settings__person-text">
                      <span className="group-settings__person-name">{name}</span>
                      <span className="group-settings__person-meta">{roleLabel(admin.role)}</span>
                    </span>
                    <span className="group-settings__nav-chevron" aria-hidden>
                      ›
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {view.kind === 'add-admin' ? (
          <section className="group-settings__section">
            <div className="group-settings__card">
              {promoteCandidates.length === 0 ? (
                <p className="group-settings__empty">Нет участников для назначения</p>
              ) : (
                promoteCandidates.map((member) => {
                  const name = memberDisplayName(member);
                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      className="group-settings__person-row"
                      disabled={updateAdmin.isPending}
                      onClick={() => promoteMember(member.user_id)}
                    >
                      <Avatar name={name} imageUrl={member.user?.avatar_url} size={40} />
                      <span className="group-settings__person-text">
                        <span className="group-settings__person-name">{name}</span>
                        <span className="group-settings__person-meta">Назначить админом</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {view.kind === 'admin-edit' && editingMember && adminDraft ? (
          <section className="group-settings__section">
            <div className="group-settings__card group-settings__card--profile">
              <Avatar
                name={memberDisplayName(editingMember)}
                imageUrl={editingMember.user?.avatar_url}
                size={56}
              />
              <div>
                <div className="group-settings__person-name">
                  {memberDisplayName(editingMember)}
                </div>
                <div className="group-settings__person-meta">
                  {roleLabel(editingMember.role)}
                </div>
              </div>
            </div>
            <div className="group-settings__card">
              {ADMIN_PERM_ROWS.map((row) => (
                <SettingsToggleRow
                  key={row.key}
                  id={`admin-perm-${row.key}`}
                  title={row.title}
                  subtitle={row.subtitle}
                  checked={adminDraft[row.key] !== false}
                  disabled={
                    editingMember.role === 'owner' ||
                    adminEditDisabled ||
                    (!isOwner && row.key === 'can_add_admins')
                  }
                  onChange={(next) =>
                    setAdminDraft((prev) => (prev ? { ...prev, [row.key]: next } : prev))
                  }
                />
              ))}
            </div>
            {editingMember.role !== 'owner' && canAddAdmins ? (
              <button
                type="button"
                className="group-settings__danger-btn"
                disabled={updateAdmin.isPending}
                onClick={demoteAdmin}
              >
                Снять администратора
              </button>
            ) : null}
          </section>
        ) : null}

        {view.kind === 'members' ? (
          <section className="group-settings__section">
            <div className="group-settings__card">
              {members.map((member) => {
                const name = memberDisplayName(member);
                const canKick =
                  canBanUsers &&
                  member.user_id !== meId &&
                  member.role !== 'owner' &&
                  (member.role !== 'admin' || isOwner || canAddAdmins);
                return (
                  <div
                    key={member.user_id}
                    className="group-settings__person-row group-settings__person-row--static"
                  >
                    <Avatar name={name} imageUrl={member.user?.avatar_url} size={40} />
                    <span className="group-settings__person-text">
                      <span className="group-settings__person-name">{name}</span>
                      <span className="group-settings__person-meta">{roleLabel(member.role)}</span>
                    </span>
                    {canKick ? (
                      <button
                        type="button"
                        className="group-settings__kick-btn"
                        disabled={removeMember.isPending}
                        onClick={() => kickMember(member)}
                      >
                        Исключить
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      {snackbar ? (
        <div className="group-settings__snackbar" role="status">
          {snackbar}
        </div>
      ) : null}
    </div>
  );
}
