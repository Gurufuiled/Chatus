import { Module } from '@nestjs/common';
import { RelayPolicyModule } from '../config';
import { PrismaModule } from '../prisma/prisma.module';
import { LineSyncCacheService } from './linesync-cache.service';
import { LineSyncController } from './linesync.controller';

@Module({
  imports: [PrismaModule, RelayPolicyModule],
  controllers: [LineSyncController],
  providers: [LineSyncCacheService],
  exports: [LineSyncCacheService],
})
export class LineSyncModule {}
