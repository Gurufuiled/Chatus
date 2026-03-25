import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapUser, type MappedUser } from '../common/mappers';
import type { User } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: Math.min(cappedLimit * 3, 50),
    });

    const normalizedNeedle = q.toLowerCase();
    const scored = users.map((user) => ({
      user,
      score: this.scoreSearchMatch(user, normalizedNeedle, searchingByHandle),
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
  ): number {
    const handle = user.handle?.toLowerCase() ?? '';
    const username = user.username?.toLowerCase() ?? '';
    const displayName = user.displayName?.toLowerCase() ?? '';

    let score = 0;

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
      avatar_url?: string;
      handle?: string;
    },
  ): Promise<MappedUser> {
    const updateData: {
      displayName?: string;
      avatarUrl?: string;
      handle?: string | null;
    } = {};
    if (data.display_name !== undefined) {
      updateData.displayName = data.display_name;
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
}
