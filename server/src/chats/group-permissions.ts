import { ChatMemberRole, type ChatMember, type Prisma } from '@prisma/client';

/** Default member rights for a Telegram-like private group. */
export type GroupMemberPermissions = {
  can_send_messages: boolean;
  can_send_media: boolean;
  can_add_users: boolean;
  can_pin_messages: boolean;
  can_change_info: boolean;
  can_create_polls: boolean;
};

/** Per-admin rights. Owner always has all rights. */
export type GroupAdminPermissions = {
  can_change_info: boolean;
  can_delete_messages: boolean;
  can_ban_users: boolean;
  can_invite_users: boolean;
  can_pin_messages: boolean;
  can_manage_invite_links: boolean;
  can_manage_video_chats: boolean;
  can_add_admins: boolean;
};

export const DEFAULT_GROUP_MEMBER_PERMISSIONS: GroupMemberPermissions = {
  can_send_messages: true,
  can_send_media: true,
  can_add_users: true,
  can_pin_messages: false,
  can_change_info: false,
  can_create_polls: true,
};

export const FULL_GROUP_ADMIN_PERMISSIONS: GroupAdminPermissions = {
  can_change_info: true,
  can_delete_messages: true,
  can_ban_users: true,
  can_invite_users: true,
  can_pin_messages: true,
  can_manage_invite_links: true,
  can_manage_video_chats: true,
  can_add_admins: true,
};

/** Default when promoting an admin without explicit flags (Telegram-like). */
export const DEFAULT_GROUP_ADMIN_PERMISSIONS: GroupAdminPermissions = {
  can_change_info: true,
  can_delete_messages: true,
  can_ban_users: true,
  can_invite_users: true,
  can_pin_messages: true,
  can_manage_invite_links: true,
  can_manage_video_chats: true,
  can_add_admins: false,
};

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function parseGroupMemberPermissions(
  raw: Prisma.JsonValue | null | undefined,
): GroupMemberPermissions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_GROUP_MEMBER_PERMISSIONS };
  }
  const o = raw as Record<string, unknown>;
  return {
    can_send_messages: asBool(
      o.can_send_messages,
      DEFAULT_GROUP_MEMBER_PERMISSIONS.can_send_messages,
    ),
    can_send_media: asBool(
      o.can_send_media,
      DEFAULT_GROUP_MEMBER_PERMISSIONS.can_send_media,
    ),
    can_add_users: asBool(
      o.can_add_users,
      DEFAULT_GROUP_MEMBER_PERMISSIONS.can_add_users,
    ),
    can_pin_messages: asBool(
      o.can_pin_messages,
      DEFAULT_GROUP_MEMBER_PERMISSIONS.can_pin_messages,
    ),
    can_change_info: asBool(
      o.can_change_info,
      DEFAULT_GROUP_MEMBER_PERMISSIONS.can_change_info,
    ),
    can_create_polls: asBool(
      o.can_create_polls,
      DEFAULT_GROUP_MEMBER_PERMISSIONS.can_create_polls,
    ),
  };
}

export function parseGroupAdminPermissions(
  raw: Prisma.JsonValue | null | undefined,
): GroupAdminPermissions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_GROUP_ADMIN_PERMISSIONS };
  }
  const o = raw as Record<string, unknown>;
  return {
    can_change_info: asBool(
      o.can_change_info,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_change_info,
    ),
    can_delete_messages: asBool(
      o.can_delete_messages,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_delete_messages,
    ),
    can_ban_users: asBool(
      o.can_ban_users,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_ban_users,
    ),
    can_invite_users: asBool(
      o.can_invite_users,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_invite_users,
    ),
    can_pin_messages: asBool(
      o.can_pin_messages,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_pin_messages,
    ),
    can_manage_invite_links: asBool(
      o.can_manage_invite_links,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_manage_invite_links,
    ),
    can_manage_video_chats: asBool(
      o.can_manage_video_chats,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_manage_video_chats,
    ),
    can_add_admins: asBool(
      o.can_add_admins,
      DEFAULT_GROUP_ADMIN_PERMISSIONS.can_add_admins,
    ),
  };
}

