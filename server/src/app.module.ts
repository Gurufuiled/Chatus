import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './logging/all-exceptions.filter';
import { LoggingModule } from './logging/logging.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatsModule } from './chats/chats.module';
import { MessagesModule } from './messages/messages.module';
import { UploadModule } from './upload/upload.module';
import { WebsocketModule } from './websocket/websocket.module';
import { SignalingModule } from './signaling/signaling.module';
import { ChannelsModule } from './channels/channels.module';
import { MiniAppsModule } from './mini-apps/mini-apps.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MailboxModule } from './mailbox/mailbox.module';
import { AdminModule } from './admin/admin.module';
import { LineSyncModule } from './linesync/linesync.module';

@Module({
  imports: [
    LoggingModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ChatsModule,
    MessagesModule,
    ChannelsModule,
    MiniAppsModule,
    FeedbackModule,
    UploadModule,
    ScheduleModule.forRoot(),
    MailboxModule,
    AdminModule,
    LineSyncModule,
    WebsocketModule,
    SignalingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
