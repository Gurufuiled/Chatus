import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebsocketGateway } from './websocket.gateway';
import { MessagesModule } from '../messages/messages.module';
import { ChatsModule } from '../chats/chats.module';
import { ChannelsModule } from '../channels/channels.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MiniAppsModule } from '../mini-apps/mini-apps.module';
import { MailboxModule } from '../mailbox/mailbox.module';
import { LineSyncModule } from '../linesync/linesync.module';

@Module({
  imports: [
    ChatsModule,
    MessagesModule,
    ChannelsModule,
    RealtimeModule,
    MiniAppsModule,
    MailboxModule,
    LineSyncModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: {
        expiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '3600', 10),
      },
    }),
  ],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
