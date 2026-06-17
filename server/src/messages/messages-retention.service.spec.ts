import { ChatType, MessageType } from '@prisma/client';
import { MessagesRetentionService } from './messages-retention.service';

describe('MessagesRetentionService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('pruneOldMessages does not query chats when retention disabled', async () => {
    delete process.env.MESSAGES_SERVER_RETENTION_ENABLED;
    const findMany = jest.fn();
    const prisma = { chat: { findMany } } as never;
    const svc = new MessagesRetentionService(prisma);

    await svc.pruneOldMessages();

    expect(findMany).not.toHaveBeenCalled();
  });

  it('pruneOldMessages skips when MESSAGES_SERVER_RETENTION_MAX_PER_CHAT < 2', async () => {
    process.env.MESSAGES_SERVER_RETENTION_ENABLED = '1';
    process.env.MESSAGES_SERVER_RETENTION_MAX_PER_CHAT = '1';
    const findMany = jest.fn();
    const prisma = { chat: { findMany } } as never;
    const svc = new MessagesRetentionService(prisma);

    await svc.pruneOldMessages();

    expect(findMany).not.toHaveBeenCalled();
  });

  it('pruneOldMessages deletes messages outside top-N and refreshes chat preview', async () => {
    process.env.MESSAGES_SERVER_RETENTION_ENABLED = 'true';
    process.env.MESSAGES_SERVER_RETENTION_MAX_PER_CHAT = '2';

    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'm4',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      msgType: MessageType.text,
      content: 'hello',
      media: [],
    });
    const chatUpdate = jest.fn().mockResolvedValue(undefined);
    const count = jest.fn().mockResolvedValue(4);
    const messageFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'm4' }, { id: 'm3' }]);

    const chatFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'chat-1', pinnedMessageId: null }]);
    const prisma = {
      chat: {
        findMany: chatFindMany,
        update: chatUpdate,
      },
      message: {
        findMany: messageFindMany,
        count,
        deleteMany,
        findFirst,
      },
      $executeRaw: executeRaw,
    } as never;

    const svc = new MessagesRetentionService(prisma);
    await svc.pruneOldMessages();

    expect(chatFindMany).toHaveBeenCalledWith({
      where: {
        chatType: {
          in: [ChatType.group, ChatType.channel, ChatType.discussion],
        },
      },
      select: { id: true, pinnedMessageId: true },
    });
    expect(messageFindMany).toHaveBeenCalledWith({
      where: { chatId: 'chat-1', isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { id: true },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-1',
        id: { notIn: ['m4', 'm3'] },
      },
    });
    expect(executeRaw).toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalled();
    expect(chatUpdate).toHaveBeenCalledWith({
      where: { id: 'chat-1' },
      data: {
        lastMessageId: 'm4',
        lastMessageAt: new Date('2026-01-04T00:00:00.000Z'),
        lastMessagePreview: 'hello',
      },
    });
  });

  it('pruneOldMessages keeps pinned id even if not in newest N slice', async () => {
    process.env.MESSAGES_SERVER_RETENTION_ENABLED = '1';
    process.env.MESSAGES_SERVER_RETENTION_MAX_PER_CHAT = '2';

    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'm5',
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
      msgType: MessageType.text,
      content: 'newest',
      media: [],
    });
    const messageFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'm5' }, { id: 'm4' }]);

    const chatFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'c1', pinnedMessageId: 'm-pin' }]);
    const prisma = {
      chat: {
        findMany: chatFindMany,
        update: jest.fn().mockResolvedValue(undefined),
      },
      message: {
        findMany: messageFindMany,
        count: jest.fn().mockResolvedValue(4),
        deleteMany,
        findFirst,
      },
      $executeRaw: executeRaw,
    } as never;

    const svc = new MessagesRetentionService(prisma);
    await svc.pruneOldMessages();

    const notIn = deleteMany.mock.calls[0][0].where.id.notIn as string[];
    expect(notIn).toHaveLength(3);
    expect(new Set(notIn)).toEqual(new Set(['m5', 'm4', 'm-pin']));
  });

  it('pruneOldMessages does not call deleteMany when total messages fit keep window', async () => {
    process.env.MESSAGES_SERVER_RETENTION_ENABLED = '1';
    process.env.MESSAGES_SERVER_RETENTION_MAX_PER_CHAT = '10';

    const deleteMany = jest.fn();
    const prisma = {
      chat: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'c1', pinnedMessageId: null }]),
        update: jest.fn(),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
        count: jest.fn().mockResolvedValue(2),
        deleteMany: deleteMany.mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(),
      },
      $executeRaw: jest.fn(),
    } as never;

    const svc = new MessagesRetentionService(prisma);
    await svc.pruneOldMessages();

    expect(deleteMany).not.toHaveBeenCalled();
  });
});
