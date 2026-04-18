import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatAccessType,
  ChatMemberRole,
  ChatType,
  ChatVisibility,
  Prisma,
  SubscriptionStatus,
  Transport,
} from '@prisma/client';
import { mapChat, mapMessage } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  MessagesService,
  type CreateMessageMedia,
  type CreateMessageMediaInput,
} from '../messages/messages.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateChannelPostDto } from './dto/create-channel-post.dto';
import { CreateDiscussionMessageDto } from './dto/create-discussion-message.dto';
import { GetChannelMembersQueryDto } from './dto/get-channel-members-query.dto';
import { UpdateChannelMemberDto } from './dto/update-channel-member.dto';
import { SubscribeChannelDto } from './dto/subscribe-channel.dto';

const CHANNEL_INCLUDE = {
  lastMessage: true,
  members: {
    include: {
      user: true,
    },
  },
} satisfies Prisma.ChatInclude;

type ChannelWithRelations = Prisma.ChatGetPayload<{ include: typeof CHANNEL_INCLUDE }>;
type PrismaLike = Prisma.TransactionClient | PrismaService;
type ChannelPermissions = {
  can_post: boolean;
  can_manage_admins: boolean;
  can_edit_channel: boolean;
  can_moderate_subscribers: boolean;
  can_edit_channel_avatar: boolean;
  can_edit_channel_name: boolean;
  can_edit_channel_description: boolean;
  can_add_admins: boolean;
  can_remove_admins: boolean;
  can_edit_admin_permissions: boolean;
};

const FULL_CHANNEL_PERMISSIONS: ChannelPermissions = {
  can_post: true,
  can_manage_admins: true,
  can_edit_channel: true,
  can_moderate_subscribers: true,
  can_edit_channel_avatar: true,
  can_edit_channel_name: true,
  can_edit_channel_description: true,
  can_add_admins: true,
  can_remove_admins: true,
  can_edit_admin_permissions: true,
};

