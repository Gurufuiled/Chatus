import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, LimitPipe } from '../common';
import { LineSyncCacheService } from './linesync-cache.service';

@Controller('lines')
@UseGuards(JwtAuthGuard)
export class LineSyncController {
  constructor(private readonly lineSyncCacheService: LineSyncCacheService) {}

  @Get(':lineId/events/tail')
  async getTail(
    @Param('lineId') lineId: string,
    @CurrentUser() user: User,
    @Query('limit', new LimitPipe(1, 100, 10)) limit: number,
  ) {
    const events = await this.lineSyncCacheService.getTailForUser(lineId, user.id, limit);
    return {
      line_id: lineId,
      events,
    };
  }
}
