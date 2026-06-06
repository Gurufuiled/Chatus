import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { dateToUnixMs, mapUser } from '../common/mappers';

const SESSION_TTL_MS = 15 * 60 * 1000;

/** Россия: +7 и 10 цифр национальной части (обычно с 9). */
export function normalizeRuMobileToE164(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 0) return null;
  let x = d;
  if (x.length === 11 && x.startsWith('8')) {
    x = `7${x.slice(1)}`;
  }
  if (x.length === 11 && x.startsWith('7')) {
    return `+${x}`;
  }
  if (x.length === 10 && x.startsWith('9')) {
    return `+7${x}`;
  }
  return null;
}

@Injectable()
export class PhoneChangeService {
  private readonly logger = new Logger(PhoneChangeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async request(
    userId: string,
    newPhoneRaw: string,
  ): Promise<{ session_id: string; expires_at: number; demo_code?: string }> {
    const newPhone = normalizeRuMobileToE164(newPhoneRaw);
    if (!newPhone) {
      throw new BadRequestException('Invalid phone number');
    }

    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) {
      throw new BadRequestException('User not found');
    }
    if (me.phone?.replace(/\D/g, '') === newPhone.replace(/\D/g, '')) {
      throw new BadRequestException('This is already your phone number');
    }

    const taken = await this.prisma.user.findFirst({
      where: { phone: newPhone, NOT: { id: userId } },
    });
    if (taken) {
      throw new ConflictException('Phone number is already in use');
    }

    await this.prisma.phoneChangeSession.deleteMany({ where: { userId } });

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const row = await this.prisma.phoneChangeSession.create({
      data: {
        userId,
        newPhone,
        code,
        expiresAt,
      },
    });

    if (process.env.PHONE_CHANGE_LOG_CODES !== '0') {
      this.logger.warn(
        `[phone-change] user=${userId} newPhone=${newPhone} code=${code} — SMS не подключён; в prod отключите лог (PHONE_CHANGE_LOG_CODES=0) и отправляйте код через провайдера`,
      );
    }

    const exposeCode =
      process.env.NODE_ENV !== 'production' || process.env.PHONE_CHANGE_EXPOSE_CODE === '1';

    return {
      session_id: row.id,
      expires_at: dateToUnixMs(row.expiresAt) ?? 0,
      ...(exposeCode ? { demo_code: code } : {}),
    };
  }

  async verify(
    userId: string,
    sessionId: string,
    code: string,
  ): Promise<ReturnType<typeof mapUser>> {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      throw new BadRequestException('Invalid code');
    }

    const row = await this.prisma.phoneChangeSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!row) {
      throw new BadRequestException('Session not found');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      await this.prisma.phoneChangeSession.delete({ where: { id: row.id } }).catch(() => undefined);
      throw new GoneException('Code expired');
    }
    if (row.code !== digits) {
      throw new BadRequestException('Wrong code');
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await tx.phoneChangeSession.deleteMany({ where: { userId } });
        return tx.user.update({
          where: { id: userId },
          data: { phone: row.newPhone },
        });
      });
      return mapUser(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Phone number is already in use');
      }
      throw e;
    }
  }

  /**
   * После успешной авторизации Telegram на клиенте: сохранить номер в профиль Chatus,
   * если телефона ещё нет (для моста Chatus → Telegram по номеру собеседника).
   */
  async syncPhoneIfEmpty(
    userId: string,
    phoneRaw: string,
  ): Promise<ReturnType<typeof mapUser>> {
    const phone = normalizeRuMobileToE164(phoneRaw);
    if (!phone) {
      throw new BadRequestException('Invalid phone number');
    }

    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) {
      throw new BadRequestException('User not found');
    }

    if (me.phone?.replace(/\D/g, '')) {
      return mapUser(me);
    }

    const taken = await this.prisma.user.findFirst({
      where: { phone, NOT: { id: userId } },
    });
    if (taken) {
      throw new ConflictException('Phone number is already in use');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { phone },
      });
      return mapUser(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Phone number is already in use');
      }
      throw e;
    }
  }
}
