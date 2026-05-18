import { MailboxService } from './mailbox.service';
import { ChatType } from '@prisma/client';

describe('MailboxService', () => {
  it('markMailboxDelivered clears mailbox TTL only (keeps message body)', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({
      id: 'm1',
      senderId: 'alice',
      mailboxExpiresAt: new Date('2099-01-01'),
      chat: { chatType: ChatType.private, members: [{ userId: 'bob' }, { userId: 'alice' }] },
    });
    const prisma = { message: { findUnique, update } } as never;
    const realtime = {} as never;
    const tryDeleteServerStoredUpload = jest.fn();
    const upload = { tryDeleteServerStoredUpload } as never;
    const svc = new MailboxService(prisma, realtime, upload);

    await svc.markMailboxDelivered('m1', 'bob');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { mailboxExpiresAt: null },
    });
    expect(tryDeleteServerStoredUpload).not.toHaveBeenCalled();
  });

  it('markMailboxDelivered no-ops for non-private chats', async () => {
    const update = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({
      id: 'm1',
      senderId: 'alice',
      mailboxExpiresAt: new Date('2099-01-01'),
      chat: { chatType: ChatType.group, members: [{ userId: 'bob' }, { userId: 'alice' }] },
    });
    const prisma = { message: { findUnique, update } } as never;
    const svc = new MailboxService(prisma, {} as never, {} as never);

    await svc.markMailboxDelivered('m1', 'bob');

    expect(update).not.toHaveBeenCalled();
  });

  it('pruneExpiredMailboxMessages clears expired mailbox rows', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { message: { updateMany, findMany } } as never;
    const realtime = {} as never;
    const upload = { tryDeleteServerStoredUpload: jest.fn() } as never;
    const svc = new MailboxService(prisma, realtime, upload);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));

    await svc.pruneExpiredMailboxMessages();

    expect(findMany).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        mailboxExpiresAt: { not: null, lt: new Date('2026-05-07T12:00:00.000Z') },
        isDeleted: false,
      },
      data: { isDeleted: true, content: null, mailboxExpiresAt: null },
    });

    jest.useRealTimers();
  });

  it('pruneExpiredMailboxMessages calls upload cleanup for each expired message media', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest.fn().mockResolvedValue([{ id: 'exp-1' }]);
    const findUnique = jest.fn().mockResolvedValue({
      media: [
        { remoteUrl: '/uploads/a.bin', thumbnailUrl: '/uploads/th-a.bin' },
        { remoteUrl: null, thumbnailUrl: null },
      ],
    });
    const prisma = { message: { updateMany, findMany, findUnique } } as never;
    const realtime = {} as never;
    const tryDeleteServerStoredUpload = jest.fn().mockResolvedValue(undefined);
    const upload = { tryDeleteServerStoredUpload } as never;
    const svc = new MailboxService(prisma, realtime, upload);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));

    await svc.pruneExpiredMailboxMessages();

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'exp-1' },
      include: { media: true },
    });
    expect(tryDeleteServerStoredUpload).toHaveBeenCalledWith('/uploads/a.bin');
    expect(tryDeleteServerStoredUpload).toHaveBeenCalledWith('/uploads/th-a.bin');
    expect(updateMany).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
