import { MailboxService } from './mailbox.service';

describe('MailboxService', () => {
  it('pruneExpiredMailboxMessages clears expired mailbox rows', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { message: { updateMany } } as never;
    const realtime = {} as never;
    const svc = new MailboxService(prisma, realtime);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));

    await svc.pruneExpiredMailboxMessages();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        mailboxExpiresAt: { not: null, lt: new Date('2026-05-07T12:00:00.000Z') },
        isDeleted: false,
      },
      data: { isDeleted: true, content: null, mailboxExpiresAt: null },
    });

    jest.useRealTimers();
  });
});
