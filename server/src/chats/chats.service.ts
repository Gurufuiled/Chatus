import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { mapChat, mapMessage, type MappedChat, type MappedMessage } from '../common/mappers';
import type { User } from '@prisma/client';
import {
  ChatMemberRole,
  ChatType,
  ChatVisibility,
  MessageStatus,
  MessageType,
  Prisma,
} from '@prisma/client';
import {
  DEFAULT_GROUP_ADMIN_PERMISSIONS,
  DEFAULT_GROUP_MEMBER_PERMISSIONS,
  getEffectiveGroupPermissions,
  isGroupPrivileged,
  parseGroupAdminPermissions,
  parseGroupMemberPermissions,
  resolveGroupPermissionContext,
  serializeGroupAdminPermissions,
  serializeGroupMemberPermissions,
  type EffectiveGroupPermissions,
  type GroupAdminPermissions,
  type GroupMemberPermissions,
} from './group-permissions';
import type { UpdateGroupSettingsDto } from './dto/update-group-settings.dto';
import type { UpdateGroupAdminDto } from './dto/update-group-admin.dto';
import type { CreatePollDto } from './dto/create-poll.dto';

const CHAT_INCLUDE = {
  lastMessage: true,
  members: { include: { user: true } },
} satisfies Prisma.ChatInclude;

const MEMBER_TAG_COLORS = new Set(['blue', 'green', 'orange', 'red']);

type ChatWithRelations = Prisma.ChatGetPayload<{ include: typeof CHAT_INCLUDE }>;

export type GroupSettingsResponse = {
  chat_id: string;
  visibility: string;
  hide_members: boolean;
  restrict_saving_content: boolean;
  member_permissions: GroupMemberPermissions;
  pinned_message_id: string | null;
  pinned_notify: boolean;
  invite_token: string | null;
  /** Public join-by-slug is not implemented for groups yet. */
  public_join_supported: false;
  my_permissions: EffectiveGroupPermissions;
  my_role: string;
};

export type InviteLinkResponse = {
  chat_id: string;
  invite_token: string | null;
  invite_link: string | null;
};

