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
} from '../messages/messages.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateChannelPostDto } from './dto/create-channel-post.dto';
import { CreateDiscussionMessageDto } from './dto/create-discussion-message.dto';

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

  private sanitizeMedia(media?: Record<string, unknown>): CreateMessageMedia | undefined {
    if (!media || typeof media !== 'object') {
      return undefined;
    }
    return media as CreateMessageMedia;
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

  private getAccessState(channel: ChannelWithRelations, userId: string) {
    const member = channel.members.find((item) => item.userId === userId) ?? null;
    const isAdmin =
      member?.role === ChatMemberRole.owner || member?.role === ChatMemberRole.admin;
    const hasActiveAccess =
      !!member &&
      (isAdmin ||
        member.accessStatus === SubscriptionStatus.active);
    const canPreview = channel.visibility === ChatVisibility.public || !!member;
    const canViewFullFeed = hasActiveAccess;

    return {
      member,
      isAdmin,
      canPreview,
      canViewFullFeed,
      canComment: canViewFullFeed && channel.allowComments,
      canReact: canViewFullFeed && channel.allowReactions,
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
          can_post: access.isAdmin,
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
          can_post: access.isAdmin,
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
      can_post: access.isAdmin,
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
        can_post: access.isAdmin,
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
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      channel: this.mapChannelForUser(channel, userId),
      discussion_chat_id: discussionChatId,
      thread_root_message_id: postId,
      can_comment: access.canComment,
      messages: messages.map((message) =>
        mapMessage(message, {
          includeMedia: true,
          includeReactions: true,
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
    const member = channel.members.find((item) => item.userId === userId) ?? null;

    if (!member || (member.role !== ChatMemberRole.owner && member.role !== ChatMemberRole.admin)) {
      throw new ForbiddenException('Only channel admins can update the channel');
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

    const updated = await this.prisma.chat.update({
      where: { id: channelId },
      data,
      include: CHANNEL_INCLUDE,
    });

    return this.mapChannelForUser(updated, userId);
  }

  async subscribe(channelId: string, userId: string) {
    const channel = await this.getChannelOrThrow(channelId);

    if (channel.accessType === ChatAccessType.paid) {
      throw new ForbiddenException('Paid channels require checkout first');
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

  async mockCheckout(channelId: string, userId: string) {
    const channel = await this.getChannelOrThrow(channelId);

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
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException('Channel post not found');
    }

    const discussionChatId = channel.linkedDiscussionChatId!;
    const message = await this.messagesService.createMessage(
      discussionChatId,
      userId,
      dto.msg_type ?? 'text',
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
