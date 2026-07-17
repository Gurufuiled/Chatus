import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PeerContactService } from './peer-contact.service';

describe('PeerContactService', () => {
  const ownerId = 'owner-1';
  const peerId = 'peer-1';

  function makeService(tx: {
    findUnique: jest.Mock;
    create?: jest.Mock;
    update?: jest.Mock;
    delete?: jest.Mock;
  }) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: peerId }),
      },
      peerContactCustomization: {
        findUnique: tx.findUnique,
        create: tx.create ?? jest.fn(),
        update: tx.update ?? jest.fn(),
        delete: tx.delete ?? jest.fn(),
      },
      $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) =>
        fn({
          peerContactCustomization: {
            findUnique: tx.findUnique,
            create: tx.create ?? jest.fn(),
            update: tx.update ?? jest.fn(),
            delete: tx.delete ?? jest.fn(),
          },
        }),
      ),
    };
    return new PeerContactService(prisma as never);
  }

  it('rejects customizing self', async () => {
    const svc = makeService({ findUnique: jest.fn() });
    await expect(
      svc.upsert(ownerId, ownerId, { first_name: 'Me' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing peer user', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const svc = new PeerContactService(prisma as never);
    await expect(
      svc.upsert(ownerId, peerId, { first_name: 'A' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('note-only update does not rewrite names', async () => {
    const existing = {
      id: 'row-1',
      ownerUserId: ownerId,
      peerUserId: peerId,
      firstName: 'Анна',
      lastName: 'К',
      note: 'old',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const update = jest.fn().mockResolvedValue({
      ...existing,
      note: 'new note',
      updatedAt: new Date(),
    });
    const findUnique = jest.fn().mockResolvedValue(existing);
    const svc = makeService({ findUnique, update });

    const row = await svc.upsert(ownerId, peerId, { note: 'new note' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { note: 'new note' },
    });
    expect(row?.first_name).toBe('Анна');
    expect(row?.last_name).toBe('К');
    expect(row?.note).toBe('new note');
  });

  it('name-only update does not rewrite note', async () => {
    const existing = {
      id: 'row-1',
      ownerUserId: ownerId,
      peerUserId: peerId,
      firstName: 'Анна',
      lastName: null,
      note: 'keep me',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const update = jest.fn().mockResolvedValue({
      ...existing,
      firstName: 'Мария',
      lastName: 'П',
      updatedAt: new Date(),
    });
    const findUnique = jest.fn().mockResolvedValue(existing);
    const svc = makeService({ findUnique, update });

    const row = await svc.upsert(ownerId, peerId, {
      first_name: 'Мария',
      last_name: 'П',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { firstName: 'Мария', lastName: 'П' },
    });
    expect(row?.note).toBe('keep me');
  });

  it('clears row when all fields become empty', async () => {
    const existing = {
      id: 'row-1',
      ownerUserId: ownerId,
      peerUserId: peerId,
      firstName: 'Анна',
      lastName: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const update = jest.fn().mockResolvedValue({
      ...existing,
      firstName: null,
      lastName: null,
      note: null,
    });
    const del = jest.fn().mockResolvedValue(existing);
    const findUnique = jest.fn().mockResolvedValue(existing);
    const svc = makeService({ findUnique, update, delete: del });

    const row = await svc.upsert(ownerId, peerId, {
      first_name: null,
      last_name: null,
    });

    expect(del).toHaveBeenCalledWith({ where: { id: 'row-1' } });
    expect(row).toBeNull();
  });
});
