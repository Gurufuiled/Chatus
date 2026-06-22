import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { LoginusProfileClient } from '../auth/loginus-profile.client';
import { mapUser, type MappedUser } from '../common/mappers';
import { outboundProfileFromUser, isLocalUploadAvatarUrl } from '../auth/loginus-profile.util';
import type { User } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly loginusProfileClient: LoginusProfileClient,
  ) {}

  async getProfile(userId: string): Promise<MappedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return mapUser(user);
  }

  async getUserById(userId: string): Promise<MappedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return mapUser(user);
  }

  async searchUsers(
    currentUserId: string,
    query: string,
    limit = 20,
  ): Promise<MappedUser[]> {
    const rawQuery = query.trim();
    const searchingByHandle = rawQuery.startsWith('@');
    const q = rawQuery.replace(/^@+/, '');
    if (!q) {
      return [];
    }
    const cappedLimit = Math.max(1, Math.min(limit, 50));
    const digitNeedle = q.replace(/\D/g, '');
    const phoneSearch = digitNeedle.length >= 4;

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } },
          ...(phoneSearch
            ? [{ phone: { contains: digitNeedle, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      take: Math.min(cappedLimit * 4, 80),
    });

    const normalizedNeedle = q.toLowerCase();
    const scored = users.map((user) => ({
      user,
      score: this.scoreSearchMatch(
        user,
        normalizedNeedle,
        searchingByHandle,
        phoneSearch ? digitNeedle : undefined,
      ),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aName = (a.user.displayName ?? a.user.username ?? a.user.handle ?? '').toLowerCase();
      const bName = (b.user.displayName ?? b.user.username ?? b.user.handle ?? '').toLowerCase();
      return aName.localeCompare(bName);
    });

    return scored.slice(0, cappedLimit).map(({ user }) => mapUser(user));
  }

  private scoreSearchMatch(
    user: User,
    needle: string,
    searchingByHandle: boolean,
    digitNeedle?: string,
  ): number {
    const handle = user.handle?.toLowerCase() ?? '';
    const username = user.username?.toLowerCase() ?? '';
    const displayName = user.displayName?.toLowerCase() ?? '';

    let score = 0;

    if (digitNeedle && user.phone) {
      const p = user.phone.replace(/\D/g, '');
      if (p === digitNeedle) score += 650;
      else if (p.includes(digitNeedle)) score += 420;
    }

    if (handle === needle) score += searchingByHandle ? 1000 : 700;
    else if (handle.startsWith(needle)) score += searchingByHandle ? 850 : 550;
    else if (handle.includes(needle)) score += searchingByHandle ? 700 : 400;

    if (username === needle) score += 320;
    else if (username.startsWith(needle)) score += 220;
    else if (username.includes(needle)) score += 140;

    if (displayName === needle) score += 180;
    else if (displayName.startsWith(needle)) score += 120;
    else if (displayName.includes(needle)) score += 60;

    return score;
  }

  async updateProfile(
    userId: string,
    data: {
      display_name?: string;
      last_name?: string | null;
      bio?: string | null;
      birthday?: string | null;
      avatar_url?: string;
      handle?: string | null;
    },
  ): Promise<MappedUser> {
    const updateData: {
      displayName?: string;
      lastName?: string | null;
      bio?: string | null;
      birthday?: Date | null;
      avatarUrl?: string;
      handle?: string | null;
    } = {};
    if (data.display_name !== undefined) {
      updateData.displayName = data.display_name;
    }
    if (data.last_name !== undefined) {
      updateData.lastName =
        data.last_name === '' || data.last_name === null
          ? null
          : data.last_name;
    }
    if (data.bio !== undefined) {
      updateData.bio =
        data.bio === '' || data.bio === null ? null : data.bio ?? null;
    }
    if (data.birthday !== undefined) {
      if (data.birthday === '' || data.birthday === null) {
        updateData.birthday = null;
      } else {
        const d = new Date(`${data.birthday}T12:00:00.000Z`);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException('Invalid birthday');
        }
        updateData.birthday = d;
      }
    }
    if (data.avatar_url !== undefined) {
      updateData.avatarUrl = data.avatar_url;
    }
    if (data.handle !== undefined) {
      const isClearing = data.handle === null || data.handle === '';
      if (!isClearing) {
        const existing = await this.prisma.user.findFirst({
          where: {
            handle: { equals: data.handle, mode: 'insensitive' },
            id: { not: userId },
          },
        });
        if (existing) {
          throw new ConflictException('Handle is already taken');
        }
        updateData.handle = data.handle;
      } else {
        updateData.handle = null;
      }
    }
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
      await this.syncProfileToLoginusIfLinked(user);
      return mapUser(user);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Handle is already taken');
      }
      throw e;
    }
  }

  async registerPushToken(
    userId: string,
    expoToken: string,
    platform: 'android' | 'ios',
    fcmToken?: string,
  ): Promise<void> {
    await this.pushService.registerToken(userId, expoToken, platform, fcmToken);
  }

  async unregisterPushToken(
    userId: string,
    expoToken: string,
  ): Promise<void> {
    await this.pushService.unregisterToken(userId, expoToken);
  }

  private async syncProfileToLoginusIfLinked(user: User): Promise<void> {
    const outbound = outboundProfileFromUser(user);
    if (!outbound) return;
    if (
      user.avatarUrl &&
      isLocalUploadAvatarUrl(user.avatarUrl) &&
      !outbound.avatarUrl
    ) {
      console.warn(
        '[Users] Skip Loginus avatar sync: set PUBLIC_ORIGIN for absolute /uploads/ URLs',
      );
    }
    try {
      await this.loginusProfileClient.syncProfileToLoginus(outbound);
    } catch (err) {
      console.error('[Users] Loginus profile sync failed', err);
    }
  }
}
