import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    loginusId: 'loginus-sub-1',
    username: 'old@example.com',
    handle: null,
    displayName: 'Old',
    lastName: 'Name',
    avatarUrl: null,
    phone: null,
    bio: null,
    birthday: null,
    isOnline: false,
    lastSeen: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('AuthService.syncProfileFromInitData', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let prisma: PrismaService;
  const now = Math.floor(Date.now() / 1000);

  const validPayload = {
    sub: 'loginus-sub-1',
    email: 'jwt@example.com',
    firstName: 'Anna',
    lastName: 'Smirnova',
    aud: 'embedded_app',
    time: now,
  };

  beforeEach(() => {
    process.env.LOGINUS_EMBEDDED_SECRET = 'test-secret';
    jwtService = {
      verify: jest.fn().mockReturnValue(validPayload),
    } as unknown as JwtService;
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new AuthService(prisma, jwtService);
  });

  it('rejects when initData sub does not match authenticated user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ loginusId: 'other-sub' }),
    );

    await expect(
      service.syncProfileFromInitData('user-1', 'init-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('prefers JWT profile fields over conflicting body profile', async () => {
    const user = makeUser({
      displayName: 'Old',
      lastName: 'Name',
      username: 'old@example.com',
    });
    (prisma.user.findUnique as jest.Mock).mockImplementation(
      async (args: { where: { id?: string; username?: string; phone?: string } }) => {
        if (args.where.id === 'user-1') return user;
        return null;
      },
    );
    (prisma.user.update as jest.Mock).mockResolvedValue(
      makeUser({
        displayName: 'Anna',
        lastName: 'Smirnova',
        username: 'jwt@example.com',
      }),
    );

    const result = await service.syncProfileFromInitData('user-1', 'init-token', {
      firstName: 'Hacker',
      lastName: 'Evil',
      email: 'hacker@example.com',
    });

    expect(result.display_name).toBe('Anna');
    expect(result.last_name).toBe('Smirnova');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        displayName: 'Anna',
        lastName: 'Smirnova',
        username: 'jwt@example.com',
      },
    });
  });

  it('returns existing user without update when inbound profile is unchanged', async () => {
    const user = makeUser({
      displayName: 'Anna',
      lastName: 'Smirnova',
      username: 'jwt@example.com',
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);

    const result = await service.syncProfileFromInitData('user-1', 'init-token');

    expect(result.display_name).toBe('Anna');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('drops username update when email is already taken by another user', async () => {
    const user = makeUser({
      displayName: 'Anna',
      lastName: 'Smirnova',
      username: 'old@example.com',
    });
    (prisma.user.findUnique as jest.Mock).mockImplementation(
      async (args: { where: { id?: string; username?: string } }) => {
        if (args.where.id === 'user-1') return user;
        if (args.where.username === 'jwt@example.com') {
          return { id: 'other-user' };
        }
        return null;
      },
    );

    const result = await service.syncProfileFromInitData('user-1', 'init-token');

    expect(result.username).toBe('old@example.com');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
