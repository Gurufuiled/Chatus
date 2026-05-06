import { Module } from '@nestjs/common';
import { MailboxService } from './mailbox.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, RealtimeModule],
  providers: [MailboxService],
  exports: [MailboxService],
})
export class MailboxModule {}
