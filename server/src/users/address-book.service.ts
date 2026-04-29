import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dateToUnixMs } from '../common/mappers';
import type { AddressBookContact } from '@prisma/client';

export type MappedAddressBookContact = {
  id: string;
  owner_user_id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  linked_user_id: string | null;
  created_at: number;
  updated_at: number;
};

function mapContact(row: AddressBookContact): MappedAddressBookContact {
  return {
    id: row.id,
    owner_user_id: row.ownerUserId,
    phone: row.phone,
    first_name: row.firstName ?? null,
    last_name: row.lastName ?? null,
    linked_user_id: row.linkedUserId ?? null,
    created_at: dateToUnixMs(row.createdAt) ?? 0,
    updated_at: dateToUnixMs(row.updatedAt) ?? 0,
  };
}

/** Normalize for uniqueness: digits only (E.164-style compare). */
export function normalizePhoneKey(raw: string): string {
  return raw.replace(/\D/g, '');
}

@Injectable()
export class AddressBookService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerUserId: string): Promise<MappedAddressBookContact[]> {
    const rows = await this.prisma.addressBookContact.findMany({
      where: { ownerUserId },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { phone: 'asc' }],
    });
    return rows.map(mapContact);
  }

  private async findLinkedUserByPhone(
    key: string,
    excludeUserId: string,
  ): Promise<{ id: string } | null> {
    const users = await this.prisma.user.findMany({
      where: { phone: { not: null }, NOT: { id: excludeUserId } },
      select: { id: true, phone: true },
      take: 2000,
    });
    const hit = users.find(
      (u) => u.phone && normalizePhoneKey(u.phone) === key,
    );
    return hit ? { id: hit.id } : null;
  }

  async create(
    ownerUserId: string,
    input: { phone: string; first_name?: string; last_name?: string },
  ): Promise<MappedAddressBookContact> {
    const key = normalizePhoneKey(input.phone);
    if (key.length < 6) {
      throw new BadRequestException('phone is too short');
    }
    /** Canonical digits-only (matches DTO transform); keeps @@unique(owner, phone) stable. */
    const stored = key.slice(0, 40);

    const linked = await this.findLinkedUserByPhone(key, ownerUserId);

    try {
      const row = await this.prisma.addressBookContact.create({
        data: {
          ownerUserId,
          phone: stored,
          firstName: input.first_name?.trim() || null,
          lastName: input.last_name?.trim() || null,
          linkedUserId: linked?.id ?? null,
        },
      });
      return mapContact(row);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: string }).code)
          : '';
      if (code === 'P2002') {
        throw new ConflictException('contact with this phone already exists');
      }
      throw e;
    }
  }

  async delete(ownerUserId: string, contactId: string): Promise<void> {
    const row = await this.prisma.addressBookContact.findFirst({
      where: { id: contactId, ownerUserId },
    });
    if (!row) {
      throw new NotFoundException('contact not found');
    }
    await this.prisma.addressBookContact.delete({ where: { id: contactId } });
  }
}
