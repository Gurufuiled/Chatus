import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PushService } from '../push/push.service';
import {
  ChatMemberRole,
  ChatType,
  MediaType,
  MessageStatus,
  MessageType,
  Prisma,
  SubscriptionStatus,
  Transport,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_RELATIONS_INCLUDE } from '../common/message-include';
import {
  mapMessage,
  type MappedMessage,
  type MappedMessageReaction,
} from '../common/mappers';

const MSG_TYPE_TO_MEDIA_TYPE: Record<string, MediaType> = {
  voice: MediaType.voice,
  image: MediaType.image,
  video_note: MediaType.video_note,
  video: MediaType.video,
  file: MediaType.file,
};

const VALID_MSG_TYPES: MessageType[] = [
  MessageType.text,
  MessageType.image,
  MessageType.voice,
  MessageType.video_note,
  MessageType.video,
  MessageType.file,
];

const MESSAGE_INCLUDE = MESSAGE_RELATIONS_INCLUDE;

export interface CreateMessageMedia {
  media_type?: string;
  url?: string;
  duration_ms?: number;
  waveform?: number[];
  thumbnail_url?: string;
  thumbnail_path?: string;
  is_round?: boolean;
  width?: number;
  height?: number;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export type CreateMessageMediaInput = CreateMessageMedia | CreateMessageMedia[];

export interface CreateForwardMetadata {
  forwarded_from_message_id?: string | null;
  forwarded_from_name?: string | null;
  forwarded_from_chat_id?: string | null;
  forwarded_from_sender_id?: string | null;
}

export interface CreateMessageOptions {
  threadRootMessageId?: string | null;
  isChannelPost?: boolean;
  transport?: Transport;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  private getStatusRank(status: MessageStatus): number {
    switch (status) {
      case MessageStatus.pending:
        return 0;
      case MessageStatus.sent:
        return 1;
      case MessageStatus.delivered:
        return 2;
      case MessageStatus.read:
        return 3;
      default:
        return 0;
    }
  }

  private serializeWaveform(waveform?: number[]): Uint8Array<ArrayBuffer> | null {
    if (!Array.isArray(waveform) || waveform.length === 0) {
      return null;
    }

    const normalized = waveform.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    if (normalized.length === 0) {
      return null;
    }

    const encoded = new TextEncoder().encode(JSON.stringify(normalized));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    );
    return new Uint8Array(buffer as ArrayBuffer);
  }

