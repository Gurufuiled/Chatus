import { apiGet, apiPatch, apiPost } from './apiClient';

export type GroupMemberPermissions = {
  can_send_messages: boolean;
  can_send_media: boolean;
  can_add_users: boolean;
  can_pin_messages: boolean;
  can_change_info: boolean;
  can_create_polls: boolean;
};

export type EffectiveGroupPermissions = GroupMemberPermissions & {
  is_owner: boolean;
  is_admin: boolean;
  can_manage_invite_links: boolean;
  can_add_admins: boolean;
  can_ban_users: boolean;
};

export type GroupChatSettings = {
  chat_id: string;
  visibility: 'private' | 'public' | string;
  hide_members: boolean;
  restrict_saving_content: boolean;
  member_permissions: GroupMemberPermissions;
  invite_token?: string | null;
  my_permissions?: EffectiveGroupPermissions;
  my_role?: 'owner' | 'admin' | 'member' | string;
};

export type GroupInviteLink = {
  chat_id: string;
  invite_token: string | null;
  invite_link: string | null;
};

export const DEFAULT_GROUP_MEMBER_PERMISSIONS: GroupMemberPermissions = {
  can_send_messages: true,
  can_send_media: true,
  can_add_users: true,
  can_pin_messages: false,
  can_change_info: false,
  can_create_polls: true,
};

export type GroupSettingsPatch = Partial<{
  hide_members: boolean;
  restrict_saving_content: boolean;
  member_permissions: Partial<GroupMemberPermissions>;
}>;

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || fallback);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error('Сервер вернул некорректный ответ');
  }
}

export async function getGroupSettings(chatId: string): Promise<GroupChatSettings> {
  return readJson<GroupChatSettings>(
    await apiGet(`/chats/${encodeURIComponent(chatId)}/settings`),
    'Не удалось загрузить настройки группы',
  );
}

export async function updateGroupSettings(
  chatId: string,
  patch: GroupSettingsPatch,
): Promise<GroupChatSettings> {
  return readJson<GroupChatSettings>(
    await apiPatch(`/chats/${encodeURIComponent(chatId)}/settings`, patch),
    'Не удалось сохранить настройки группы',
  );
}

export async function getGroupInviteLink(chatId: string): Promise<GroupInviteLink> {
  return readJson<GroupInviteLink>(
    await apiGet(`/chats/${encodeURIComponent(chatId)}/invite-link`),
    'Не удалось загрузить пригласительную ссылку',
  );
}

export async function revokeGroupInviteLink(chatId: string): Promise<GroupInviteLink> {
  return readJson<GroupInviteLink>(
    await apiPost(`/chats/${encodeURIComponent(chatId)}/invite-link/revoke`, {}),
    'Не удалось отозвать пригласительную ссылку',
  );
}

export async function recreateGroupInviteLink(chatId: string): Promise<GroupInviteLink> {
  return readJson<GroupInviteLink>(
    await apiPost(`/chats/${encodeURIComponent(chatId)}/invite-link/recreate`, {}),
    'Не удалось создать пригласительную ссылку',
  );
}
