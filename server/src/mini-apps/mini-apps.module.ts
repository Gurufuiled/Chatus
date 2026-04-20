import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { ChatsModule } from '../chats/chats.module';
import { MiniAppsService } from './mini-apps.service';
import { ChatusFatherService } from './chatus-father.service';
import { MiniAppsController } from './mini-apps.controller';

@Module({
  imports: [PrismaModule, AuthModule, MessagesModule, ChatsModule],
  controllers: [MiniAppsController],
  providers: [MiniAppsService, ChatusFatherService],
  exports: [MiniAppsService, ChatusFatherService],
})
export class MiniAppsModule {}
