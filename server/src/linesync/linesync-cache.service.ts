import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessageType, Prisma, SubscriptionStatus } from '@prisma/client';
import { RelayPolicyConfig } from '../config';
import { PrismaService } from '../prisma/prisma.service';

type CacheableMessage = {
  id: string;
  chatId: string;
  senderId: string;
  msgType: MessageType | string;
  content: string | null;
  replyToId: string | null;
  createdAt: Date;
  media?: Array<{
    id?: string;
    mediaType: string;
    fileSize: number | null;
    mimeType: string | null;
    sha256: string | null;
    remoteUrl: string | null;
  }>;
};

export type LineSyncCacheEventInput = {
  eventId: string;
  lineId: string;
  eventType: string;
  payloadJson: Prisma.InputJsonValue;
  createdAt?: Date;
  expiresAt?: Date | null;
};

export type LineSyncCacheEventDto = {
  event_id: string;
  line_id: string;
  event_type: string;
  payload_json: Prisma.JsonValue;
  created_at: string;
  expires_at: string | null;
};

function msgTypeToContentType(msgType: MessageType | string): string {
  switch (msgType) {
    case MessageType.text:
    case MessageType.image:
    case MessageType.voice:
    case MessageType.video_note:
    case MessageType.video:
    case MessageType.file:
      return msgType;
    default:
      return 'system';
  }
}

/** Matches mobile LineSync: mixed image+video albums use top-level `media_album`. */
function messageCreateContentTypeForCache(
  msgType: MessageType | string,
  media: CacheableMessage['media'] | undefined,
): string {
  const base = msgTypeToContentType(msgType);
  const usable =
    media?.filter((m) => m.sha256 && m.remoteUrl && m.fileSize != null) ?? [];
  if (usable.length < 2) {
    return base;
  }
  const kinds = new Set(usable.map((m) => mediaKindFromType(m.mediaType)));
  if (kinds.size > 1) {
    return 'media_album';
  }
  return base;
}

function messageEventId(messageId: string): string {
  return `msg:${messageId}`;
}

function mediaKindFromType(
  mediaType: string,
): 'image' | 'voice' | 'video_note' | 'video' | 'file' {
  if (
    mediaType === 'image' ||
    mediaType === 'voice' ||
    mediaType === 'video_note' ||
    mediaType === 'video'
  ) {
    return mediaType;
  }
  return 'file';
}

@Injectable()
export class LineSyncCacheService {
  private readonly logger = new Logger(LineSyncCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly relayPolicy: RelayPolicyConfig,
  ) {}

  async upsertEvent(input: LineSyncCacheEventInput): Promise<void> {
    const policy = this.relayPolicy.getLineSyncTailPolicy();
    const createdAt = input.createdAt ?? new Date();
    const expiresAt =
      input.expiresAt === undefined
        ? this.computeExpiresAt(createdAt, policy.ttlSeconds)
        : input.expiresAt;

    await this.prisma.lineSyncCacheEvent.upsert({
      where: { eventId: input.eventId },
      create: {
        eventId: input.eventId,
        lineId: input.lineId,
        eventType: input.eventType,
        payloadJson: input.payloadJson,
        createdAt,
        expiresAt,
      },
      update: {
        lineId: input.lineId,
        eventType: input.eventType,
        payloadJson: input.payloadJson,
        createdAt,
        expiresAt,
      },
    });

    await this.trimLine(input.lineId, policy.retainLastN);
  }

  async upsertMessageCreateEvent(message: CacheableMessage): Promise<void> {
    const eventId = messageEventId(message.id);
    const createdAtMs = message.createdAt.getTime();
    const payload: Prisma.InputJsonObject = {
      type: 'message.create',
      event_id: eventId,
      line_id: message.chatId,
      author_user_id: message.senderId,
      author_device_id: 'server-cache-node',
      created_at: createdAtMs,
      logical_clock: createdAtMs,
      parent_event_ids: [],
      content_type: messageCreateContentTypeForCache(
        message.msgType,
        message.media,
      ),
      signature: `unsigned:${eventId}`,
      ...(message.content != null ? { content: message.content } : {}),
      ...(message.replyToId
        ? { reply_to_event_id: messageEventId(message.replyToId) }
        : {}),
      ...(message.media?.length
        ? {
            blob_refs: message.media
              .filter(
                (media) =>
                  media.sha256 && media.remoteUrl && media.fileSize != null,
              )
              .map((media) => ({
                blob_id: `sha256:${media.sha256}`,
                kind: mediaKindFromType(media.mediaType),
                size_bytes: media.fileSize ?? 0,
                ...(media.mimeType ? { mime_type: media.mimeType } : {}),
                sha256: media.sha256!,
                locations: [{ type: 'server', url: media.remoteUrl! }],
              })),
          }
        : {}),
    };

    await this.upsertEvent({
      eventId,
      lineId: message.chatId,
      eventType: 'message.create',
      payloadJson: payload,
      createdAt: message.createdAt,
    });
  }

  async getTail(
    lineId: string,
    limit?: number,
  ): Promise<LineSyncCacheEventDto[]> {
    const policy = this.relayPolicy.getLineSyncTailPolicy();
    const take = Math.max(
      1,
      Math.min(limit ?? policy.retainLastN, policy.retainLastN),
    );
    const rows = await this.prisma.lineSyncCacheEvent.findMany({
      where: {
        lineId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return rows.reverse().map((row) => ({
      event_id: row.eventId,
      line_id: row.lineId,
      event_type: row.eventType,
      payload_json: row.payloadJson,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
    }));
  }

  async getTailForUser(
    lineId: string,
    userId: string,
    limit?: number,
  ): Promise<LineSyncCacheEventDto[]> {
    await this.assertLineAccess(lineId, userId);
    return this.getTail(lineId, limit);
  }

  async pruneExpired(now = new Date()): Promise<number> {
    const result = await this.prisma.lineSyncCacheEvent.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
    return result.count;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpiredCron(): Promise<void> {
    const count = await this.pruneExpired();
    if (count > 0) {
      this.logger.log(`Pruned ${count} expired LineSync cache event(s)`);
    }
  }

  private computeExpiresAt(createdAt: Date, ttlSeconds: number): Date | null {
    if (ttlSeconds <= 0) {
      return null;
    }
    return new Date(createdAt.getTime() + ttlSeconds * 1000);
  }

  private async assertLineAccess(
    lineId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: lineId, userId } },
      select: { accessStatus: true },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this line');
    }
    if (
      member.accessStatus === SubscriptionStatus.pending ||
      member.accessStatus === SubscriptionStatus.expired ||
      member.accessStatus === SubscriptionStatus.canceled
    ) {
      throw new ForbiddenException('Line access is not active');
    }
  }

  private async trimLine(lineId: string, retainLastN: number): Promise<void> {
    const keep = Math.max(1, retainLastN);
    const staleRows = await this.prisma.lineSyncCacheEvent.findMany({
      where: { lineId },
      orderBy: { createdAt: 'desc' },
      skip: keep,
      select: { eventId: true },
    });
    if (staleRows.length === 0) {
      return;
    }

    await this.prisma.lineSyncCacheEvent.deleteMany({
      where: {
        eventId: { in: staleRows.map((row) => row.eventId) },
      },
    });
  }
}
