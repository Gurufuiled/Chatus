import { Injectable } from '@nestjs/common';
import {
  FeedbackType,
  FeedbackStatus,
  type FeedbackEntry,
  type User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dateToUnixMs } from '../common/mappers';
import type { CreateFeedbackDto } from './dto/create-feedback.dto';

/** Пользователь с таким handle видит все баги и предложения (инбокс). */
export const FEEDBACK_INBOX_HANDLE = 'admin';

function isFeedbackInboxViewer(user: Pick<User, 'handle'>): boolean {
  return (user.handle ?? '').trim().toLowerCase() === FEEDBACK_INBOX_HANDLE;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateFeedbackDto) {
    const type =
      dto.type === 'bug' ? FeedbackType.bug : FeedbackType.suggestion;
    const attachmentUrl = dto.attachment_url?.trim();
    const row = await this.prisma.feedbackEntry.create({
      data: {
        type,
        title: dto.title.trim(),
        body: dto.body.trim(),
        attachmentUrl: attachmentUrl || null,
        authorId: userId,
        status: FeedbackStatus.open,
      },
      include: { author: true },
    });
    return this.map(row);
  }

  async list(viewer: User, typeFilter: 'bug' | 'suggestion') {
    const type =
      typeFilter === 'bug' ? FeedbackType.bug : FeedbackType.suggestion;
    const showAll = isFeedbackInboxViewer(viewer);
    const rows = await this.prisma.feedbackEntry.findMany({
      where: {
        type,
        ...(showAll ? {} : { authorId: viewer.id }),
      },
      orderBy: { createdAt: 'desc' },
      include: { author: true },
    });
    return rows.map((r) => this.map(r));
  }

  private map(row: FeedbackEntry & { author: User }) {
    return {
      id: row.id,
      type: row.type === FeedbackType.bug ? 'bug' : 'suggestion',
      status: row.status,
      title: row.title,
      body: row.body,
      attachmentUrl: row.attachmentUrl ?? null,
      authorId: row.authorId,
      createdAt: dateToUnixMs(row.createdAt) ?? 0,
      author: {
        id: row.author.id,
        displayName: row.author.displayName,
        handle: row.author.handle,
        avatarUrl: row.author.avatarUrl,
      },
    };
  }
}
