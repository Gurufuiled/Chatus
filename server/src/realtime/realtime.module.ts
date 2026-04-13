import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [PrismaModule],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
