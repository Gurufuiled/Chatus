import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesRetentionService } from './messages-retention.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { RelayPolicyModule } from '../config';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminModule } from '../admin/admin.module';
import { LineSyncModule } from '../linesync/linesync.module';

@Module({
  imports: [
    PrismaModule,
    PushModule,
    RelayPolicyModule,
    RealtimeModule,
    AdminModule,
    LineSyncModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesRetentionService],
  exports: [MessagesService],
})
export class MessagesModule {}
