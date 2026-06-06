import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatType, MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Retention applies only to multi-participant / broadcast chat lines (not 1:1 private archive). */
const RETENTION_CHAT_TYPES: ChatType[] = [
  ChatType.group,
  ChatType.channel,
  ChatType.discussion,
];

function readBool(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean,
): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

function readPositiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const raw = env[key]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const n = parseInt(raw, 10);
  return n > 0 ? n : fallback;
}

/** Align with MessagesService preview for chat list after retention deletes. */
function previewFromStoredMessage(msg: {
  msgType: MessageType;
  content: string | null;
  media: { fileName: string | null }[];
}): string {
  const maxLen = 100;
  if (msg.msgType === MessageType.text && msg.content) {
    return msg.content.length <= maxLen
      ? msg.content
      : `${msg.content.slice(0, maxLen)}…`;
  }
  const mediaCount = msg.media?.length ?? 0;
  if (
    (msg.msgType === MessageType.image || msg.msgType === MessageType.video) &&
    mediaCount > 1
  ) {
    return `${mediaCount} media`;
  }
  const placeholders: Partial<Record<MessageType, string>> = {
    [MessageType.image]: 'Photo',
    [MessageType.voice]: 'Voice message',
    [MessageType.video_note]: 'Video note',
    [MessageType.video]: 'Video',
    [MessageType.file]: msg.media?.[0]?.fileName ?? 'File',
    [MessageType.system]: '',
    [MessageType.text]: '',
  };
  return placeholders[msg.msgType] ?? 'Message';
}

@Injectable()
export class MessagesRetentionService {
  private readonly log = new Logger(MessagesRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get retentionEnabled(): boolean {
    return readBool(process.env, 'MESSAGES_SERVER_RETENTION_ENABLED', false);
  }

  private get maxPerChat(): number {
    return readPositiveInt(
      process.env,
      'MESSAGES_SERVER_RETENTION_MAX_PER_CHAT',
      50,
    );
  }

  /** Ежедневный prune (время — локальное для процесса Node; см. `CronExpression.EVERY_DAY_AT_3AM`). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldMessages(): Promise<void> {
    if (!this.retentionEnabled) {
      return;
    }
    const maxPerChat = this.maxPerChat;
    if (maxPerChat < 2) {
      this.log.warn(
        `MESSAGES_SERVER_RETENTION_MAX_PER_CHAT=${maxPerChat} is invalid (< 2); skip retention prune`,
      );
      return;
    }

    const chats = await this.prisma.chat.findMany({
      where: { chatType: { in: RETENTION_CHAT_TYPES } },
      select: { id: true, pinnedMessageId: true },
    });

    let totalDeleted = 0;

    for (const chat of chats) {
      try {
        const deleted = await this.pruneChat(
          chat.id,
          chat.pinnedMessageId,
          maxPerChat,
        );
        totalDeleted += deleted;
      } catch (err) {
        this.log.warn(
          `Retention prune failed for chat ${chat.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (totalDeleted > 0) {
      this.log.log(
        `Messages retention: deleted ${totalDeleted} row(s); cap=${maxPerChat} per group/channel/discussion chat`,
      );
    }
  }

  /** @returns Number of deleted messages. */
  private async pruneChat(
    chatId: string,
    pinnedMessageId: string | null,
    maxPerChat: number,
  ): Promise<number> {
    const top = await this.prisma.message.findMany({
      where: { chatId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: maxPerChat,
      select: { id: true },
    });

    const keepIds = new Set(top.map((m) => m.id));
    if (pinnedMessageId) {
      keepIds.add(pinnedMessageId);
    }

    const keepArray = [...keepIds];
    if (keepArray.length === 0) {
      return 0;
    }

    const countBefore = await this.prisma.message.count({ where: { chatId } });
    if (countBefore <= keepArray.length) {
      return 0;
    }

    const del = await this.prisma.message.deleteMany({
      where: {
        chatId,
        id: { notIn: keepArray },
      },
    });

    if (del.count > 0) {
      await this.clearBrokenThreadRootsForChat(chatId);
      await this.syncChatLastMessage(chatId);
    }

    return del.count;
  }

  /** Null thread roots that pointed at hard-deleted messages (no FK on `thread_root_message_id`). */
  private async clearBrokenThreadRootsForChat(chatId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE messages AS m
      SET thread_root_message_id = NULL
      WHERE m.chat_id = ${chatId}
        AND m.thread_root_message_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM messages r WHERE r.id = m.thread_root_message_id
        )
    `;
  }

  private async syncChatLastMessage(chatId: string): Promise<void> {
    const latest = await this.prisma.message.findFirst({
      where: { chatId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: { media: true },
    });

    if (!latest) {
      await this.prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: null,
          lastMessageAt: null,
          lastMessagePreview: null,
        },
      });
      return;
    }

    const preview = previewFromStoredMessage(latest);

    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageId: latest.id,
        lastMessageAt: latest.createdAt,
        lastMessagePreview: preview,
      },
    });
  }
}
