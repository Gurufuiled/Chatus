import { Module } from '@nestjs/common';
import { MailboxService } from './mailbox.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, RealtimeModule, UploadModule],
  providers: [MailboxService],
  exports: [MailboxService],
})
export class MailboxModule {}
