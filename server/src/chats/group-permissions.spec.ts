import { ChatMemberRole } from '@prisma/client';
import {
  DEFAULT_GROUP_MEMBER_PERMISSIONS,
  canSendMessageType,
  getEffectiveGroupPermissions,
  parseGroupAdminPermissions,
  parseGroupMemberPermissions,
  resolveGroupPermissionContext,
} from './group-permissions';

describe('group-permissions', () => {
  it('parses null member permissions as Telegram defaults', () => {
    expect(parseGroupMemberPermissions(null)).toEqual(
      DEFAULT_GROUP_MEMBER_PERMISSIONS,
    );
    expect(DEFAULT_GROUP_MEMBER_PERMISSIONS.can_pin_messages).toBe(false);
    expect(DEFAULT_GROUP_MEMBER_PERMISSIONS.can_change_info).toBe(false);
    expect(DEFAULT_GROUP_MEMBER_PERMISSIONS.can_create_polls).toBe(true);
  });

  it('gives owner full admin rights', () => {
    const ctx = resolveGroupPermissionContext(
      { role: ChatMemberRole.owner, adminPermissions: null },
      null,
    );
    const effective = getEffectiveGroupPermissions(ctx);
    expect(effective.is_owner).toBe(true);
    expect(effective.can_add_admins).toBe(true);
    expect(effective.can_pin_messages).toBe(true);
    expect(effective.can_restrict_saving_bypass).toBe(true);
  });

  it('uses stored admin permissions for admins', () => {
    const ctx = resolveGroupPermissionContext(
      {
        role: ChatMemberRole.admin,
        adminPermissions: {
          can_change_info: false,
          can_delete_messages: true,
          can_ban_users: false,
          can_invite_users: true,
          can_pin_messages: false,
          can_manage_invite_links: true,
          can_manage_video_chats: false,
          can_add_admins: false,
        },
      },
      null,
    );
    const effective = getEffectiveGroupPermissions(ctx);
    expect(effective.can_change_info).toBe(false);
    expect(effective.can_pin_messages).toBe(false);
    expect(effective.can_invite_users).toBe(true);
    expect(effective.can_manage_video_chats).toBe(false);
  });

  it('blocks media when can_send_media is false for members', () => {
    const ctx = resolveGroupPermissionContext(
      { role: ChatMemberRole.member, adminPermissions: null },
      { ...DEFAULT_GROUP_MEMBER_PERMISSIONS, can_send_media: false },
    );
    const effective = getEffectiveGroupPermissions(ctx);
    expect(canSendMessageType(effective, 'text')).toBe(true);
    expect(canSendMessageType(effective, 'image')).toBe(false);
  });

  it('parses partial admin permission JSON with defaults', () => {
    const perms = parseGroupAdminPermissions({ can_ban_users: false });
    expect(perms.can_ban_users).toBe(false);
    expect(perms.can_pin_messages).toBe(true);
  });

  it('member with can_change_info is not treated as admin', () => {
    const ctx = resolveGroupPermissionContext(
      { role: ChatMemberRole.member, adminPermissions: null },
      { ...DEFAULT_GROUP_MEMBER_PERMISSIONS, can_change_info: true },
    );
    const effective = getEffectiveGroupPermissions(ctx);
    expect(effective.is_admin).toBe(false);
    expect(effective.can_change_info).toBe(true);
    expect(effective.can_restrict_saving_bypass).toBe(false);
  });
});
