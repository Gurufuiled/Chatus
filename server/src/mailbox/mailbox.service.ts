import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Transport } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { mapMessage } from '../common/mappers';
import { MESSAGE_RELATIONS_INCLUDE } from '../common/message-include';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class MailboxService {
  private readonly log = new Logger(MailboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly uploadService: UploadService,
  ) {}

  /** Push pending mailbox rows to a user who just opened the chat WebSocket. */
  async deliverPendingToUser(userId: string): Promise<void> {
    const now = new Date();
    const members = await this.prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = members.map((m) => m.chatId);
    if (chatIds.length === 0) return;

    const messages = await this.prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        isDeleted: false,
        mailboxExpiresAt: { not: null, gt: now },
        senderId: { not: userId },
        transport: Transport.websocket,
      },
      include: MESSAGE_RELATIONS_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (messages.length === 0) return;

    this.log.log(`Delivering ${messages.length} mailbox messages to userId=${userId}`);

    for (const msg of messages) {
      const mapped = mapMessage(msg, { includeMedia: true, includeReactions: true });
      this.realtime.sendToUser(
        userId,
        JSON.stringify({
          type: 'mailbox_deliver',
          message: mapped,
        }),
      );
    }
  }

  /** Called when client acknowledges `mailbox_deliver` (purge server-held body). */
  async markMailboxDelivered(messageId: string, userId: string): Promise<void> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: { include: { members: { select: { userId: true } } } } },
    });
    if (!msg) return;
    const isMember = msg.chat.members.some((m) => m.userId === userId);
    if (!isMember || msg.senderId === userId) return;
    if (msg.mailboxExpiresAt == null) return;

    await this.deleteMailboxUploadFilesForMessage(messageId);

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null, mailboxExpiresAt: null },
    });
  }

  /** Daily prune of expired mailbox rows (metadata tombstone). */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneExpiredMailboxMessages(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.message.findMany({
      where: {
        mailboxExpiresAt: { not: null, lt: now },
        isDeleted: false,
      },
      select: { id: true },
    });
    for (const row of expired) {
      await this.deleteMailboxUploadFilesForMessage(row.id);
    }
    const result = await this.prisma.message.updateMany({
      where: {
        mailboxExpiresAt: { not: null, lt: now },
        isDeleted: false,
      },
      data: { isDeleted: true, content: null, mailboxExpiresAt: null },
    });
    if (result.count > 0) {
      this.log.log(`Pruned ${result.count} expired mailbox messages`);
    }
  }

  private async deleteMailboxUploadFilesForMessage(messageId: string): Promise<void> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { media: true },
    });
    if (!msg?.media?.length) return;
    for (const m of msg.media) {
      await this.uploadService.tryDeleteServerStoredUpload(m.remoteUrl);
      await this.uploadService.tryDeleteServerStoredUpload(m.thumbnailUrl);
    }
  }
}
