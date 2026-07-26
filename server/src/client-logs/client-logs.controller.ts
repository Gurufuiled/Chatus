import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { CreateClientLogsDto } from './dto/create-client-logs.dto';

function safe(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, '[phone]')
    .replace(/\b\d{4,8}\b/g, '[code]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

@Controller('client-logs')
@UseGuards(JwtAuthGuard)
export class ClientLogsController {
  private readonly logger = new Logger(ClientLogsController.name);

  @Post()
  @HttpCode(202)
  create(@CurrentUser() user: User, @Body() dto: CreateClientLogsDto) {
    for (const line of dto.lines) {
      const data = safe(line.data, 2000);
      this.logger.log({
        event: 'client_tdlib',
        userId: user.id,
        platform: dto.platform,
        appVersion: dto.appVersion,
        ts: line.ts,
        level: line.level,
        message: safe(line.message, 400),
        ...(data ? { data } : {}),
      });
    }
    return { accepted: dto.lines.length };
  }
}