export type MappedPoll = {
  id: string;
  message_id: string;
  question: string;
  is_anonymous: boolean;
  allows_multiple: boolean;
  is_closed: boolean;
  total_votes: number;
  options: {
    id: string;
    text: string;
    index: number;
    vote_count: number;
    voted_by_me: boolean;
  }[];
  my_option_ids: string[];
};

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private notifyChatDeleted(
    chatId: string,
    memberUserIds: string[],
    deletedByUserId: string,
  ): void {
    const payload = JSON.stringify({
      type: 'chat_deleted',
      chat_id: chatId,
      deleted_by_user_id: deletedByUserId,
    });
    for (const userId of memberUserIds) {
      this.realtime.sendToUser(userId, payload);
    }
  }

  private buildInviteToken(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    return `${slug || 'group'}-${randomUUID().slice(0, 8)}`;
  }

  private inviteLinkFromToken(token: string | null): string | null {
    if (!token) return null;
    return `chatus://join/${token}`;
  }

  private mapChatForUser(chat: ChatWithRelations, userId: string): MappedChat {
    const mapped = mapChat(chat, {
      includeLastMessage: true,
      includeMembers: true,
      currentUserId: userId,
    });

    if (chat.chatType !== ChatType.group || !mapped.members) {
      return mapped;
    }

    const me = chat.members.find((m) => m.userId === userId);
    if (!me) return mapped;

    if (chat.hideMembers && !isGroupPrivileged(me.role)) {
      mapped.members = mapped.members.filter(
        (m) =>
          m.user_id === userId ||
          m.role === ChatMemberRole.owner ||
          m.role === ChatMemberRole.admin,
      );
      mapped.members_hidden = true;
    }

    const effective = getEffectiveGroupPermissions(
      resolveGroupPermissionContext(me, chat.memberPermissions),
    );

    mapped.hide_members = chat.hideMembers;
    mapped.restrict_saving_content = chat.restrictSavingContent;
    mapped.pinned_notify = chat.pinnedNotify;
    mapped.member_permissions = parseGroupMemberPermissions(chat.memberPermissions);
    mapped.my_permissions = effective;
    if (!effective.can_manage_invite_links) {
      mapped.invite_token = null;
    }

    return mapped;
  }

  private async getChatForUserOrThrow(
    chatId: string,
    userId: string,
  ): Promise<ChatWithRelations> {
    const chat = await this.prisma.chat.findFirst({
      where: {
        id: chatId,
        members: {
          some: { userId },
        },
      },
      include: CHAT_INCLUDE,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return chat;
  }

  private async getGroupChatForUserOrThrow(
    chatId: string,
    userId: string,
  ): Promise<ChatWithRelations> {
    const chat = await this.prisma.chat.findFirst({
      where: {
        id: chatId,
        chatType: ChatType.group,
        members: {
          some: { userId },
        },
      },
      include: CHAT_INCLUDE,
    });

    if (!chat) {
      throw new NotFoundException('Group chat not found');
    }

    return chat;
  }

  private getMembershipOrThrow(chat: ChatWithRelations, userId: string) {
    const membership = chat.members.find((m) => m.userId === userId);
    if (!membership) {
      throw new NotFoundException('Group membership not found');
    }
    return membership;
  }

  private getEffectiveForUser(
    chat: ChatWithRelations,
    userId: string,
  ): EffectiveGroupPermissions {
    const membership = this.getMembershipOrThrow(chat, userId);
    return getEffectiveGroupPermissions(
      resolveGroupPermissionContext(membership, chat.memberPermissions),
    );
  }

  private assertCan(
    effective: EffectiveGroupPermissions,
    key: keyof EffectiveGroupPermissions,
    message: string,
  ): void {
    if (!effective[key]) {
      throw new ForbiddenException(message);
    }
  }

  async getChatsForUser(
    userId: string,
    includeMembers = false,
  ): Promise<MappedChat[]> {
    const chats = await this.prisma.chat.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: CHAT_INCLUDE,
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    return chats.map((chat) => {
      if (!includeMembers) {
        return mapChat(chat, {
          includeLastMessage: true,
          includeMembers: false,
          currentUserId: userId,
        });
      }
      return this.mapChatForUser(chat, userId);
    });
  }

  async getChatById(chatId: string, userId: string): Promise<MappedChat> {
    const chat = await this.getChatForUserOrThrow(chatId, userId);
    return this.mapChatForUser(chat, userId);
  }

  /** Reset server-side unread counter for the current member (call when opening the chat). */
  async markChatRead(chatId: string, userId: string): Promise<MappedChat> {
    await this.getChatForUserOrThrow(chatId, userId);
    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { unreadCount: 0 },
    });
    const chat = await this.getChatForUserOrThrow(chatId, userId);
    return this.mapChatForUser(chat, userId);
  }

  async createOrFindChat(
    currentUser: User,
    chatType: 'private' | 'group',
    name?: string,
    memberIds: string[] = [],
  ): Promise<MappedChat> {
    const type = chatType === 'private' ? ChatType.private : ChatType.group;

    if (type === ChatType.private) {
      if (memberIds.length !== 1) {
        throw new BadRequestException(
          'Private chat requires exactly one other member',
        );
      }

      const otherUserId = memberIds[0];
      if (otherUserId === currentUser.id) {
        throw new BadRequestException(
          'Cannot create private chat with yourself',
        );
      }

      const existing = await this.prisma.chat.findFirst({
        where: {
          chatType: ChatType.private,
          AND: [
            { members: { some: { userId: currentUser.id } } },
            { members: { some: { userId: otherUserId } } },
          ],
        },
        include: CHAT_INCLUDE,
      });

      if (existing && existing.members.length === 2) {
        return this.mapChatForUser(existing, currentUser.id);
      }

      const chat = await this.prisma.chat.create({
        data: {
          chatType: ChatType.private,
          createdById: currentUser.id,
          members: {
            create: [
              { userId: currentUser.id, role: ChatMemberRole.owner },
              { userId: otherUserId, role: ChatMemberRole.member },
            ],
          },
        },
        include: CHAT_INCLUDE,
      });

      return this.mapChatForUser(chat, currentUser.id);
    }

    const trimmedName = name?.trim();
    if (!trimmedName) {
      throw new BadRequestException('Group chat requires a name');
    }

    const normalizedMemberIds = [
      ...new Set(memberIds.filter((id) => id !== currentUser.id)),
    ];

    const chat = await this.prisma.chat.create({
      data: {
        chatType: ChatType.group,
        name: trimmedName,
        createdById: currentUser.id,
        visibility: ChatVisibility.private,
        inviteToken: this.buildInviteToken(trimmedName),
        hideMembers: false,
        restrictSavingContent: false,
        memberPermissions: serializeGroupMemberPermissions(
          DEFAULT_GROUP_MEMBER_PERMISSIONS,
        ),
        pinnedNotify: true,
        members: {
          create: [
            { userId: currentUser.id, role: ChatMemberRole.owner },
            ...normalizedMemberIds.map((userId) => ({
              userId,
              role: ChatMemberRole.member,
            })),
          ],
        },
      },
      include: CHAT_INCLUDE,
    });

    return this.mapChatForUser(chat, currentUser.id);
  }

  async updateGroupChat(
    currentUser: User,
    chatId: string,
    data: {
      name?: string;
      description?: string;
      avatar_url?: string;
    },
  ): Promise<MappedChat> {
    const currentChat = await this.getGroupChatForUserOrThrow(
      chatId,
      currentUser.id,
    );
    const effective = this.getEffectiveForUser(currentChat, currentUser.id);
    this.assertCan(effective, 'can_change_info', 'No permission to change group info');

    const updateData: Prisma.ChatUpdateInput = {};

    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (!trimmedName) {
        throw new BadRequestException('Group name cannot be empty');
      }
      updateData.name = trimmedName;
    }

    if (data.description !== undefined) {
      updateData.description = data.description.trim() || null;
    }

    if (data.avatar_url !== undefined) {
      updateData.avatarUrl = data.avatar_url.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return this.mapChatForUser(currentChat, currentUser.id);
    }

    const updatedChat = await this.prisma.chat.update({
      where: { id: chatId },
      data: updateData,
      include: CHAT_INCLUDE,
    });

    return this.mapChatForUser(updatedChat, currentUser.id);
  }

  async getGroupSettings(
    currentUser: User,
    chatId: string,
  ): Promise<GroupSettingsResponse> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const membership = this.getMembershipOrThrow(chat, currentUser.id);
    const effective = getEffectiveGroupPermissions(
      resolveGroupPermissionContext(membership, chat.memberPermissions),
    );

    return {
      chat_id: chat.id,
      visibility: chat.visibility,
      hide_members: chat.hideMembers,
      restrict_saving_content: chat.restrictSavingContent,
      member_permissions: parseGroupMemberPermissions(chat.memberPermissions),
      pinned_message_id: chat.pinnedMessageId,
      pinned_notify: chat.pinnedNotify,
      invite_token: effective.can_manage_invite_links ? chat.inviteToken : null,
      public_join_supported: false,
      my_permissions: effective,
      my_role: membership.role,
    };
  }

  async updateGroupSettings(
    currentUser: User,
    chatId: string,
    dto: UpdateGroupSettingsDto,
  ): Promise<GroupSettingsResponse> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    if (!effective.is_admin) {
      throw new ForbiddenException('Only admins can change group settings');
    }
    this.assertCan(effective, 'can_change_info', 'No permission to change group settings');

    const updateData: Prisma.ChatUpdateInput = {};

    if (dto.hide_members !== undefined) {
      updateData.hideMembers = dto.hide_members;
    }
    if (dto.restrict_saving_content !== undefined) {
      updateData.restrictSavingContent = dto.restrict_saving_content;
    }
    if (dto.visibility !== undefined) {
      updateData.visibility =
        dto.visibility === 'public' ? ChatVisibility.public : ChatVisibility.private;
    }
    if (dto.member_permissions !== undefined) {
      const current = parseGroupMemberPermissions(chat.memberPermissions);
      const next: GroupMemberPermissions = {
        can_send_messages:
          dto.member_permissions.can_send_messages ?? current.can_send_messages,
        can_send_media:
          dto.member_permissions.can_send_media ?? current.can_send_media,
        can_add_users:
          dto.member_permissions.can_add_users ?? current.can_add_users,
        can_pin_messages:
          dto.member_permissions.can_pin_messages ?? current.can_pin_messages,
        can_change_info:
          dto.member_permissions.can_change_info ?? current.can_change_info,
        can_create_polls:
          dto.member_permissions.can_create_polls ?? current.can_create_polls,
      };
      updateData.memberPermissions = serializeGroupMemberPermissions(next);
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.chat.update({
        where: { id: chatId },
        data: updateData,
      });
    }

    return this.getGroupSettings(currentUser, chatId);
  }

  async getInviteLink(
    currentUser: User,
    chatId: string,
  ): Promise<InviteLinkResponse> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    this.assertCan(
      effective,
      'can_manage_invite_links',
      'No permission to manage invite links',
    );

    return {
      chat_id: chat.id,
      invite_token: chat.inviteToken,
      invite_link: this.inviteLinkFromToken(chat.inviteToken),
    };
  }

  async revokeInviteLink(
    currentUser: User,
    chatId: string,
  ): Promise<InviteLinkResponse> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    this.assertCan(
      effective,
      'can_manage_invite_links',
      'No permission to manage invite links',
    );

    await this.prisma.chat.update({
      where: { id: chatId },
      data: { inviteToken: null },
    });

    return {
      chat_id: chatId,
      invite_token: null,
      invite_link: null,
    };
  }

  async recreateInviteLink(
    currentUser: User,
    chatId: string,
  ): Promise<InviteLinkResponse> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    this.assertCan(
      effective,
      'can_manage_invite_links',
      'No permission to manage invite links',
    );

    const token = this.buildInviteToken(chat.name ?? 'group');
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { inviteToken: token },
    });

    return {
      chat_id: chatId,
      invite_token: token,
      invite_link: this.inviteLinkFromToken(token),
    };
  }

  async resolveInviteToken(token: string): Promise<{
    chat_id: string;
    name: string | null;
    avatar_url: string | null;
    member_count: number;
  }> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new BadRequestException('invite_token is required');
    }

    const chat = await this.prisma.chat.findFirst({
      where: {
        chatType: ChatType.group,
        inviteToken: trimmed,
      },
      include: {
        _count: { select: { members: true } },
      },
    });

    if (!chat) {
      throw new NotFoundException('Invite link is invalid or revoked');
    }

    return {
      chat_id: chat.id,
      name: chat.name,
      avatar_url: chat.avatarUrl,
      member_count: chat._count.members,
    };
  }

  async joinGroupByInvite(
    currentUser: User,
    inviteToken: string,
  ): Promise<MappedChat> {
    const trimmed = inviteToken.trim();
    if (!trimmed) {
      throw new BadRequestException('invite_token is required');
    }

    const chat = await this.prisma.chat.findFirst({
      where: {
        chatType: ChatType.group,
        inviteToken: trimmed,
      },
      include: CHAT_INCLUDE,
    });

    if (!chat) {
      throw new NotFoundException('Invite link is invalid or revoked');
    }

    const already = chat.members.some((m) => m.userId === currentUser.id);
    if (already) {
      return this.mapChatForUser(chat, currentUser.id);
    }

    const updated = await this.prisma.chat.update({
      where: { id: chat.id },
      data: {
        members: {
          create: {
            userId: currentUser.id,
            role: ChatMemberRole.member,
          },
        },
      },
      include: CHAT_INCLUDE,
    });

    return this.mapChatForUser(updated, currentUser.id);
  }

  async addGroupMembers(
    currentUser: User,
    chatId: string,
    memberIds: string[],
  ): Promise<MappedChat> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    if (!effective.can_add_users && !effective.can_invite_users) {
      throw new ForbiddenException('No permission to add members');
    }

    const existingUserIds = new Set(chat.members.map((member) => member.userId));
    const requestedUserIds = [...new Set(memberIds)]
      .map((id) => id.trim())
      .filter(
        (id) =>
          id.length > 0 && id !== currentUser.id && !existingUserIds.has(id),
      );

    if (requestedUserIds.length === 0) {
      return this.mapChatForUser(chat, currentUser.id);
    }

    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: requestedUserIds } },
      select: { id: true },
    });

    const validUserIds = existingUsers.map((user) => user.id);
    if (validUserIds.length === 0) {
      throw new BadRequestException('No valid users to add');
    }

    const updatedChat = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        members: {
          create: validUserIds.map((userId) => ({
            userId,
            role: ChatMemberRole.member,
          })),
        },
      },
      include: CHAT_INCLUDE,
    });

    return this.mapChatForUser(updatedChat, currentUser.id);
  }

  async updateGroupMember(
    currentUser: User,
    chatId: string,
    memberId: string,
    data: { tag?: string; tag_color?: string },
  ): Promise<MappedChat> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    if (!effective.is_owner && !effective.is_admin) {
      throw new ForbiddenException('Only admins can update member tags');
    }

    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: memberId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Group member not found');
    }

    const updateData: Prisma.ChatMemberUpdateInput = {};

    const nextTag =
      data.tag !== undefined ? data.tag.trim() || null : undefined;
    const nextTagColor =
      data.tag_color == null
        ? data.tag_color === null
          ? null
          : undefined
        : data.tag_color.trim().toLowerCase();

    if (nextTag !== undefined) {
      updateData.tag = nextTag;

      if (nextTag == null) {
        updateData.tagColor = null;
      } else if (nextTagColor !== undefined && nextTagColor !== null) {
        if (!MEMBER_TAG_COLORS.has(nextTagColor)) {
          throw new BadRequestException('Unsupported tag color');
        }
        updateData.tagColor = nextTagColor;
      } else {
        updateData.tagColor = membership.tagColor ?? 'blue';
      }
    } else if (nextTagColor !== undefined && nextTagColor !== null) {
      if (!membership.tag?.trim()) {
        throw new BadRequestException('Cannot set tag color without a tag');
      }
      if (!MEMBER_TAG_COLORS.has(nextTagColor)) {
        throw new BadRequestException('Unsupported tag color');
      }
      updateData.tagColor = nextTagColor;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.chatMember.update({
        where: {
          chatId_userId: {
            chatId,
            userId: memberId,
          },
        },
        data: updateData,
      });
    }

    const updatedChat = await this.getGroupChatForUserOrThrow(
      chatId,
      currentUser.id,
    );
    return this.mapChatForUser(updatedChat, currentUser.id);
  }

  private clampAdminPermissions(
    requested: GroupAdminPermissions,
    actor: EffectiveGroupPermissions,
  ): GroupAdminPermissions {
    if (actor.is_owner) {
      return requested;
    }
    return {
      can_change_info: requested.can_change_info && actor.can_change_info,
      can_delete_messages:
        requested.can_delete_messages && actor.can_delete_messages,
      can_ban_users: requested.can_ban_users && actor.can_ban_users,
      can_invite_users: requested.can_invite_users && actor.can_invite_users,
      can_pin_messages: requested.can_pin_messages && actor.can_pin_messages,
      can_manage_invite_links:
        requested.can_manage_invite_links && actor.can_manage_invite_links,
      can_manage_video_chats:
        requested.can_manage_video_chats && actor.can_manage_video_chats,
      can_add_admins: false,
    };
  }

  async updateGroupAdmin(
    currentUser: User,
    chatId: string,
    memberId: string,
    dto: UpdateGroupAdminDto,
  ): Promise<MappedChat> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const actor = this.getMembershipOrThrow(chat, currentUser.id);
    const actorEffective = getEffectiveGroupPermissions(
      resolveGroupPermissionContext(actor, chat.memberPermissions),
    );

    const target = chat.members.find((m) => m.userId === memberId);
    if (!target) {
      throw new NotFoundException('Group member not found');
    }
    if (target.role === ChatMemberRole.owner) {
      throw new ForbiddenException('Cannot change the group owner');
    }

    const nextRole = dto.role;
    const updateData: Prisma.ChatMemberUpdateInput = {};

    if (nextRole === 'admin') {
      if (!actorEffective.can_add_admins && actor.role !== ChatMemberRole.owner) {
        throw new ForbiddenException('No permission to add admins');
      }
      updateData.role = ChatMemberRole.admin;
      const requested: GroupAdminPermissions = {
        can_change_info:
          dto.can_change_info ?? DEFAULT_GROUP_ADMIN_PERMISSIONS.can_change_info,
        can_delete_messages:
          dto.can_delete_messages ??
          DEFAULT_GROUP_ADMIN_PERMISSIONS.can_delete_messages,
        can_ban_users:
          dto.can_ban_users ?? DEFAULT_GROUP_ADMIN_PERMISSIONS.can_ban_users,
        can_invite_users:
          dto.can_invite_users ??
          DEFAULT_GROUP_ADMIN_PERMISSIONS.can_invite_users,
        can_pin_messages:
          dto.can_pin_messages ??
          DEFAULT_GROUP_ADMIN_PERMISSIONS.can_pin_messages,
        can_manage_invite_links:
          dto.can_manage_invite_links ??
          DEFAULT_GROUP_ADMIN_PERMISSIONS.can_manage_invite_links,
        can_manage_video_chats:
          dto.can_manage_video_chats ??
          DEFAULT_GROUP_ADMIN_PERMISSIONS.can_manage_video_chats,
        can_add_admins:
          actor.role === ChatMemberRole.owner
            ? (dto.can_add_admins ?? false)
            : false,
      };
      updateData.adminPermissions = serializeGroupAdminPermissions(
        this.clampAdminPermissions(requested, actorEffective),
      );
    } else if (nextRole === 'member') {
      if (actor.role !== ChatMemberRole.owner && !actorEffective.can_add_admins) {
        throw new ForbiddenException('No permission to demote admins');
      }
      updateData.role = ChatMemberRole.member;
      updateData.adminPermissions = Prisma.DbNull;
    } else if (target.role === ChatMemberRole.admin) {
      if (actor.role !== ChatMemberRole.owner && !actorEffective.can_add_admins) {
        throw new ForbiddenException('No permission to edit admin permissions');
      }
      const current = parseGroupAdminPermissions(target.adminPermissions);
      const requested: GroupAdminPermissions = {
        can_change_info: dto.can_change_info ?? current.can_change_info,
        can_delete_messages:
          dto.can_delete_messages ?? current.can_delete_messages,
        can_ban_users: dto.can_ban_users ?? current.can_ban_users,
        can_invite_users: dto.can_invite_users ?? current.can_invite_users,
        can_pin_messages: dto.can_pin_messages ?? current.can_pin_messages,
        can_manage_invite_links:
          dto.can_manage_invite_links ?? current.can_manage_invite_links,
        can_manage_video_chats:
          dto.can_manage_video_chats ?? current.can_manage_video_chats,
        can_add_admins:
          actor.role === ChatMemberRole.owner
            ? (dto.can_add_admins ?? current.can_add_admins)
            : current.can_add_admins,
      };
      updateData.adminPermissions = serializeGroupAdminPermissions(
        this.clampAdminPermissions(requested, actorEffective),
      );
    } else {
      throw new BadRequestException(
        'Provide role=admin to promote, or edit an existing admin',
      );
    }

    if (dto.tag !== undefined || dto.tag_color !== undefined) {
      await this.updateGroupMember(currentUser, chatId, memberId, {
        tag: dto.tag,
        tag_color: dto.tag_color,
      });
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.chatMember.update({
        where: {
          chatId_userId: { chatId, userId: memberId },
        },
        data: updateData,
      });
    }

    const updatedChat = await this.getGroupChatForUserOrThrow(
      chatId,
      currentUser.id,
    );
    return this.mapChatForUser(updatedChat, currentUser.id);
  }

  async removeGroupMember(
    currentUser: User,
    chatId: string,
    memberId: string,
  ): Promise<MappedChat> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    this.assertCan(effective, 'can_ban_users', 'No permission to remove members');

    if (memberId === currentUser.id) {
      throw new BadRequestException('Use leave to exit the group');
    }

    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: memberId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Group member not found');
    }

    if (membership.role === ChatMemberRole.owner) {
      throw new ForbiddenException('Cannot remove the group owner');
    }

    if (
      membership.role === ChatMemberRole.admin &&
      !effective.is_owner &&
      !effective.can_add_admins
    ) {
      throw new ForbiddenException('No permission to remove admins');
    }

    await this.prisma.chatMember.delete({
      where: {
        chatId_userId: {
          chatId,
          userId: memberId,
        },
      },
    });

    const updatedChat = await this.getGroupChatForUserOrThrow(
      chatId,
      currentUser.id,
    );
    return this.mapChatForUser(updatedChat, currentUser.id);
  }

  async leaveGroup(currentUser: User, chatId: string): Promise<{ ok: true }> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const currentMembership = chat.members.find(
      (member) => member.userId === currentUser.id,
    );

    if (!currentMembership) {
      throw new NotFoundException('Group membership not found');
    }

    if (currentMembership.role === ChatMemberRole.owner) {
      throw new ForbiddenException(
        'The owner must delete the group instead of leaving it',
      );
    }

    await this.prisma.chatMember.delete({
      where: {
        chatId_userId: {
          chatId,
          userId: currentUser.id,
        },
      },
    });

    return { ok: true };
  }

  /**
   * Deletes a private 1:1 chat for both participants, or deletes a group if the caller is the owner.
   */
  async deleteChat(currentUser: User, chatId: string): Promise<{ ok: true }> {
    const chat = await this.getChatForUserOrThrow(chatId, currentUser.id);

    if (chat.chatType === ChatType.private) {
      if (chat.members.length !== 2) {
        throw new BadRequestException('Invalid private chat');
      }
      const memberUserIds = chat.members.map((m) => m.userId);
      await this.prisma.chat.delete({
        where: { id: chatId },
      });
      this.notifyChatDeleted(chatId, memberUserIds, currentUser.id);
      return { ok: true };
    }

    const membership = chat.members.find((m) => m.userId === currentUser.id);
    if (!membership || membership.role !== ChatMemberRole.owner) {
      throw new ForbiddenException('Only the group owner can delete the group');
    }

    const memberUserIds = chat.members.map((m) => m.userId);
    await this.prisma.chat.delete({
      where: { id: chatId },
    });
    this.notifyChatDeleted(chatId, memberUserIds, currentUser.id);
    return { ok: true };
  }

  async setPinnedMessage(
    chatId: string,
    userId: string,
    messageId: string | null,
    notify = true,
  ): Promise<MappedChat> {
    const chat = await this.prisma.chat.findFirst({
      where: {
        id: chatId,
        members: { some: { userId } },
      },
      include: CHAT_INCLUDE,
    });
    if (!chat) {
      throw new BadRequestException('Not a member of this chat');
    }

    const membership = chat.members.find((m) => m.userId === userId);
    if (!membership) {
      throw new BadRequestException('Not a member of this chat');
    }

    if (chat.chatType === ChatType.group) {
      const effective = getEffectiveGroupPermissions(
        resolveGroupPermissionContext(membership, chat.memberPermissions),
      );
      this.assertCan(
        effective,
        'can_pin_messages',
        'No permission to pin messages',
      );
    }

    if (messageId) {
      const message = await this.prisma.message.findFirst({
        where: { id: messageId, chatId, isDeleted: false },
        select: { id: true },
      });
      if (!message) {
        throw new BadRequestException('Message not found in this chat');
      }
    }

    const updated = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        pinnedMessageId: messageId,
        pinnedNotify: messageId ? notify : chat.pinnedNotify,
      },
      include: CHAT_INCLUDE,
    });

    return this.mapChatForUser(updated, userId);
  }

  async createPoll(
    currentUser: User,
    chatId: string,
    dto: CreatePollDto,
  ): Promise<{ message: MappedMessage; poll: MappedPoll }> {
    const chat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    const effective = this.getEffectiveForUser(chat, currentUser.id);
    this.assertCan(effective, 'can_send_messages', 'No permission to send messages');
    this.assertCan(effective, 'can_create_polls', 'No permission to create polls');

    const options = dto.options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (options.length < 2) {
      throw new BadRequestException('Poll requires at least 2 options');
    }

    const question = dto.question.trim();
    const messageId = randomUUID();
    const pollId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          id: messageId,
          chatId,
          senderId: currentUser.id,
          msgType: MessageType.poll,
          content: question,
          status: MessageStatus.sent,
        },
      });

      await tx.poll.create({
        data: {
          id: pollId,
          messageId,
          question,
          isAnonymous: dto.is_anonymous !== false,
          allowsMultiple: dto.allows_multiple === true,
          options: {
            create: options.map((text, index) => ({
              id: randomUUID(),
              text,
              index,
            })),
          },
        },
      });

      await tx.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: messageId,
          lastMessageAt: new Date(),
          lastMessagePreview: `📊 ${question}`,
        },
      });

      await tx.chatMember.updateMany({
        where: {
          chatId,
          userId: { not: currentUser.id },
        },
        data: { unreadCount: { increment: 1 } },
      });
    });

    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
    });
    const poll = await this.getPollForUser(chatId, currentUser.id, messageId);
    const publicPoll = this.toPublicPoll(poll);

    await this.realtime.broadcastToChatMembers(chatId, {
      type: 'message',
      message: {
        ...mapMessage(message),
        poll: publicPoll,
      },
    });

    return { message: mapMessage(message), poll };
  }

  async votePoll(
    currentUser: User,
    chatId: string,
    messageId: string,
    optionIds: string[],
  ): Promise<MappedPoll> {
    await this.getGroupChatForUserOrThrow(chatId, currentUser.id);

    const poll = await this.prisma.poll.findFirst({
      where: {
        messageId,
        message: { chatId },
      },
      include: { options: true, votes: true },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    if (poll.isClosed) {
      throw new BadRequestException('Poll is closed');
    }

    const validOptionIds = new Set(poll.options.map((o) => o.id));
    const uniqueOptionIds = [...new Set(optionIds)];
    if (uniqueOptionIds.some((id) => !validOptionIds.has(id))) {
      throw new BadRequestException('Invalid poll option');
    }
    if (!poll.allowsMultiple && uniqueOptionIds.length !== 1) {
      throw new BadRequestException('This poll allows only one option');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pollVote.deleteMany({
        where: { pollId: poll.id, userId: currentUser.id },
      });
      await tx.pollVote.createMany({
        data: uniqueOptionIds.map((optionId) => ({
          id: randomUUID(),
          pollId: poll.id,
          optionId,
          userId: currentUser.id,
        })),
      });
    });

    const mapped = await this.getPollForUser(chatId, currentUser.id, messageId);
    await this.realtime.broadcastToChatMembers(chatId, {
      type: 'poll_updated',
      chat_id: chatId,
      message_id: messageId,
      poll: this.toPublicPoll(mapped),
    });
    return mapped;
  }

  /** Viewer-neutral poll payload for broadcasts (no personal vote state). */
  private toPublicPoll(poll: MappedPoll): Omit<MappedPoll, 'my_option_ids'> & {
    my_option_ids: [];
    options: Array<MappedPoll['options'][number] & { voted_by_me: false }>;
  } {
    return {
      ...poll,
      my_option_ids: [],
      options: poll.options.map((opt) => ({
        ...opt,
        voted_by_me: false,
      })),
    };
  }

  async getPollForUser(
    chatId: string,
    userId: string,
    messageId: string,
  ): Promise<MappedPoll> {
    await this.getGroupChatForUserOrThrow(chatId, userId);

    const poll = await this.prisma.poll.findFirst({
      where: {
        messageId,
        message: { chatId },
      },
      include: {
        options: { orderBy: { index: 'asc' } },
        votes: true,
      },
    });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    const myVotes = poll.votes.filter((v) => v.userId === userId);
    const myOptionIds = myVotes.map((v) => v.optionId);
    const countByOption = new Map<string, number>();
    const uniqueVoters = new Set<string>();
    for (const vote of poll.votes) {
      countByOption.set(vote.optionId, (countByOption.get(vote.optionId) ?? 0) + 1);
      uniqueVoters.add(vote.userId);
    }

    return {
      id: poll.id,
      message_id: poll.messageId,
      question: poll.question,
      is_anonymous: poll.isAnonymous,
      allows_multiple: poll.allowsMultiple,
      is_closed: poll.isClosed,
      total_votes: uniqueVoters.size,
      options: poll.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
        index: opt.index,
        vote_count: countByOption.get(opt.id) ?? 0,
        voted_by_me: myOptionIds.includes(opt.id),
      })),
      my_option_ids: myOptionIds,
    };
  }

  /**
   * Used by MessagesService / GroupCalls to enforce group permissions without circular DI.
   */
  async getGroupEffectivePermissions(
    chatId: string,
    userId: string,
  ): Promise<{
    chatType: ChatType;
    restrictSavingContent: boolean;
    effective: EffectiveGroupPermissions | null;
  }> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        chatType: true,
        restrictSavingContent: true,
        memberPermissions: true,
        members: {
          where: { userId },
          select: { role: true, adminPermissions: true },
        },
      },
    });
    if (!chat || chat.members.length === 0) {
      throw new ForbiddenException('Not a member of this chat');
    }
    if (chat.chatType !== ChatType.group) {
      return {
        chatType: chat.chatType,
        restrictSavingContent: false,
        effective: null,
      };
    }
    return {
      chatType: chat.chatType,
      restrictSavingContent: chat.restrictSavingContent,
      effective: getEffectiveGroupPermissions(
        resolveGroupPermissionContext(chat.members[0], chat.memberPermissions),
      ),
    };
  }

  async assertCanForwardFromChat(
    sourceChatId: string,
    userId: string,
  ): Promise<void> {
    const info = await this.getGroupEffectivePermissions(sourceChatId, userId);
    if (
      info.chatType === ChatType.group &&
      info.restrictSavingContent &&
      info.effective &&
      !info.effective.can_restrict_saving_bypass
    ) {
      throw new ForbiddenException(
        'Forwarding is restricted in this group',
      );
    }
  }

  async assertCanStartGroupCall(chatId: string, userId: string): Promise<void> {
    const info = await this.getGroupEffectivePermissions(chatId, userId);
    if (info.chatType !== ChatType.group || !info.effective) {
      return;
    }
    // Owner always; members may start; admins need can_manage_video_chats.
    if (info.effective.is_owner) {
      return;
    }
    if (info.effective.is_admin) {
      this.assertCan(
        info.effective,
        'can_manage_video_chats',
        'No permission to manage group calls',
      );
    }
  }

  /** Admins with manage_video_chats (or owner) may end any call; otherwise only the starter. */
  async assertCanEndGroupCall(
    chatId: string,
    userId: string,
    startedByUserId: string,
  ): Promise<void> {
    if (userId === startedByUserId) {
      return;
    }
    const info = await this.getGroupEffectivePermissions(chatId, userId);
    if (info.chatType !== ChatType.group || !info.effective) {
      throw new ForbiddenException('Only the call starter can end this call');
    }
    if (info.effective.is_owner || info.effective.can_manage_video_chats) {
      return;
    }
    throw new ForbiddenException('No permission to end this group call');
  }
}
