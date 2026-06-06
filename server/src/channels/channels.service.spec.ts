import { Prisma } from '@prisma/client';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RelayPolicyConfig } from '../config';

describe('ChannelsService', () => {
  // Use ts-ignore or explicit types to appease linting without changing much
  let service: ChannelsService;
  let prisma: PrismaService;
  let messagesService: MessagesService;
  let realtimeService: RealtimeService;
  let relayPolicy: RelayPolicyConfig;

  beforeEach(() => {
    prisma = {
      channelPostView: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        create: jest.fn(),
      },
      message: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      chat: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;

    messagesService = {} as unknown as MessagesService;
    realtimeService = {} as unknown as RealtimeService;
    relayPolicy = {} as unknown as RelayPolicyConfig;

    service = new ChannelsService(
      prisma,
      messagesService,
      realtimeService,
      relayPolicy,
    );
  });

  describe('markChannelPostsViewed', () => {
    const channelId = 'channel-1';
    const userId = 'user-1';

    it('returns empty set if input is empty', async () => {
      const res = await (service as any).markChannelPostsViewed(
        channelId,
        userId,
        [],
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.size).toBe(0);
      expect(prisma.channelPostView.findMany).not.toHaveBeenCalled();
    });

    it('filters out empty values and returns empty set if unique is empty', async () => {
      const res = await (service as any).markChannelPostsViewed(
        channelId,
        userId,
        ['', undefined, null],
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.size).toBe(0);
      expect(prisma.channelPostView.findMany).not.toHaveBeenCalled();
    });

    it('increments viewCount and creates views for new posts', async () => {
      const postIds = ['post1', 'post2'];

      (prisma.channelPostView.findMany as jest.Mock).mockResolvedValue([]);

      const res = await (service as any).markChannelPostsViewed(
        channelId,
        userId,
        postIds,
      );

      expect(prisma.channelPostView.findMany).toHaveBeenCalledWith({
        where: { userId, messageId: { in: postIds } },
        select: { messageId: true },
      });

      expect(prisma.channelPostView.createMany).toHaveBeenCalledWith({
        data: [
          { messageId: 'post1', userId },
          { messageId: 'post2', userId },
        ],
        skipDuplicates: true,
      });

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: postIds },
          chatId: channelId,
          isChannelPost: true,
          isDeleted: false,
        },
        data: {
          viewCount: { increment: 1 },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.size).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      expect(res.has('post1')).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      expect(res.has('post2')).toBe(true);
    });

    it('does not increment or recreate views for already viewed posts', async () => {
      const postIds = ['post1', 'post2', 'post3'];

      (prisma.channelPostView.findMany as jest.Mock).mockResolvedValue([
        { messageId: 'post1' },
        { messageId: 'post3' },
      ]);

      const res = await (service as any).markChannelPostsViewed(
        channelId,
        userId,
        postIds,
      );

      expect(prisma.channelPostView.createMany).toHaveBeenCalledWith({
        data: [{ messageId: 'post2', userId }],
        skipDuplicates: true,
      });

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['post2'] },
          chatId: channelId,
          isChannelPost: true,
          isDeleted: false,
        },
        data: {
          viewCount: { increment: 1 },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.size).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      expect(res.has('post2')).toBe(true);
    });

    it('returns empty set and catches P2021/P2022 gracefully', async () => {
      const postIds = ['post1'];

      (prisma.channelPostView.findMany as jest.Mock).mockResolvedValue([]);

      const error = new Prisma.PrismaClientKnownRequestError(
        'Table not found',
        {
          code: 'P2021',
          clientVersion: 'x',
        },
      );
      (prisma.channelPostView.createMany as jest.Mock).mockRejectedValue(error);

      const res = await (service as any).markChannelPostsViewed(
        channelId,
        userId,
        postIds,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.size).toBe(0);
      expect(prisma.channelPostView.createMany).toHaveBeenCalled();
      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('returns empty set and catches unexpected errors gracefully', async () => {
      const postIds = ['post1'];

      (prisma.channelPostView.findMany as jest.Mock).mockResolvedValue([]);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const error = new Error('Unexpected');
      (prisma.channelPostView.createMany as jest.Mock).mockRejectedValue(error);

      const res = await (service as any).markChannelPostsViewed(
        channelId,
        userId,
        postIds,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.size).toBe(0);
      expect(prisma.channelPostView.createMany).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[channels.service] markChannelPostsViewed batch failed:',
        error,
      );

      warnSpy.mockRestore();
    });
  });
});