export function serializeGroupMemberPermissions(
  permissions: GroupMemberPermissions,
): Prisma.InputJsonValue {
  return { ...permissions };
}

export function serializeGroupAdminPermissions(
  permissions: GroupAdminPermissions,
): Prisma.InputJsonValue {
  return { ...permissions };
}

export type GroupPermissionContext = {
  role: ChatMemberRole;
  memberPermissions: GroupMemberPermissions;
  adminPermissions: GroupAdminPermissions;
};

export function resolveGroupPermissionContext(
  member: Pick<ChatMember, 'role' | 'adminPermissions'>,
  chatMemberPermissions: Prisma.JsonValue | null | undefined,
): GroupPermissionContext {
  const memberPermissions = parseGroupMemberPermissions(chatMemberPermissions);
  if (member.role === ChatMemberRole.owner) {
    return {
      role: member.role,
      memberPermissions,
      adminPermissions: { ...FULL_GROUP_ADMIN_PERMISSIONS },
    };
  }
  if (member.role === ChatMemberRole.admin) {
    return {
      role: member.role,
      memberPermissions,
      adminPermissions: parseGroupAdminPermissions(member.adminPermissions),
    };
  }
  return {
    role: member.role,
    memberPermissions,
    adminPermissions: {
      can_change_info: false,
      can_delete_messages: false,
      can_ban_users: false,
      can_invite_users: false,
      can_pin_messages: false,
      can_manage_invite_links: false,
      can_manage_video_chats: false,
      can_add_admins: false,
    },
  };
}

export function isGroupPrivileged(role: ChatMemberRole): boolean {
  return role === ChatMemberRole.owner || role === ChatMemberRole.admin;
}

/** Effective rights for the current user (admins/owner bypass member defaults). */
export type EffectiveGroupPermissions = GroupMemberPermissions &
  GroupAdminPermissions & {
    is_owner: boolean;
    is_admin: boolean;
    can_restrict_saving_bypass: boolean;
  };

export function getEffectiveGroupPermissions(
  ctx: GroupPermissionContext,
): EffectiveGroupPermissions {
  const privileged = isGroupPrivileged(ctx.role);
  if (privileged) {
    return {
      can_send_messages: true,
      can_send_media: true,
      can_add_users: ctx.adminPermissions.can_invite_users,
      can_create_polls: true,
      can_pin_messages: ctx.adminPermissions.can_pin_messages,
      can_change_info: ctx.adminPermissions.can_change_info,
      can_delete_messages: ctx.adminPermissions.can_delete_messages,
      can_ban_users: ctx.adminPermissions.can_ban_users,
      can_invite_users: ctx.adminPermissions.can_invite_users,
      can_manage_invite_links: ctx.adminPermissions.can_manage_invite_links,
      can_manage_video_chats: ctx.adminPermissions.can_manage_video_chats,
      can_add_admins: ctx.adminPermissions.can_add_admins,
      is_owner: ctx.role === ChatMemberRole.owner,
      is_admin: true,
      can_restrict_saving_bypass: true,
    };
  }
  return {
    ...ctx.memberPermissions,
    can_delete_messages: false,
    can_ban_users: false,
    can_invite_users: ctx.memberPermissions.can_add_users,
    can_manage_invite_links: false,
    can_manage_video_chats: false,
    can_add_admins: false,
    is_owner: false,
    is_admin: false,
    can_restrict_saving_bypass: false,
  };
}

const MEDIA_MSG_TYPES = new Set([
  'image',
  'voice',
  'video',
  'video_note',
  'file',
]);

export function canSendMessageType(
  effective: EffectiveGroupPermissions,
  msgType: string,
): boolean {
  if (!effective.can_send_messages) return false;
  if (MEDIA_MSG_TYPES.has(msgType.toLowerCase())) {
    return effective.can_send_media;
  }
  return true;
}