const MEMBER_CHANNEL_PERMISSIONS: ChannelPermissions = {
  can_post: false,
  can_manage_admins: false,
  can_edit_channel: false,
  can_moderate_subscribers: false,
  can_edit_channel_avatar: false,
  can_edit_channel_name: false,
  can_edit_channel_description: false,
  can_add_admins: false,
  can_remove_admins: false,
  can_edit_admin_permissions: false,
};

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesService: MessagesService,
    private readonly realtimeService: RealtimeService,
  ) {}

  private mapChannelForUser(channel: ChannelWithRelations, userId: string) {
    return mapChat(channel, {
      includeMembers: true,
      includeLastMessage: true,
      currentUserId: userId,
    });
  }

  private sanitizeMedia(media?: unknown): CreateMessageMediaInput | undefined {
    if (!media) {
      return undefined;
    }
    if (Array.isArray(media)) {
      return media as CreateMessageMedia[];
    }
    if (typeof media === 'object') {
      return media as CreateMessageMedia;
    }
    return undefined;
  }

  private async refreshChannelCounts(channelId: string, tx: PrismaLike) {
    const subscriberCount = await tx.chatMember.count({
      where: { chatId: channelId },
    });
    const activeSubscriberCount = await tx.chatMember.count({
      where: {
        chatId: channelId,
        OR: [
          { role: ChatMemberRole.owner },
          { role: ChatMemberRole.admin },
          { accessStatus: SubscriptionStatus.active },
        ],
      },
    });

    await tx.chat.update({
      where: { id: channelId },
      data: {
        subscriberCount,
        activeSubscriberCount,
      },
    });
  }

  private buildInviteToken(name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    return `${slug || 'channel'}-${randomUUID().slice(0, 8)}`;
  }

  private parseChannelPermissions(member: ChannelWithRelations['members'][number] | null): ChannelPermissions {
    if (!member) return { ...MEMBER_CHANNEL_PERMISSIONS };
    if (member.role === ChatMemberRole.owner) return { ...FULL_CHANNEL_PERMISSIONS };
    if (member.role !== ChatMemberRole.admin) return { ...MEMBER_CHANNEL_PERMISSIONS };

    const raw = (member.tag ?? '').trim();
    if (!raw) {
      return { ...FULL_CHANNEL_PERMISSIONS };
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ChannelPermissions> | null;
      if (!parsed || typeof parsed !== 'object') {
        return { ...FULL_CHANNEL_PERMISSIONS };
      }
      const canEditChannelAvatar =
        parsed.can_edit_channel_avatar ?? (parsed.can_edit_channel !== false);
      const canEditChannelName =
        parsed.can_edit_channel_name ?? (parsed.can_edit_channel !== false);
      const canEditChannelDescription =
        parsed.can_edit_channel_description ?? (parsed.can_edit_channel !== false);

      const canAddAdmins =
        parsed.can_add_admins ?? (parsed.can_manage_admins !== false);
      const canRemoveAdmins =
        parsed.can_remove_admins ?? (parsed.can_manage_admins !== false);
      const canEditAdminPermissions =
        parsed.can_edit_admin_permissions ?? (parsed.can_manage_admins !== false);

      return {
        can_post: parsed.can_post !== false,
        can_manage_admins:
          !!canAddAdmins && !!canRemoveAdmins && !!canEditAdminPermissions,
        can_edit_channel:
          !!canEditChannelAvatar && !!canEditChannelName && !!canEditChannelDescription,
        can_moderate_subscribers: parsed.can_moderate_subscribers !== false,
        can_edit_channel_avatar: !!canEditChannelAvatar,
        can_edit_channel_name: !!canEditChannelName,
        can_edit_channel_description: !!canEditChannelDescription,
        can_add_admins: !!canAddAdmins,
        can_remove_admins: !!canRemoveAdmins,
        can_edit_admin_permissions: !!canEditAdminPermissions,
      };
    } catch {
      return { ...FULL_CHANNEL_PERMISSIONS };
    }
  }

  private serializeChannelPermissions(permissions: ChannelPermissions): string {
    const canEditChannel =
      permissions.can_edit_channel_avatar &&
      permissions.can_edit_channel_name &&
      permissions.can_edit_channel_description;
    const canManageAdmins =
      permissions.can_add_admins &&
      permissions.can_remove_admins &&
      permissions.can_edit_admin_permissions;

    return JSON.stringify({
      can_post: !!permissions.can_post,
      can_manage_admins: !!canManageAdmins,
      can_edit_channel: !!canEditChannel,
      can_moderate_subscribers: !!permissions.can_moderate_subscribers,
      can_edit_channel_avatar: !!permissions.can_edit_channel_avatar,
      can_edit_channel_name: !!permissions.can_edit_channel_name,
      can_edit_channel_description: !!permissions.can_edit_channel_description,
      can_add_admins: !!permissions.can_add_admins,
      can_remove_admins: !!permissions.can_remove_admins,
      can_edit_admin_permissions: !!permissions.can_edit_admin_permissions,
    });
  }

  private resolveNextChannelPermissions(
    member: ChannelWithRelations['members'][number] | null,
    dto: UpdateChannelMemberDto,
  ): ChannelPermissions {
    const current = this.parseChannelPermissions(member);
    const next = {
      can_post: dto.can_post ?? current.can_post,
      can_moderate_subscribers:
        dto.can_moderate_subscribers ?? current.can_moderate_subscribers,
      can_edit_channel_avatar:
        dto.can_edit_channel_avatar ?? current.can_edit_channel_avatar,
      can_edit_channel_name:
        dto.can_edit_channel_name ?? current.can_edit_channel_name,
      can_edit_channel_description:
        dto.can_edit_channel_description ?? current.can_edit_channel_description,
      can_add_admins: dto.can_add_admins ?? current.can_add_admins,
      can_remove_admins: dto.can_remove_admins ?? current.can_remove_admins,
      can_edit_admin_permissions:
        dto.can_edit_admin_permissions ?? current.can_edit_admin_permissions,
    };

    if (dto.can_edit_channel !== undefined) {
      next.can_edit_channel_avatar = dto.can_edit_channel;
      next.can_edit_channel_name = dto.can_edit_channel;
      next.can_edit_channel_description = dto.can_edit_channel;
    }
    if (dto.can_manage_admins !== undefined) {
      next.can_add_admins = dto.can_manage_admins;
      next.can_remove_admins = dto.can_manage_admins;
      next.can_edit_admin_permissions = dto.can_manage_admins;
    }

    return {
      ...next,
      can_manage_admins:
        next.can_add_admins &&
        next.can_remove_admins &&
        next.can_edit_admin_permissions,
      can_edit_channel:
        next.can_edit_channel_avatar &&
        next.can_edit_channel_name &&
        next.can_edit_channel_description,
    };
  }

  private async getChannelOrThrow(channelId: string): Promise<ChannelWithRelations> {
    const channel = await this.prisma.chat.findUnique({
      where: { id: channelId },
      include: CHANNEL_INCLUDE,
    });

    if (!channel || channel.chatType !== ChatType.channel) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  private buildChannelResolvePayload(
    channel: ChannelWithRelations,
    userId: string,
    linkKind: 'slug' | 'invite',
  ) {
    const access = this.getAccessState(channel, userId);
    const mapped = this.mapChannelForUser(channel, userId);
    const channelPayload =
      linkKind === 'slug' ? { ...mapped, invite_token: null } : mapped;

    const member = access.member;
    const isSubscribed =
      !!member &&
      !access.isBanned &&
      (member.role === ChatMemberRole.owner ||
        member.role === ChatMemberRole.admin ||
        member.accessStatus === SubscriptionStatus.active);

    let canSubscribe = false;
    if (!access.isBanned && !isSubscribed) {
      canSubscribe = channel.accessType === ChatAccessType.free;
    }

    const subscribeRequiresInvite =
      channel.visibility === ChatVisibility.private &&
      !member &&
      channel.accessType === ChatAccessType.free;

    return {
      link_kind: linkKind,
      channel_id: channel.id,
      visibility:
        channel.visibility === ChatVisibility.public ? 'public' : 'private',
      channel: channelPayload,
      is_subscribed: isSubscribed,
      can_subscribe: canSubscribe,
      subscribe_requires_invite: subscribeRequiresInvite,
    };
  }

  async resolveChannelBySlug(slug: string, userId: string) {
    const normalized = slug.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(normalized)) {
      throw new BadRequestException('Invalid slug');
    }

    const channel = await this.prisma.chat.findFirst({
      where: {
        chatType: ChatType.channel,
        slug: normalized,
        visibility: ChatVisibility.public,
      },
      include: CHANNEL_INCLUDE,
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return this.buildChannelResolvePayload(channel, userId, 'slug');
  }

  async resolveChannelByInvite(rawToken: string, userId: string) {
    let normalized = rawToken.trim();
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // keep trimmed raw
    }
    normalized = normalized.trim();
    if (!normalized || normalized.length > 128) {
      throw new BadRequestException('Invalid invite token');
    }

    const channel = await this.prisma.chat.findFirst({
      where: {
        chatType: ChatType.channel,
        inviteToken: normalized,
      },
      include: CHANNEL_INCLUDE,
    });

    if (!channel) {
      throw new NotFoundException('Invite link is invalid or expired');
    }

    return this.buildChannelResolvePayload(channel, userId, 'invite');
  }

  private getAccessState(channel: ChannelWithRelations, userId: string) {
    const member = channel.members.find((item) => item.userId === userId) ?? null;
    const permissions = this.parseChannelPermissions(member);
    const isAdminRole =
      member?.role === ChatMemberRole.owner || member?.role === ChatMemberRole.admin;
    const isBanned =
      !!member &&
      member.accessStatus === SubscriptionStatus.canceled &&
      member.role === ChatMemberRole.member;
    const hasActiveAccess =
      !!member &&
      !isBanned &&
      (isAdminRole ||
        member.accessStatus === SubscriptionStatus.active);
    const canPreview =
      !isBanned && (channel.visibility === ChatVisibility.public || !!member);
    const canViewFullFeed = hasActiveAccess;
    const canPost = canViewFullFeed && permissions.can_post;
    const canManageAdmins = !isBanned && permissions.can_manage_admins;
    const canEditChannel = !isBanned && permissions.can_edit_channel;
    const canModerateSubscribers = !isBanned && permissions.can_moderate_subscribers;
    const canEditChannelAvatar = !isBanned && permissions.can_edit_channel_avatar;
    const canEditChannelName = !isBanned && permissions.can_edit_channel_name;
    const canEditChannelDescription = !isBanned && permissions.can_edit_channel_description;
    const canAddAdmins = !isBanned && permissions.can_add_admins;
    const canRemoveAdmins = !isBanned && permissions.can_remove_admins;
    const canEditAdminPermissions = !isBanned && permissions.can_edit_admin_permissions;

    return {
      member,
      isAdmin: isAdminRole,
      isBanned,
      permissions,
      canPreview,
      canViewFullFeed,
      canComment:
        (canViewFullFeed && channel.allowComments && !channel.disableCommentsAll) ||
        (isAdminRole && !isBanned),
      canReact: canViewFullFeed && channel.allowReactions,
      canPost,
      canManageAdmins,
      canEditChannel,
      canModerateSubscribers,
      canEditChannelAvatar,
      canEditChannelName,
      canEditChannelDescription,
      canAddAdmins,
      canRemoveAdmins,
      canEditAdminPermissions,
    };
  }

  private async getPreviewPosts(channelId: string, limit: number, userId: string) {
    const posts = await this.prisma.message.findMany({
      where: {
        chatId: channelId,
        isDeleted: false,
        isChannelPost: true,
      },
      include: {
        media: true,
        reactions: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const viewedNowIds = await this.markChannelPostsViewed(
      channelId,
      userId,
      posts.map((post) => post.id),
    );

    return posts.map((post) => {
      const mapped = mapMessage(post, {
        includeMedia: true,
        includeReactions: true,
        currentUserId: userId,
      });
      if (viewedNowIds.has(post.id)) {
        mapped.view_count += 1;
      }
      return mapped;
    });
  }

  private async markChannelPostsViewed(
    channelId: string,
    userId: string,
    postIds: string[],
  ): Promise<Set<string>> {
    const uniquePostIds = [...new Set(postIds.filter(Boolean))];
    if (uniquePostIds.length === 0) {
      return new Set();
    }

    const viewedNowIds = new Set<string>();
    for (const postId of uniquePostIds) {
      try {
        await this.prisma.channelPostView.create({
          data: {
            messageId: postId,
            userId,
          },
        });

        await this.prisma.message.updateMany({
          where: {
            id: postId,
            chatId: channelId,
            isChannelPost: true,
            isDeleted: false,
          },
          data: {
            viewCount: { increment: 1 },
          },
        });

        viewedNowIds.add(postId);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            continue;
          }
          if (error.code === 'P2021' || error.code === 'P2022') {
            return new Set();
          }
        }
        throw error;
      }
    }

    return viewedNowIds;
  }

  private async ensureDiscussionMembership(channel: ChannelWithRelations, userId: string) {
    const discussionChatId = channel.linkedDiscussionChatId;
    if (!discussionChatId) {
      throw new BadRequestException('Channel discussion is not configured');
    }

    const existing = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: discussionChatId, userId } },
    });
    if (existing) {
      return existing;
    }

    const channelMember = channel.members.find((item) => item.userId === userId);
    if (!channelMember) {
      throw new ForbiddenException('Join the channel before opening the discussion');
    }

    return this.prisma.chatMember.create({
      data: {
        chatId: discussionChatId,
        userId,
        role:
          channelMember.role === ChatMemberRole.owner ||
          channelMember.role === ChatMemberRole.admin
            ? channelMember.role
            : ChatMemberRole.member,
        accessStatus:
          channelMember.accessStatus === SubscriptionStatus.active ||
          channelMember.role === ChatMemberRole.owner ||
          channelMember.role === ChatMemberRole.admin
            ? SubscriptionStatus.active
            : SubscriptionStatus.pending,
        subscriptionExpiresAt: channelMember.subscriptionExpiresAt ?? null,
      },
    });
  }

  private async resolveBeforeDate(chatId: string, before?: string, threadRootMessageId?: string) {
    if (!before) {
      return undefined;
    }

    const message = await this.prisma.message.findFirst({
      where: {
        id: before,
        chatId,
        ...(threadRootMessageId ? { threadRootMessageId } : {}),
      },
      select: { createdAt: true },
    });

    return message?.createdAt;
  }

  private async broadcastChannelPost(channelId: string, post: Awaited<ReturnType<MessagesService['createChannelPost']>>) {
    await this.realtimeService.broadcastToChatMembers(channelId, {
      type: 'channel_post',
      channel_id: channelId,
      message: post,
    });
  }

  private async broadcastDiscussionMessage(
    channelId: string,
    postId: string,
    discussionChatId: string,
    message: Awaited<ReturnType<MessagesService['createMessage']>>,
    commentCount: number,
  ) {
    await this.realtimeService.broadcastToChatMembers(discussionChatId, {
      type: 'discussion_message',
      channel_id: channelId,
      post_id: postId,
      discussion_chat_id: discussionChatId,
      message,
    });

    await this.realtimeService.broadcastToChatMembers(channelId, {
      type: 'channel_post_comment_count_updated',
      channel_id: channelId,
      post_id: postId,
      comment_count: commentCount,
    });
  }

  async getCatalog(userId: string) {
    const channels = await this.prisma.chat.findMany({
      where: { chatType: ChatType.channel },
      include: CHANNEL_INCLUDE,
      orderBy: [{ subscriberCount: 'desc' }, { lastMessageAt: 'desc' }],
    });

    return channels
      .filter((channel) => {
        const access = this.getAccessState(channel, userId);
        return access.canPreview || access.canViewFullFeed || access.isAdmin;
      })
      .map((channel) => {
        const access = this.getAccessState(channel, userId);
        return {
          ...this.mapChannelForUser(channel, userId),
          can_view_full_feed: access.canViewFullFeed,
          can_comment: access.canComment,
          can_react: access.canReact,
          can_post: access.canPost,
          channel_permissions: access.permissions,
          is_subscribed: !!access.member,
        };
      });
  }

  async searchChannels(userId: string, query: string, limit: number) {
    const q = query.trim();
    if (!q) {
      return [];
    }

    const take = Math.max(1, Math.min(limit, 50));
    const channels = await this.prisma.chat.findMany({
      where: {
        chatType: ChatType.channel,
        AND: [
          {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { inviteToken: { contains: q, mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              { visibility: 'public' },
              { members: { some: { userId } } },
            ],
          },
        ],
      },
      include: CHANNEL_INCLUDE,
      orderBy: [{ subscriberCount: 'desc' }, { lastMessageAt: 'desc' }],
      take: Math.min(take * 2, 50),
    });

    return channels
      .filter((channel) => {
        const access = this.getAccessState(channel, userId);
        return access.canPreview || access.canViewFullFeed || access.isAdmin;
      })
      .slice(0, take)
      .map((channel) => {
        const access = this.getAccessState(channel, userId);
        return {
          ...this.mapChannelForUser(channel, userId),
          can_view_full_feed: access.canViewFullFeed,
          can_comment: access.canComment,
          can_react: access.canReact,
          can_post: access.canPost,
          channel_permissions: access.permissions,
          is_subscribed: !!access.member,
        };
      });
  }

  async getChannelById(channelId: string, userId: string) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);

    if (!access.canPreview && !access.canViewFullFeed) {
      throw new ForbiddenException('Channel is private');
    }

    const previewLimit = access.canViewFullFeed
      ? 20
      : Math.max(1, channel.previewPostCount);

    return {
      ...this.mapChannelForUser(channel, userId),
      preview_posts: await this.getPreviewPosts(channelId, previewLimit, userId),
      can_view_full_feed: access.canViewFullFeed,
      can_comment: access.canComment,
      can_react: access.canReact,
      can_post: access.canPost,
      channel_permissions: access.permissions,
      is_subscribed: !!access.member,
      linked_discussion_chat_id: channel.linkedDiscussionChatId ?? null,
    };
  }

  async getFeed(channelId: string, userId: string, limit: number, before?: string) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);

    if (!access.canPreview && !access.canViewFullFeed) {
      throw new ForbiddenException('Channel is private');
    }

    const take = access.canViewFullFeed
      ? limit
      : Math.min(limit, Math.max(1, channel.previewPostCount));
    const beforeDate = await this.resolveBeforeDate(channelId, before);

    const posts = await this.prisma.message.findMany({
      where: {
        chatId: channelId,
        isDeleted: false,
        isChannelPost: true,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      include: {
        media: true,
        reactions: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    const viewedNowIds = await this.markChannelPostsViewed(
      channelId,
      userId,
      posts.map((post) => post.id),
    );

    return {
      channel: {
        ...this.mapChannelForUser(channel, userId),
        can_view_full_feed: access.canViewFullFeed,
        can_comment: access.canComment,
        can_react: access.canReact,
        can_post: access.canPost,
        channel_permissions: access.permissions,
        is_subscribed: !!access.member,
      },
      posts: posts.map((post) => {
        const mapped = mapMessage(post, {
          includeMedia: true,
          includeReactions: true,
          currentUserId: userId,
        });
        if (viewedNowIds.has(post.id)) {
          mapped.view_count += 1;
        }
        return mapped;
      }),
    };
  }

  /**
   * Вычисляет, можно ли писать комментарий под КОНКРЕТНЫМ постом с учётом
   * всех настроек канала: disableCommentsAll / disableCommentsNew+Since.
   * Админы и владельцы не ограничиваются (они модерируют).
   */
  private resolveCommentAccessForPost(
    channel: ChannelWithRelations,
    post: { createdAt: Date },
    isAdminOrOwner: boolean,
  ): { allowed: boolean; reason?: string } {
    if (isAdminOrOwner) return { allowed: true };
    if (!channel.allowComments) {
      return { allowed: false, reason: 'Comments are disabled in this channel' };
    }
    if (channel.disableCommentsAll) {
      return { allowed: false, reason: 'Comments are disabled in this channel' };
    }
    if (
      channel.disableCommentsNew &&
      channel.disableCommentsNewSince &&
      post.createdAt >= channel.disableCommentsNewSince
    ) {
      return { allowed: false, reason: 'Comments are disabled for new posts' };
    }
    return { allowed: true };
  }

  /**
   * Проверка запрета типа сообщения в обсуждении (голос/медиа)
   * и cooldown между сообщениями пользователя в треде.
   */
  private async enforceDiscussionPolicy(
    channel: ChannelWithRelations,
    postId: string,
    userId: string,
    msgType: string,
    isAdminOrOwner: boolean,
  ) {
    if (isAdminOrOwner) return;

    if (msgType === 'voice' && channel.disableVoiceComments) {
      throw new ForbiddenException('Voice comments are disabled in this channel');
    }
    const isMedia =
      msgType === 'image' ||
      msgType === 'video' ||
      msgType === 'video_note' ||
      msgType === 'file';
    if (isMedia && channel.disableMediaComments) {
      throw new ForbiddenException('Media comments are disabled in this channel');
    }

    const cooldown = channel.commentCooldownSec ?? 0;
    if (cooldown > 0 && channel.linkedDiscussionChatId) {
      const last = await this.prisma.message.findFirst({
        where: {
          chatId: channel.linkedDiscussionChatId,
          threadRootMessageId: postId,
          senderId: userId,
          isDeleted: false,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (last) {
        const diffSec = Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
        if (diffSec < cooldown) {
          throw new ForbiddenException(
            `Please wait ${cooldown - diffSec}s before sending another comment`,
          );
        }
      }
    }
  }

  async getDiscussion(
    channelId: string,
    postId: string,
    userId: string,
    limit: number,
    before?: string,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);

    if (!access.canViewFullFeed || !channel.allowComments) {
      throw new ForbiddenException('Comments are unavailable for this channel');
    }

    await this.ensureDiscussionMembership(channel, userId);

    const post = await this.prisma.message.findFirst({
      where: {
        id: postId,
        chatId: channelId,
        isChannelPost: true,
        isDeleted: false,
      },
      include: {
        media: true,
        reactions: true,
        sender: true,
      },
    });
    if (!post) {
      throw new NotFoundException('Channel post not found');
    }

    const discussionChatId = channel.linkedDiscussionChatId!;
    const beforeDate = await this.resolveBeforeDate(discussionChatId, before, postId);
    const messages = await this.prisma.message.findMany({
      where: {
        chatId: discussionChatId,
        threadRootMessageId: postId,
        isDeleted: false,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      include: {
        media: true,
        reactions: true,
        sender: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const perPostComment = this.resolveCommentAccessForPost(
      channel,
      post,
      access.isAdmin,
    );

    return {
      channel: {
        ...this.mapChannelForUser(channel, userId),
        channel_permissions: access.permissions,
      },
      discussion_chat_id: discussionChatId,
      thread_root_message_id: postId,
      can_comment: access.canComment && perPostComment.allowed,
      post: mapMessage(post, {
        includeMedia: true,
        includeReactions: true,
        includeSender: true,
        currentUserId: userId,
      }),
      messages: messages.map((message) =>
        mapMessage(message, {
          includeMedia: true,
          includeReactions: true,
          includeSender: true,
          currentUserId: userId,
        }),
      ),
    };
  }

  async createChannel(userId: string, dto: CreateChannelDto) {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Channel name is required');
    }

    const accessType =
      dto.access_type === 'paid' ? ChatAccessType.paid : ChatAccessType.free;
    const visibility =
      dto.visibility === 'private' ? ChatVisibility.private : ChatVisibility.public;

    const channel = await this.prisma.$transaction(async (tx) => {
      const baseInviteToken = this.buildInviteToken(trimmedName);
      const createdChannel = await tx.chat.create({
        data: {
          id: randomUUID(),
          chatType: ChatType.channel,
          name: trimmedName,
          description: dto.description?.trim() || null,
          visibility,
          accessType,
          subscriptionPriceCents:
            accessType === ChatAccessType.paid ? dto.subscription_price_cents ?? 499 : null,
          subscriptionPeriodDays:
            accessType === ChatAccessType.paid ? dto.subscription_period_days ?? 30 : null,
          previewPostCount: dto.preview_post_count ?? 3,
          allowComments: dto.allow_comments ?? true,
          allowReactions: dto.allow_reactions ?? true,
          inviteToken: baseInviteToken,
          createdById: userId,
          members: {
            create: {
              userId,
              role: ChatMemberRole.owner,
              accessStatus: SubscriptionStatus.active,
            },
          },
        },
        include: CHANNEL_INCLUDE,
      });

      const discussion = await tx.chat.create({
        data: {
          id: randomUUID(),
          chatType: ChatType.discussion,
          name: `${trimmedName} discussion`,
          description: `Linked discussion for ${trimmedName}`,
          visibility: ChatVisibility.private,
          accessType: ChatAccessType.free,
          inviteToken: `${baseInviteToken}-discussion`,
          createdById: userId,
          members: {
            create: {
              userId,
              role: ChatMemberRole.owner,
              accessStatus: SubscriptionStatus.active,
            },
          },
        },
      });

      await tx.chat.update({
        where: { id: createdChannel.id },
        data: { linkedDiscussionChatId: discussion.id },
      });

      await this.refreshChannelCounts(createdChannel.id, tx);

      return tx.chat.findUniqueOrThrow({
        where: { id: createdChannel.id },
        include: CHANNEL_INCLUDE,
      });
    });

    return this.mapChannelForUser(channel, userId);
  }

  async updateChannel(channelId: string, userId: string, dto: UpdateChannelDto) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);

    if (!access.member) {
      throw new ForbiddenException('Insufficient permissions to update channel settings');
    }
    if (dto.avatar_url !== undefined && !access.canEditChannelAvatar) {
      throw new ForbiddenException('Insufficient permissions to update channel avatar');
    }
    if (dto.name !== undefined && !access.canEditChannelName) {
      throw new ForbiddenException('Insufficient permissions to update channel name');
    }
    if (dto.description !== undefined && !access.canEditChannelDescription) {
      throw new ForbiddenException('Insufficient permissions to update channel description');
    }
    const hasGeneralSettingsUpdate =
      dto.visibility !== undefined ||
      dto.access_type !== undefined ||
      dto.subscription_price_cents !== undefined ||
      dto.subscription_period_days !== undefined ||
      dto.preview_post_count !== undefined ||
      dto.allow_comments !== undefined ||
      dto.allow_reactions !== undefined ||
      dto.disable_comments_new !== undefined ||
      dto.disable_comments_all !== undefined ||
      dto.disable_voice_comments !== undefined ||
      dto.disable_media_comments !== undefined ||
      dto.comment_cooldown_sec !== undefined ||
      dto.slug !== undefined ||
      dto.clear_slug === true;
    if (hasGeneralSettingsUpdate && !access.canEditChannel) {
      throw new ForbiddenException('Insufficient permissions to update channel settings');
    }

    const data: Prisma.ChatUpdateInput = {};

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        throw new BadRequestException('Channel name cannot be empty');
      }
      data.name = trimmed;
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    if (dto.avatar_url !== undefined) {
      data.avatarUrl = dto.avatar_url.trim() || null;
    }
    if (dto.visibility !== undefined) {
      data.visibility =
        dto.visibility === 'private' ? ChatVisibility.private : ChatVisibility.public;
      if (dto.visibility === 'private') {
        data.slug = null;
      }
    }
    if (dto.access_type !== undefined) {
      data.accessType =
        dto.access_type === 'paid' ? ChatAccessType.paid : ChatAccessType.free;
      if (dto.access_type === 'free') {
        data.subscriptionPriceCents = null;
        data.subscriptionPeriodDays = null;
      }
    }
    if (dto.subscription_price_cents !== undefined) {
      data.subscriptionPriceCents = dto.subscription_price_cents;
    }
    if (dto.subscription_period_days !== undefined) {
      data.subscriptionPeriodDays = dto.subscription_period_days;
    }
    if (dto.preview_post_count !== undefined) {
      data.previewPostCount = dto.preview_post_count;
    }
    if (dto.allow_comments !== undefined) {
      data.allowComments = dto.allow_comments;
    }
    if (dto.allow_reactions !== undefined) {
      data.allowReactions = dto.allow_reactions;
    }
    if (dto.disable_comments_new !== undefined) {
      data.disableCommentsNew = dto.disable_comments_new;
      // «Только для новых постов»: фиксируем момент включения, чтобы отличать
      // посты «до» (разрешены) от «после» (запрещены). Выключение — сбрасываем.
      data.disableCommentsNewSince = dto.disable_comments_new ? new Date() : null;
    }
    if (dto.disable_comments_all !== undefined) {
      data.disableCommentsAll = dto.disable_comments_all;
    }
    if (dto.disable_voice_comments !== undefined) {
      data.disableVoiceComments = dto.disable_voice_comments;
    }
    if (dto.disable_media_comments !== undefined) {
      data.disableMediaComments = dto.disable_media_comments;
    }
    if (dto.comment_cooldown_sec !== undefined) {
      data.commentCooldownSec = Math.max(0, Math.min(15, dto.comment_cooldown_sec));
    }
    const effectivePublic =
      dto.visibility !== undefined
        ? dto.visibility === 'public'
        : channel.visibility === ChatVisibility.public;

    if (dto.clear_slug === true) {
      data.slug = null;
    } else if (dto.slug !== undefined && effectivePublic) {
      const slugLower = dto.slug.toLowerCase();
      const existing = await this.prisma.chat.findUnique({
        where: { slug: slugLower },
        select: { id: true },
      });
      if (existing && existing.id !== channelId) {
        throw new BadRequestException('This slug is already taken');
      }
      data.slug = slugLower;
    }

    const updated = await this.prisma.chat.update({
      where: { id: channelId },
      data,
      include: CHANNEL_INCLUDE,
    });

    return this.mapChannelForUser(updated, userId);
  }

  async subscribe(
    channelId: string,
    userId: string,
    dto: SubscribeChannelDto = {},
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const existingMember = channel.members.find((item) => item.userId === userId) ?? null;

    if (channel.accessType === ChatAccessType.paid) {
      throw new ForbiddenException('Paid channels require checkout first');
    }
    if (existingMember?.accessStatus === SubscriptionStatus.canceled) {
      throw new ForbiddenException('You are banned from this channel');
    }

    const hasActiveMembership =
      !!existingMember &&
      (existingMember.role === ChatMemberRole.owner ||
        existingMember.role === ChatMemberRole.admin ||
        existingMember.accessStatus === SubscriptionStatus.active);

    if (
      channel.visibility === ChatVisibility.private &&
      !hasActiveMembership
    ) {
      const token = dto.invite_token?.trim();
      if (!token || token !== channel.inviteToken) {
        throw new ForbiddenException('Valid invite link required to join this channel');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chatMember.upsert({
        where: { chatId_userId: { chatId: channelId, userId } },
        update: {
          accessStatus: SubscriptionStatus.active,
          subscriptionExpiresAt: null,
        },
        create: {
          chatId: channelId,
          userId,
          role: ChatMemberRole.member,
          accessStatus: SubscriptionStatus.active,
        },
      });
      await this.refreshChannelCounts(channelId, tx);
    });

    const updated = await this.getChannelOrThrow(channelId);
    return this.mapChannelForUser(updated, userId);
  }

  /**
   * Обычный подписчик или админ выходит из канала (не владелец).
   */
  async unsubscribeFromChannel(channelId: string, userId: string) {
    const channel = await this.getChannelOrThrow(channelId);
    const member = channel.members.find((item) => item.userId === userId) ?? null;
    if (!member) {
      throw new NotFoundException('You are not a member of this channel');
    }
    if (member.role === ChatMemberRole.owner) {
      throw new ForbiddenException('Channel owner cannot leave via unsubscribe');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chatMember.delete({
        where: { chatId_userId: { chatId: channelId, userId } },
      });
      await this.refreshChannelCounts(channelId, tx);
    });

    return { ok: true as const };
  }

  async mockCheckout(channelId: string, userId: string) {
    const channel = await this.getChannelOrThrow(channelId);
    const existingMember = channel.members.find((item) => item.userId === userId) ?? null;

    if (existingMember?.accessStatus === SubscriptionStatus.canceled) {
      throw new ForbiddenException('You are banned from this channel');
    }

    if (channel.accessType !== ChatAccessType.paid) {
      return this.subscribe(channelId, userId);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (channel.subscriptionPeriodDays ?? 30));

    await this.prisma.$transaction(async (tx) => {
      await tx.chatMember.upsert({
        where: { chatId_userId: { chatId: channelId, userId } },
        update: {
          accessStatus: SubscriptionStatus.active,
          subscriptionExpiresAt: expiresAt,
        },
        create: {
          chatId: channelId,
          userId,
          role: ChatMemberRole.member,
          accessStatus: SubscriptionStatus.active,
          subscriptionExpiresAt: expiresAt,
        },
      });
      await this.refreshChannelCounts(channelId, tx);
    });

    const updated = await this.getChannelOrThrow(channelId);
    return {
      checkout_state: 'paid',
      channel: this.mapChannelForUser(updated, userId),
    };
  }

  async publishPost(channelId: string, userId: string, dto: CreateChannelPostDto) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);
    if (!access.canPost) {
      throw new ForbiddenException('Insufficient permissions to publish posts');
    }

    const post = await this.messagesService.createChannelPost(
      channelId,
      userId,
      dto.msg_type ?? 'text',
      dto.content ?? null,
      this.sanitizeMedia(dto.media),
    );

    await this.broadcastChannelPost(channelId, post);
    return post;
  }

  async createDiscussionMessage(
    channelId: string,
    postId: string,
    userId: string,
    dto: CreateDiscussionMessageDto,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);

    if (!access.canComment) {
      throw new ForbiddenException('Comments are unavailable for this channel');
    }

    await this.ensureDiscussionMembership(channel, userId);

    const post = await this.prisma.message.findFirst({
      where: {
        id: postId,
        chatId: channelId,
        isChannelPost: true,
        isDeleted: false,
      },
      select: { id: true, createdAt: true },
    });
    if (!post) {
      throw new NotFoundException('Channel post not found');
    }

    const perPostComment = this.resolveCommentAccessForPost(channel, post, access.isAdmin);
    if (!perPostComment.allowed) {
      throw new ForbiddenException(perPostComment.reason ?? 'Comments are disabled');
    }

    const msgType = dto.msg_type ?? 'text';
    await this.enforceDiscussionPolicy(channel, postId, userId, msgType, access.isAdmin);

    const discussionChatId = channel.linkedDiscussionChatId!;
    const message = await this.messagesService.createMessage(
      discussionChatId,
      userId,
      msgType,
      dto.content ?? null,
      this.sanitizeMedia(dto.media),
      dto.reply_to_id ?? null,
      undefined,
      {
        threadRootMessageId: postId,
        transport: Transport.websocket,
      },
    );

    const updatedPost = await this.prisma.message.update({
      where: { id: postId },
      data: {
        commentCount: {
          increment: 1,
        },
      },
      select: {
        commentCount: true,
      },
    });

    await this.broadcastDiscussionMessage(
      channelId,
      postId,
      discussionChatId,
      message,
      updatedPost.commentCount,
    );

    return message;
  }

  async getChannelMembers(
    channelId: string,
    userId: string,
    query: GetChannelMembersQueryDto,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);
    if (
      !access.member ||
      (!access.canAddAdmins &&
        !access.canRemoveAdmins &&
        !access.canEditAdminPermissions &&
        !access.canModerateSubscribers)
    ) {
      throw new ForbiddenException('Insufficient permissions to view channel members');
    }

    const take = Math.max(1, Math.min(query.limit ?? 40, 100));
    const cursorDate = query.cursor ? new Date(Number(query.cursor)) : null;
    const includeBanned = query.include_banned === true;
    const roleFilter = query.role;
    const text = query.q?.trim() ?? '';

    const where: Prisma.ChatMemberWhereInput = {
      chatId: channelId,
      ...(cursorDate && !Number.isNaN(cursorDate.getTime())
        ? {
            joinedAt: { lt: cursorDate },
          }
        : {}),
      ...(roleFilter === 'admin'
        ? { role: { in: [ChatMemberRole.owner, ChatMemberRole.admin] } }
        : roleFilter === 'subscriber'
          ? { role: ChatMemberRole.member }
          : {}),
      ...(includeBanned
        ? {}
        : {
            OR: [
              { role: { in: [ChatMemberRole.owner, ChatMemberRole.admin] } },
              { accessStatus: { not: SubscriptionStatus.canceled } },
            ],
          }),
      ...(text
        ? {
            user: {
              OR: [
                { username: { contains: text, mode: 'insensitive' } },
                { displayName: { contains: text, mode: 'insensitive' } },
                { handle: { contains: text, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const rows = await this.prisma.chatMember.findMany({
      where,
      include: { user: true },
      orderBy: [{ joinedAt: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = rows.slice(0, take);
    const nextCursor = hasMore ? String(items[items.length - 1]?.joinedAt.getTime() ?? '') : null;

    return {
      items: items.map((item) => {
        const permissions = this.parseChannelPermissions(item);
        return {
          user_id: item.userId,
          role: item.role,
          access_status: item.accessStatus,
          subscription_expires_at: item.subscriptionExpiresAt?.getTime() ?? null,
          joined_at: item.joinedAt.getTime(),
          permissions,
          is_banned:
            item.accessStatus === SubscriptionStatus.canceled &&
            item.role === ChatMemberRole.member,
          user: {
            id: item.user.id,
            username: item.user.username ?? null,
            handle: item.user.handle ?? null,
            display_name: item.user.displayName ?? null,
            avatar_url: item.user.avatarUrl ?? null,
            is_online: item.user.isOnline,
            last_seen: item.user.lastSeen?.getTime() ?? null,
          },
        };
      }),
      next_cursor: nextCursor,
    };
  }

  async updateChannelMember(
    channelId: string,
    actorUserId: string,
    targetUserId: string,
    dto: UpdateChannelMemberDto,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const actorAccess = this.getAccessState(channel, actorUserId);
    if (!actorAccess.member) {
      throw new ForbiddenException('Insufficient permissions to manage channel admins');
    }
    if (actorUserId === targetUserId) {
      throw new BadRequestException('Нельзя изменять собственные права администратора');
    }

    const target = channel.members.find((item) => item.userId === targetUserId) ?? null;
    if (!target) {
      throw new NotFoundException('Channel member not found');
    }
    if (target.role === ChatMemberRole.owner) {
      throw new ForbiddenException('Channel owner cannot be modified');
    }
    if (target.role !== ChatMemberRole.member && target.role !== ChatMemberRole.admin) {
      throw new ForbiddenException('Unsupported member role');
    }
    if (target.accessStatus === SubscriptionStatus.canceled) {
      throw new ForbiddenException('Unban member before assigning admin role');
    }

    const hasPermissionFieldUpdate =
      dto.can_post !== undefined ||
      dto.can_manage_admins !== undefined ||
      dto.can_edit_channel !== undefined ||
      dto.can_moderate_subscribers !== undefined ||
      dto.can_edit_channel_avatar !== undefined ||
      dto.can_edit_channel_name !== undefined ||
      dto.can_edit_channel_description !== undefined ||
      dto.can_add_admins !== undefined ||
      dto.can_remove_admins !== undefined ||
      dto.can_edit_admin_permissions !== undefined;

    const roleToAdmin = dto.role === 'admin' && target.role === ChatMemberRole.member;
    const roleToMember = dto.role === 'member' && target.role === ChatMemberRole.admin;

    if (roleToAdmin && !actorAccess.canAddAdmins) {
      throw new ForbiddenException('Insufficient permissions to add channel admins');
    }
    if (roleToMember && !actorAccess.canRemoveAdmins) {
      throw new ForbiddenException('Insufficient permissions to remove channel admins');
    }
    if (hasPermissionFieldUpdate && !actorAccess.canEditAdminPermissions) {
      throw new ForbiddenException('Insufficient permissions to edit admin permissions');
    }
    if (!roleToAdmin && !roleToMember && !hasPermissionFieldUpdate) {
      throw new BadRequestException('No admin changes requested');
    }

    const role = dto.role === 'admin' ? ChatMemberRole.admin : dto.role === 'member' ? ChatMemberRole.member : target.role;
    const nextPermissions =
      role === ChatMemberRole.admin
        ? this.resolveNextChannelPermissions(target, dto)
        : { ...MEMBER_CHANNEL_PERMISSIONS };

    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId: channelId, userId: targetUserId } },
      data: {
        role,
        tag: role === ChatMemberRole.admin ? this.serializeChannelPermissions(nextPermissions) : null,
        accessStatus:
          role === ChatMemberRole.admin ? SubscriptionStatus.active : target.accessStatus,
      },
    });

    const updated = await this.getChannelOrThrow(channelId);
    return {
      channel: {
        ...this.mapChannelForUser(updated, actorUserId),
        channel_permissions: this.getAccessState(updated, actorUserId).permissions,
      },
    };
  }

  async removeChannelMember(
    channelId: string,
    actorUserId: string,
    targetUserId: string,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const actorAccess = this.getAccessState(channel, actorUserId);
    if (!actorAccess.member || !actorAccess.canModerateSubscribers) {
      throw new ForbiddenException('Insufficient permissions to remove subscribers');
    }
    if (actorUserId === targetUserId) {
      throw new BadRequestException('You cannot remove yourself');
    }

    const target = channel.members.find((item) => item.userId === targetUserId) ?? null;
    if (!target) {
      throw new NotFoundException('Channel member not found');
    }
    if (target.role === ChatMemberRole.owner || target.role === ChatMemberRole.admin) {
      throw new ForbiddenException('Cannot remove owner or admin via subscriber moderation');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chatMember.delete({
        where: { chatId_userId: { chatId: channelId, userId: targetUserId } },
      });
      await this.refreshChannelCounts(channelId, tx);
    });

    const updated = await this.getChannelOrThrow(channelId);
    return {
      channel: {
        ...this.mapChannelForUser(updated, actorUserId),
        channel_permissions: this.getAccessState(updated, actorUserId).permissions,
      },
    };
  }

  async banChannelMember(
    channelId: string,
    actorUserId: string,
    targetUserId: string,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const actorAccess = this.getAccessState(channel, actorUserId);
    if (!actorAccess.member || !actorAccess.canModerateSubscribers) {
      throw new ForbiddenException('Insufficient permissions to ban subscribers');
    }
    if (actorUserId === targetUserId) {
      throw new BadRequestException('You cannot ban yourself');
    }

    const target = channel.members.find((item) => item.userId === targetUserId) ?? null;
    if (!target) {
      throw new NotFoundException('Channel member not found');
    }
    if (target.role === ChatMemberRole.owner || target.role === ChatMemberRole.admin) {
      throw new ForbiddenException('Cannot ban owner or admin');
    }

    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId: channelId, userId: targetUserId } },
      data: {
        accessStatus: SubscriptionStatus.canceled,
        role: ChatMemberRole.member,
      },
    });

    const updated = await this.getChannelOrThrow(channelId);
    return {
      channel: {
        ...this.mapChannelForUser(updated, actorUserId),
        channel_permissions: this.getAccessState(updated, actorUserId).permissions,
      },
    };
  }

  async unbanChannelMember(
    channelId: string,
    actorUserId: string,
    targetUserId: string,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const actorAccess = this.getAccessState(channel, actorUserId);
    if (!actorAccess.member || !actorAccess.canModerateSubscribers) {
      throw new ForbiddenException('Insufficient permissions to unban subscribers');
    }

    const target = channel.members.find((item) => item.userId === targetUserId) ?? null;
    if (!target) {
      throw new NotFoundException('Channel member not found');
    }
    if (target.role === ChatMemberRole.owner || target.role === ChatMemberRole.admin) {
      throw new ForbiddenException('Cannot unban owner or admin');
    }

    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId: channelId, userId: targetUserId } },
      data: {
        accessStatus: SubscriptionStatus.active,
      },
    });

    const updated = await this.getChannelOrThrow(channelId);
    return {
      channel: {
        ...this.mapChannelForUser(updated, actorUserId),
        channel_permissions: this.getAccessState(updated, actorUserId).permissions,
      },
    };
  }

  async togglePostReaction(
    channelId: string,
    postId: string,
    userId: string,
    emoji: string,
  ) {
    const channel = await this.getChannelOrThrow(channelId);
    const access = this.getAccessState(channel, userId);

    if (!access.canReact) {
      throw new ForbiddenException('Reactions are unavailable for this channel');
    }

    const post = await this.prisma.message.findFirst({
      where: {
        id: postId,
        chatId: channelId,
        isChannelPost: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException('Channel post not found');
    }

    return this.messagesService.toggleReaction(channelId, postId, userId, emoji);
  }
}
