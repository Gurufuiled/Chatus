import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dateToUnixMs } from '../common/mappers';
import type { PeerContactCustomization } from '@prisma/client';

export type MappedPeerContact = {
  peer_user_id: string;
  first_name: string | null;
  last_name: string | null;
  note: string | null;
  updated_at: number;
};

function mapPeerContact(row: PeerContactCustomization): MappedPeerContact {
  return {
    peer_user_id: row.peerUserId,
    first_name: row.firstName ?? null,
    last_name: row.lastName ?? null,
    note: row.note ?? null,
    updated_at: dateToUnixMs(row.updatedAt) ?? 0,
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class PeerContactService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerUserId: string): Promise<MappedPeerContact[]> {
    const rows = await this.prisma.peerContactCustomization.findMany({
      where: { ownerUserId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapPeerContact);
  }

  async getOne(
    ownerUserId: string,
    peerUserId: string,
  ): Promise<MappedPeerContact | null> {
    const row = await this.prisma.peerContactCustomization.findUnique({
      where: {
        ownerUserId_peerUserId: { ownerUserId, peerUserId },
      },
    });
    return row ? mapPeerContact(row) : null;
  }

  async upsert(
    ownerUserId: string,
    peerUserId: string,
    input: {
      first_name?: string | null;
      last_name?: string | null;
      note?: string | null;
    },
  ): Promise<MappedPeerContact | null> {
    if (!peerUserId.trim()) {
      throw new BadRequestException('peer_user_id is required');
    }
    if (peerUserId === ownerUserId) {
      throw new BadRequestException('cannot customize own profile via peer contacts');
    }

    const peer = await this.prisma.user.findUnique({
      where: { id: peerUserId },
      select: { id: true },
    });
    if (!peer) {
      throw new NotFoundException('peer user not found');
    }

    const nextFirst =
      input.first_name !== undefined
        ? (normalizeOptionalText(input.first_name) ?? null)
        : undefined;
    const nextLast =
      input.last_name !== undefined
        ? (normalizeOptionalText(input.last_name) ?? null)
        : undefined;
    const nextNote =
      input.note !== undefined ? (normalizeOptionalText(input.note) ?? null) : undefined;

    const hasAnyField =
      nextFirst !== undefined || nextLast !== undefined || nextNote !== undefined;
    if (!hasAnyField) {
      return this.getOne(ownerUserId, peerUserId);
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.peerContactCustomization.findUnique({
        where: {
          ownerUserId_peerUserId: { ownerUserId, peerUserId },
        },
      });

      if (!existing) {
        const createFirst = nextFirst ?? null;
        const createLast = nextLast ?? null;
        const createNote = nextNote ?? null;
        if (!createFirst && !createLast && !createNote) {
          return null;
        }
        const created = await tx.peerContactCustomization.create({
          data: {
            ownerUserId,
            peerUserId,
            firstName: createFirst,
            lastName: createLast,
            note: createNote,
          },
        });
        return mapPeerContact(created);
      }

      const updated = await tx.peerContactCustomization.update({
        where: { id: existing.id },
        data: {
          ...(nextFirst !== undefined ? { firstName: nextFirst } : {}),
          ...(nextLast !== undefined ? { lastName: nextLast } : {}),
          ...(nextNote !== undefined ? { note: nextNote } : {}),
        },
      });

      if (!updated.firstName && !updated.lastName && !updated.note) {
        await tx.peerContactCustomization.delete({ where: { id: updated.id } });
        return null;
      }

      return mapPeerContact(updated);
    });
  }

  async delete(ownerUserId: string, peerUserId: string): Promise<void> {
    const row = await this.prisma.peerContactCustomization.findUnique({
      where: {
        ownerUserId_peerUserId: { ownerUserId, peerUserId },
      },
    });
    if (!row) return;
    await this.prisma.peerContactCustomization.delete({ where: { id: row.id } });
  }
}