  private async ensureChatMember(
    chatId: string,
    userId: string,
  ) {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this chat');
    }
    return member;
  }

  private async ensureChannelPublisher(
    channelId: string,
    userId: string,
  ) {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: channelId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this channel');
    }
    if (
      member.accessStatus === SubscriptionStatus.canceled &&
      member.role === ChatMemberRole.member
    ) {
      throw new ForbiddenException('You are banned from this channel');
    }
    if (member.role !== ChatMemberRole.owner && member.role !== ChatMemberRole.admin) {
      throw new ForbiddenException('Only channel admins can publish posts');
    }
    if (member.role === ChatMemberRole.admin) {
      const raw = (member.tag ?? '').trim();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { can_post?: boolean } | null;
          if (parsed && parsed.can_post === false) {
            throw new ForbiddenException('Insufficient permissions to publish posts');
          }
        } catch (error) {
          if (error instanceof ForbiddenException) {
            throw error;
          }
        }
      }
    }
    return member;
  }

  private async getMessageWithRelationsOrThrow(
    messageId: string,
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }

  private mapMessageForUser(
    message: Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>,
    currentUserId?: string,
  ): MappedMessage {
    return mapMessage(message, {
      includeMedia: true,
      includeReactions: true,
      currentUserId,
    });
  }

  async createMessage(
    chatId: string,
    senderId: string,
    msgType: string,
    content: string | null,
    media?: CreateMessageMediaInput,
    replyToId?: string | null,
    forwardedFrom?: CreateForwardMetadata,
    options?: CreateMessageOptions,
  ): Promise<MappedMessage> {
    await this.ensureChatMember(chatId, senderId);

    const prismaMsgType = this.toMessageType(msgType);
    const mediaItems = this.normalizeMediaItems(media);

    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          id: randomUUID(),
          chatId,
          senderId,
          msgType: prismaMsgType,
          content,
          replyToId: replyToId ?? null,
          threadRootMessageId: options?.threadRootMessageId ?? null,
          forwardedFromMessageId: forwardedFrom?.forwarded_from_message_id ?? null,
          forwardedFromName: forwardedFrom?.forwarded_from_name ?? null,
          forwardedFromChatId: forwardedFrom?.forwarded_from_chat_id ?? null,
          forwardedFromSenderId: forwardedFrom?.forwarded_from_sender_id ?? null,
          isChannelPost: options?.isChannelPost ?? false,
          status: MessageStatus.sent,
          transport: options?.transport ?? Transport.websocket,
        },
      });

      if (mediaItems.length > 0 && prismaMsgType !== MessageType.text) {
        const mediaData: Prisma.MediaCreateManyInput[] = mediaItems.map((item) => {
          const waveformBytes = this.serializeWaveform(item.waveform);
          return {
            id: randomUUID(),
            messageId: message.id,
            mediaType: this.toMediaType(item.media_type, prismaMsgType),
            remoteUrl: item.url ?? null,
            fileName: item.file_name ?? null,
            mimeType: item.mime_type ?? null,
            fileSize: item.file_size ?? null,
            width: item.width ?? null,
            height: item.height ?? null,
            durationMs: item.duration_ms ?? null,
            thumbnailUrl: item.thumbnail_url ?? item.thumbnail_path ?? null,
            waveform: waveformBytes,
            isRound: item.is_round ?? false,
          };
        });
        await tx.media.createMany({ data: mediaData });
      }

      const preview = this.buildLastMessagePreview(
        prismaMsgType,
        content,
        mediaItems,
      );
      await tx.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: message.id,
          lastMessageAt: message.createdAt,
          lastMessagePreview: preview,
        },
      });

      return message;
    });

    const withMedia = await this.prisma.message.findUnique({
      where: { id: result.id },
      include: MESSAGE_INCLUDE,
    });
    const mapped = this.mapMessageForUser(withMedia!, senderId);
    void this.pushService.notifyNewMessage(chatId, senderId).catch(() => undefined);
    return mapped;
  }

  async createChannelPost(
    channelId: string,
    senderId: string,
    msgType: string,
    content: string | null,
    media?: CreateMessageMediaInput,
  ): Promise<MappedMessage> {
    const channel = await this.prisma.chat.findUnique({
      where: { id: channelId },
      select: { id: true, chatType: true },
    });
    if (!channel || channel.chatType !== ChatType.channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.ensureChannelPublisher(channelId, senderId);
    return this.createMessage(channelId, senderId, msgType, content, media, null, undefined, {
      isChannelPost: true,
      transport: Transport.websocket,
    });
  }

  async deleteMessage(chatId: string, messageId: string, userId: string): Promise<MappedMessage> {
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, chatId },
      include: MESSAGE_INCLUDE,
    });
    if (!existing) {
      throw new ForbiddenException('Message not found');
    }
    if (existing.senderId !== userId) {
      throw new ForbiddenException('Cannot delete another user message');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findUnique({
        where: { id: chatId },
        select: { lastMessageId: true, pinnedMessageId: true },
      });

      const next = await tx.message.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          content: null,
        },
        include: MESSAGE_INCLUDE,
      });

      const chatUpdates: {
        lastMessageId?: string | null;
        lastMessageAt?: Date | null;
        lastMessagePreview?: string | null;
        pinnedMessageId?: string | null;
      } = {};

      if (chat?.lastMessageId === messageId) {
        const latestMessage = await tx.message.findFirst({
          where: {
            chatId,
            isDeleted: false,
          },
          include: {
            media: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        chatUpdates.lastMessageId = latestMessage?.id ?? null;
        chatUpdates.lastMessageAt = latestMessage?.createdAt ?? null;
        chatUpdates.lastMessagePreview = latestMessage
          ? this.buildLastMessagePreview(
              latestMessage.msgType,
              latestMessage.content,
              latestMessage.media[0]
                ? {
                    file_name: latestMessage.media[0].fileName ?? undefined,
                  }
                : undefined,
            )
          : null;
      }

      if (chat?.pinnedMessageId === messageId) {
        chatUpdates.pinnedMessageId = null;
      }

      if (Object.keys(chatUpdates).length > 0) {
        await tx.chat.update({
          where: { id: chatId },
          data: chatUpdates,
        });
      }

      return next;
    });

    return this.mapMessageForUser(updated, userId);
  }

  async updateMessageStatus(
    chatId: string,
    messageId: string,
    actorUserId: string,
    status: 'delivered' | 'read',
  ): Promise<MappedMessage | null> {
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, chatId },
      include: MESSAGE_INCLUDE,
    });
    if (!existing) {
      return null;
    }
    if (existing.senderId === actorUserId) {
      return this.mapMessageForUser(existing, actorUserId);
    }

    const nextStatus =
      status === 'read' ? MessageStatus.read : MessageStatus.delivered;
    if (this.getStatusRank(nextStatus) <= this.getStatusRank(existing.status)) {
      return this.mapMessageForUser(existing, actorUserId);
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { status: nextStatus },
      include: MESSAGE_INCLUDE,
    });

    return this.mapMessageForUser(updated, actorUserId);
  }

  async toggleReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<{
    chat_id: string;
    message_id: string;
    reactions: MappedMessageReaction[];
    channel_id?: string;
    post_id?: string;
    discussion_chat_id?: string;
  }> {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) {
      throw new BadRequestException('Emoji is required');
    }

    await this.ensureChatMember(chatId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatId, isDeleted: false },
      include: MESSAGE_INCLUDE,
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });

    if (existing && existing.emoji === normalizedEmoji) {
      await this.prisma.messageReaction.delete({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
      });
    } else if (existing) {
      await this.prisma.messageReaction.update({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        data: { emoji: normalizedEmoji },
      });
    } else {
      await this.prisma.messageReaction.create({
        data: {
          id: randomUUID(),
          messageId,
          userId,
          emoji: normalizedEmoji,
        },
      });
    }

    const updated = await this.getMessageWithRelationsOrThrow(messageId);
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { chatType: true },
    });

    let channelId: string | undefined;
    let postId: string | undefined;
    let discussionChatId: string | undefined;

    if (chat?.chatType === ChatType.channel && message.isChannelPost) {
      channelId = chatId;
      postId = messageId;
    } else if (chat?.chatType === ChatType.discussion && message.threadRootMessageId) {
      const parentChannel = await this.prisma.chat.findFirst({
        where: {
          chatType: ChatType.channel,
          linkedDiscussionChatId: chatId,
        },
        select: { id: true },
      });

      channelId = parentChannel?.id;
      postId = message.threadRootMessageId;
      discussionChatId = chatId;
    }

    return {
      chat_id: chatId,
      message_id: messageId,
      reactions:
        this.mapMessageForUser(updated, userId).reactions ?? [],
      ...(channelId ? { channel_id: channelId } : {}),
      ...(postId ? { post_id: postId } : {}),
      ...(discussionChatId ? { discussion_chat_id: discussionChatId } : {}),
    };
  }

  private toMessageType(msgType: string): MessageType {
    const normalized = msgType.toLowerCase();
    if (VALID_MSG_TYPES.includes(normalized as MessageType)) {
      return normalized as MessageType;
    }
    return MessageType.text;
  }

  private normalizeMediaItems(media?: CreateMessageMediaInput): CreateMessageMedia[] {
    if (!media) return [];
    return (Array.isArray(media) ? media : [media]).slice(0, 10);
  }

  private toMediaType(mediaType: string | undefined, fallbackMsgType: MessageType): MediaType {
    const normalized = mediaType?.toLowerCase();
    if (normalized && Object.values(MediaType).includes(normalized as MediaType)) {
      return normalized as MediaType;
    }
    return MSG_TYPE_TO_MEDIA_TYPE[fallbackMsgType] ?? MediaType.file;
  }

  private buildLastMessagePreview(
    msgType: MessageType,
    content: string | null,
    media?: CreateMessageMediaInput,
  ): string {
    const maxLen = 100;
    if (msgType === MessageType.text && content) {
      return content.length <= maxLen
        ? content
        : content.slice(0, maxLen) + '…';
    }
    const mediaCount = Array.isArray(media) ? media.length : media ? 1 : 0;
    if ((msgType === MessageType.image || msgType === MessageType.video) && mediaCount > 1) {
      return `${mediaCount} media`;
    }
    const placeholders: Record<MessageType, string> = {
      [MessageType.text]: '',
      [MessageType.image]: 'Photo',
      [MessageType.voice]: 'Voice message',
      [MessageType.video_note]: 'Video note',
      [MessageType.video]: 'Video',
      [MessageType.file]: Array.isArray(media)
        ? media[0]?.file_name ?? 'File'
        : media?.file_name ?? 'File',
      [MessageType.system]: '',
    };
    return placeholders[msgType] ?? 'Message';
  }

  async getMessagesForChat(
    chatId: string,
    userId: string,
    limit: number,
    before?: string,
  ): Promise<MappedMessage[]> {
    const member = await this.ensureChatMember(chatId, userId);

    if (
      member.accessStatus === SubscriptionStatus.pending ||
      member.accessStatus === SubscriptionStatus.expired ||
      member.accessStatus === SubscriptionStatus.canceled
    ) {
      throw new ForbiddenException('Channel subscription is not active');
    }

    const where: { chatId: string; createdAt?: { lt: Date } } = { chatId };
    if (before) {
      const beforeMsg = await this.prisma.message.findFirst({
        where: { id: before, chatId },
      });
      if (beforeMsg) {
        where.createdAt = { lt: beforeMsg.createdAt };
      }
    }

    const messages = await this.prisma.message.findMany({
      where,
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.map((message) => this.mapMessageForUser(message, userId));
  }
}
