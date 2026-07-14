import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { ClientLogsService } from './client-logs.service';
import { IngestClientLogsDto } from './dto/ingest-client-logs.dto';

@Controller('client-logs')
@UseGuards(JwtAuthGuard)
export class ClientLogsController {
  constructor(private readonly clientLogsService: ClientLogsService) {}

  @Post()
  async ingest(@CurrentUser() user: User, @Body() dto: IngestClientLogsDto) {
    return this.clientLogsService.ingest(user, dto);
  }
}
