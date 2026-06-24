import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Transport, ChatType } from '@prisma/client';
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

    this.log.log(
      `Delivering ${messages.length} mailbox messages to userId=${userId}`,
    );

    for (const msg of messages) {
      const mapped = mapMessage(msg, {
        includeMedia: true,
        includeReactions: true,
      });
      this.realtime.sendToUser(
        userId,
        JSON.stringify({
          type: 'mailbox_deliver',
          message: mapped,
        }),
      );
    }
  }

  /**
   * Получатель подтвердил `mailbox_deliver`. Снимаем только «почтовый» TTL — строка
   * остаётся в истории чата (текст и ссылки на медиа в БД не трогаем). Файлы с диска
   * здесь не удаляем: иначе в ленте останутся битые URL. Очистка загрузок — в
   * `pruneExpiredMailboxMessages` для сообщений, которые реально протухли без ack.
   */
  async markMailboxDelivered(messageId: string, userId: string): Promise<void> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chat: {
          select: {
            chatType: true,
            members: { select: { userId: true } },
          },
        },
      },
    });
    if (!msg) return;
    if (msg.chat.chatType !== ChatType.private) return;
    const isMember = msg.chat.members.some((m) => m.userId === userId);
    if (!isMember || msg.senderId === userId) return;
    if (msg.mailboxExpiresAt == null) return;

    await this.prisma.message.update({
      where: { id: messageId },
      data: { mailboxExpiresAt: null },
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
    await Promise.all(
      expired.map((row) => this.deleteMailboxUploadFilesForMessage(row.id)),
    );
    const result = await this.prisma.message.deleteMany({
      where: {
        mailboxExpiresAt: { not: null, lt: now },
        isDeleted: false,
      },
    });
    if (result.count > 0) {
      this.log.log(`Hard-deleted ${result.count} expired mailbox messages`);
    }
  }

  private async deleteMailboxUploadFilesForMessage(
    messageId: string,
  ): Promise<void> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { media: true },
    });
    if (!msg?.media?.length) return;
    await Promise.all(
      msg.media.flatMap((m) => [
        this.uploadService.tryDeleteServerStoredUpload(m.remoteUrl),
        this.uploadService.tryDeleteServerStoredUpload(m.thumbnailUrl),
      ]),
    );
  }
}
