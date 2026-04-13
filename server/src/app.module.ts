import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatsModule } from './chats/chats.module';
import { MessagesModule } from './messages/messages.module';
import { UploadModule } from './upload/upload.module';
import { WebsocketModule } from './websocket/websocket.module';
import { SignalingModule } from './signaling/signaling.module';
import { ChannelsModule } from './channels/channels.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    ChatsModule,
    MessagesModule,
    ChannelsModule,
    UploadModule,
    WebsocketModule,
    SignalingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
