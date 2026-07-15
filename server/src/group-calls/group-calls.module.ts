import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatsModule } from '../chats/chats.module';
import {
  ChatGroupCallsController,
  GroupCallsController,
} from './group-calls.controller';
import { GroupCallsService } from './group-calls.service';
import { LivekitWebhookController } from './livekit-webhook.controller';

@Module({
  imports: [PrismaModule, AuthModule, MessagesModule, RealtimeModule, ChatsModule],
  controllers: [
    ChatGroupCallsController,
    GroupCallsController,
    LivekitWebhookController,
  ],
  providers: [GroupCallsService],
  exports: [GroupCallsService],
})
export class GroupCallsModule {}
