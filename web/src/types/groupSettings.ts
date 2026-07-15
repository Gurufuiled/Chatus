/** Mirrors server `GroupMemberPermissions` (group-permissions.ts). */
export interface GroupMemberPermissions {
  can_send_messages: boolean;
  can_send_media: boolean;
  can_add_users: boolean;
  can_pin_messages: boolean;
  can_change_info: boolean;
  can_create_polls: boolean;
}

/** Mirrors server `GroupAdminPermissions`. */
export interface GroupAdminPermissions {
  can_change_info: boolean;
  can_delete_messages: boolean;
  can_ban_users: boolean;
  can_invite_users: boolean;
  can_pin_messages: boolean;
  can_manage_invite_links: boolean;
  can_manage_video_chats: boolean;
  can_add_admins: boolean;
}

export interface EffectiveGroupPermissions
  extends GroupMemberPermissions,
    GroupAdminPermissions {
  is_owner: boolean;
  is_admin: boolean;
  can_restrict_saving_bypass: boolean;
}

/** GET /chats/:id/settings */
export interface GroupChatSettings {
  chat_id: string;
  visibility: 'private' | 'public' | string;
  hide_members: boolean;
  restrict_saving_content: boolean;
  member_permissions: GroupMemberPermissions;
  pinned_message_id?: string | null;
  pinned_notify?: boolean;
  invite_token?: string | null;
  public_join_supported?: boolean;
  my_permissions?: EffectiveGroupPermissions;
  my_role?: string;
}

export type GroupChatSettingsPatch = Partial<{
  member_permissions: Partial<GroupMemberPermissions>;
  hide_members: boolean;
  restrict_saving_content: boolean;
  visibility: 'private' | 'public';
}>;

export interface GroupInviteLinkResult {
  chat_id?: string;
  invite_token: string | null;
  invite_link: string | null;
}

/** Body for PATCH /chats/:id/members/:memberId/admin */
export type UpdateGroupAdminPayload = Partial<GroupAdminPermissions> & {
  role?: 'admin' | 'member';
  tag?: string;
  tag_color?: string;
};

export const DEFAULT_MEMBER_PERMISSIONS: GroupMemberPermissions = {
  can_send_messages: true,
  can_send_media: true,
  can_add_users: true,
  can_pin_messages: false,
  can_change_info: false,
  can_create_polls: true,
};

export const DEFAULT_ADMIN_PERMISSIONS: GroupAdminPermissions = {
  can_change_info: true,
  can_delete_messages: true,
  can_ban_users: true,
  can_invite_users: true,
  can_pin_messages: true,
  can_manage_invite_links: true,
  can_manage_video_chats: true,
  can_add_admins: false,
};

export function defaultGroupSettings(chatId: string): GroupChatSettings {
  return {
    chat_id: chatId,
    visibility: 'private',
    member_permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
    hide_members: false,
    restrict_saving_content: false,
    invite_token: null,
    public_join_supported: false,
  };
}
