import { randomUUID } from 'node:crypto';
import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  MessageType,
  MediaType,
  MessageStatus,
  Transport,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapMessage, type MappedMessage } from '../common/mappers';

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
  MessageType.file,
];

export interface CreateMessageMedia {
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

export interface CreateForwardMetadata {
  forwarded_from_message_id?: string | null;
  forwarded_from_name?: string | null;
  forwarded_from_chat_id?: string | null;
  forwarded_from_sender_id?: string | null;
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

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

  private serializeWaveform(waveform?: number[]): Uint8Array | null {
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
    return new Uint8Array(buffer);
  }

  async createMessage(
    chatId: string,
    senderId: string,
    msgType: string,
    content: string | null,
    media?: CreateMessageMedia,
    replyToId?: string | null,
    forwardedFrom?: CreateForwardMetadata,
  ): Promise<MappedMessage> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: senderId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this chat');
    }

    const prismaMsgType = this.toMessageType(msgType);

    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          id: randomUUID(),
          chatId,
          senderId,
          msgType: prismaMsgType,
          content,
          replyToId: replyToId ?? null,
          forwardedFromMessageId: forwardedFrom?.forwarded_from_message_id ?? null,
          forwardedFromName: forwardedFrom?.forwarded_from_name ?? null,
          forwardedFromChatId: forwardedFrom?.forwarded_from_chat_id ?? null,
          forwardedFromSenderId: forwardedFrom?.forwarded_from_sender_id ?? null,
          status: MessageStatus.sent,
          transport: Transport.websocket,
        },
      });

      if (media && prismaMsgType !== MessageType.text) {
        const mediaType =
          MSG_TYPE_TO_MEDIA_TYPE[prismaMsgType] ?? MediaType.file;
        const waveformBytes =
          this.serializeWaveform(media.waveform) as Parameters<
            typeof tx.media.create
          >[0]['data']['waveform'];
        const mediaData: Parameters<typeof tx.media.create>[0]['data'] = {
          id: randomUUID(),
          messageId: message.id,
          mediaType,
          remoteUrl: media.url ?? null,
          fileName: media.file_name ?? null,
          mimeType: media.mime_type ?? null,
          fileSize: media.file_size ?? null,
          width: media.width ?? null,
          height: media.height ?? null,
          durationMs: media.duration_ms ?? null,
          thumbnailUrl: media.thumbnail_url ?? media.thumbnail_path ?? null,
          waveform: waveformBytes,
          isRound: media.is_round ?? false,
        };
        await tx.media.create({ data: mediaData });
      }

      const preview = this.buildLastMessagePreview(
        prismaMsgType,
        content,
        media,
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
      include: { media: true },
    });
    return mapMessage(withMedia!, { includeMedia: true });
  }

  async deleteMessage(chatId: string, messageId: string, userId: string): Promise<MappedMessage> {
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, chatId },
      include: { media: true },
    });
    if (!existing) {
      throw new ForbiddenException('Message not found');
    }
    if (existing.senderId !== userId) {
      throw new ForbiddenException('Cannot delete another user message');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.message.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          content: null,
        },
        include: { media: true },
      });

      const chat = await tx.chat.findUnique({
        where: { id: chatId },
        select: { lastMessageId: true, pinnedMessageId: true },
      });

      if (chat?.lastMessageId === messageId) {
        await tx.chat.update({
          where: { id: chatId },
          data: {
            lastMessagePreview: 'Deleted message',
          },
        });
      }

      if (chat?.pinnedMessageId === messageId) {
        await tx.chat.update({
          where: { id: chatId },
          data: {
            pinnedMessageId: null,
          },
        });
      }

      return next;
    });

    return mapMessage(updated, { includeMedia: true });
  }

  async updateMessageStatus(
    chatId: string,
    messageId: string,
    actorUserId: string,
    status: 'delivered' | 'read',
  ): Promise<MappedMessage | null> {
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, chatId },
      include: { media: true },
    });
    if (!existing) {
      return null;
    }
    if (existing.senderId === actorUserId) {
      return mapMessage(existing, { includeMedia: true });
    }

    const nextStatus =
      status === 'read' ? MessageStatus.read : MessageStatus.delivered;
    if (this.getStatusRank(nextStatus) <= this.getStatusRank(existing.status)) {
      return mapMessage(existing, { includeMedia: true });
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { status: nextStatus },
      include: { media: true },
    });

    return mapMessage(updated, { includeMedia: true });
  }

  private toMessageType(msgType: string): MessageType {
    const normalized = msgType.toLowerCase();
    if (VALID_MSG_TYPES.includes(normalized as MessageType)) {
      return normalized as MessageType;
    }
    return MessageType.text;
  }

  private buildLastMessagePreview(
    msgType: MessageType,
    content: string | null,
    media?: CreateMessageMedia,
  ): string {
    const maxLen = 100;
    if (msgType === MessageType.text && content) {
      return content.length <= maxLen
        ? content
        : content.slice(0, maxLen) + '…';
    }
    const placeholders: Record<MessageType, string> = {
      [MessageType.text]: '',
      [MessageType.image]: 'Photo',
      [MessageType.voice]: 'Voice message',
      [MessageType.video_note]: 'Video note',
      [MessageType.video]: 'Video',
      [MessageType.file]: media?.file_name ?? 'File',
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
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this chat');
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
      include: { media: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.map((m) => mapMessage(m, { includeMedia: true }));
  }
}
