import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { mapChat, type MappedChat } from '../common/mappers';
import type { Prisma, User } from '@prisma/client';
import { ChatMemberRole, ChatType } from '@prisma/client';

const CHAT_INCLUDE = {
  lastMessage: true,
  members: { include: { user: true } },
} satisfies Prisma.ChatInclude;

const MEMBER_TAG_COLORS = new Set(['blue', 'green', 'orange', 'red']);

type ChatWithRelations = Prisma.ChatGetPayload<{ include: typeof CHAT_INCLUDE }>;

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

  private mapChatForUser(chat: ChatWithRelations, userId: string): MappedChat {
    return mapChat(chat, {
      includeLastMessage: true,
      includeMembers: true,
      currentUserId: userId,
    });
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

  private async getGroupChatForOwnerOrThrow(
    chatId: string,
    userId: string,
  ): Promise<ChatWithRelations> {
    const chat = await this.prisma.chat.findFirst({
      where: {
        id: chatId,
        chatType: ChatType.group,
        members: {
          some: {
            userId,
            role: ChatMemberRole.owner,
          },
        },
      },
      include: CHAT_INCLUDE,
    });

    if (!chat) {
      throw new ForbiddenException('Only the group owner can do this');
    }

    return chat;
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

    return chats.map((chat) =>
      mapChat(chat, {
        includeLastMessage: true,
        includeMembers,
        currentUserId: userId,
      }),
    );
  }

  async getChatById(chatId: string, userId: string): Promise<MappedChat> {
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

    const normalizedMemberIds = [...new Set(memberIds.filter((id) => id !== currentUser.id))];

    const chat = await this.prisma.chat.create({
      data: {
        chatType: ChatType.group,
        name: trimmedName,
        createdById: currentUser.id,
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
    const currentChat = await this.getGroupChatForOwnerOrThrow(
      chatId,
      currentUser.id,
    );

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

  async addGroupMembers(
    currentUser: User,
    chatId: string,
    memberIds: string[],
  ): Promise<MappedChat> {
    const chat = await this.getGroupChatForOwnerOrThrow(chatId, currentUser.id);

    const existingUserIds = new Set(chat.members.map((member) => member.userId));
    const requestedUserIds = [...new Set(memberIds)]
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id !== currentUser.id && !existingUserIds.has(id));

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
    await this.getGroupChatForOwnerOrThrow(chatId, currentUser.id);

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

    const updatedChat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
    return this.mapChatForUser(updatedChat, currentUser.id);
  }

  async removeGroupMember(
    currentUser: User,
    chatId: string,
    memberId: string,
  ): Promise<MappedChat> {
    await this.getGroupChatForOwnerOrThrow(chatId, currentUser.id);

    if (memberId === currentUser.id) {
      throw new BadRequestException('The owner cannot remove themselves');
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

    await this.prisma.chatMember.delete({
      where: {
        chatId_userId: {
          chatId,
          userId: memberId,
        },
      },
    });

    const updatedChat = await this.getGroupChatForUserOrThrow(chatId, currentUser.id);
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

    const groupChat = await this.getGroupChatForOwnerOrThrow(chatId, currentUser.id);
    const memberUserIds = groupChat.members.map((m) => m.userId);
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
  ): Promise<MappedChat> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      throw new BadRequestException('Not a member of this chat');
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

    const chat = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        pinnedMessageId: messageId,
      },
      include: CHAT_INCLUDE,
    });

    return this.mapChatForUser(chat, userId);
  }
}
