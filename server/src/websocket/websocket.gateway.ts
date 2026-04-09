import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { ChatsService } from '../chats/chats.service';

const WS_PORT = parseInt(process.env.WS_PORT ?? '4001', 10);

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
}

@WebSocketGateway(WS_PORT, { path: '/' })
@Injectable()
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  /** userId -> Set of WebSocket connections */
  private readonly userSockets = new Map<string, Set<AuthenticatedSocket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly messagesService: MessagesService,
    private readonly chatsService: ChatsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket, ...args: unknown[]) {
    const request = (args[0] as { url?: string })?.url;
    const url = new URL(request || '/', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      this.logger.warn('WS connection rejected: no token');
      client.close(4001, 'Missing token');
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        client.close(4002, 'User not found');
        return;
      }

      client.userId = payload.sub;
      let set = this.userSockets.get(payload.sub);
      if (!set) {
        set = new Set();
        this.userSockets.set(payload.sub, set);
      }
      set.add(client);

      const now = new Date();
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { isOnline: true, lastSeen: now },
      });

      this.broadcastPresence(payload.sub, true, now);
      this.logger.log(`User ${payload.sub} connected (WS)`);
    } catch {
      this.logger.warn('WS connection rejected: invalid token');
      client.close(4003, 'Invalid token');
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (!userId) return;

    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.userSockets.delete(userId);
        const lastSeen = new Date();
        this.prisma.user
          .update({
            where: { id: userId },
            data: { isOnline: false, lastSeen },
          })
          .catch((err) =>
            this.logger.error(
              `Failed to update user ${userId} offline status`,
              err,
            ),
          );
        this.broadcastPresence(userId, false, lastSeen);
      }
    }
    this.logger.log(`User ${userId} disconnected (WS)`);
  }

  private broadcastPresence(userId: string, isOnline: boolean, lastSeen?: Date | number | null) {
    const normalizedLastSeen =
      lastSeen instanceof Date
        ? lastSeen.getTime()
        : typeof lastSeen === 'number'
          ? lastSeen
          : null;
    const msg = JSON.stringify({
      type: 'presence',
      user_id: userId,
      is_online: isOnline,
      last_seen: normalizedLastSeen,
    });
    this.server.clients.forEach((c) => {
      if ((c as unknown as AuthenticatedSocket).userId) {
        c.send(msg);
      }
    });
  }

  private getChatMemberIds(chatId: string): Promise<string[]> {
    return this.prisma.chatMember
      .findMany({
        where: { chatId },
        select: { userId: true },
      })
      .then((members) => members.map((m) => m.userId));
  }

  private sendToUser(userId: string, data: string) {
    const set = this.userSockets.get(userId);
    if (set) {
      set.forEach((client) => {
        if (client.readyState === 1) client.send(data);
      });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    client: AuthenticatedSocket,
    payload: {
      chat_id?: string;
      content?: string | null;
      msg_type?: string;
      client_temp_id?: string | null;
      reply_to_id?: string | null;
      forwarded_from_message_id?: string | null;
      forwarded_from_name?: string | null;
      forwarded_from_chat_id?: string | null;
      forwarded_from_sender_id?: string | null;
      media?: {
        url?: string;
        duration_ms?: number;
        waveform?: number[];
        thumbnail_url?: string;
        is_round?: boolean;
        width?: number;
        height?: number;
        file_name?: string;
        file_size?: number;
        mime_type?: string;
      };
    },
  ) {
    if (!client.userId) return;
    if (!payload || typeof payload !== 'object') {
      this.logger.warn('send_message: invalid payload');
      return;
    }
    const {
      chat_id: chatId,
      content,
      msg_type: msgType,
      client_temp_id: clientTempId,
      media,
      reply_to_id: replyToId,
      forwarded_from_message_id: forwardedFromMessageId,
      forwarded_from_name: forwardedFromName,
      forwarded_from_chat_id: forwardedFromChatId,
      forwarded_from_sender_id: forwardedFromSenderId,
    } = payload;
    if (!chatId) return;

    this.logger.log(`send_message received: chatId=${chatId} sender=${client.userId} content=${typeof content === 'string' ? content.slice(0, 50) : content} msgType=${msgType}`);

    const effectiveMsgType = msgType ?? 'text';
    if (effectiveMsgType === 'text') {
      const c = content ?? '';
      if (typeof c !== 'string' || c.trim() === '') {
        this.logger.warn('send_message: content required for text');
        return;
      }
    }

    try {
      const message = await this.messagesService.createMessage(
        chatId,
        client.userId,
        effectiveMsgType,
        content ?? null,
        media,
        replyToId ?? null,
        {
          forwarded_from_message_id: forwardedFromMessageId ?? null,
          forwarded_from_name: forwardedFromName ?? null,
          forwarded_from_chat_id: forwardedFromChatId ?? null,
          forwarded_from_sender_id: forwardedFromSenderId ?? null,
        },
      );
      const members = await this.getChatMemberIds(chatId);
      this.logger.log(`send_message broadcast: msgId=${message.id} content=${message.content?.slice(0, 50)} to ${members.length} members: ${members.join(',')}`);
      const data = JSON.stringify({
        type: 'message',
        message: {
          ...message,
          client_temp_id: clientTempId ?? null,
        },
      });
      members.forEach((uid) => this.sendToUser(uid, data));
    } catch (err) {
      this.logger.warn(`send_message failed: ${err}`);
    }
  }

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    client: AuthenticatedSocket,
    payload: { chat_id?: string; message_id?: string },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, message_id: messageId } = payload;
    if (!chatId || !messageId) return;

    try {
      const message = await this.messagesService.deleteMessage(
        chatId,
        messageId,
        client.userId,
      );
      const members = await this.getChatMemberIds(chatId);
      const data = JSON.stringify({
        type: 'message_deleted',
        chat_id: chatId,
        message_id: message.id,
      });
      members.forEach((uid) => this.sendToUser(uid, data));

      const chat = await this.prisma.chat.findUnique({
        where: { id: chatId },
        select: { pinnedMessageId: true },
      });
      if (!chat?.pinnedMessageId) {
        const pinnedData = JSON.stringify({
          type: 'chat_pinned_message_updated',
          chat_id: chatId,
          pinned_message_id: null,
        });
        members.forEach((uid) => this.sendToUser(uid, pinnedData));
      }
    } catch (err) {
      this.logger.warn(`delete_message failed: ${err}`);
    }
  }

  @SubscribeMessage('pin_message')
  async handlePinMessage(
    client: AuthenticatedSocket,
    payload: { chat_id?: string; message_id?: string | null },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, message_id: messageId } = payload;
    if (!chatId) return;

    try {
      const chat = await this.chatsService.setPinnedMessage(
        chatId,
        client.userId,
        messageId ?? null,
      );
      const members = await this.getChatMemberIds(chatId);
      const data = JSON.stringify({
        type: 'chat_pinned_message_updated',
        chat_id: chat.id,
        pinned_message_id: chat.pinned_message_id,
      });
      members.forEach((uid) => this.sendToUser(uid, data));
    } catch (err) {
      this.logger.warn(`pin_message failed: ${err}`);
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    client: AuthenticatedSocket,
    payload: { chat_id: string; message: unknown },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, message } = payload;
    if (!chatId || !message) return;

    const members = await this.getChatMemberIds(chatId);
    if (!members.includes(client.userId)) return;

    const data = JSON.stringify({
      type: 'message',
      chat_id: chatId,
      sender_id: client.userId,
      message,
    });
    members.forEach((uid) => {
      if (uid !== client.userId) this.sendToUser(uid, data);
    });
  }

  @SubscribeMessage('typing')
  async handleTyping(
    client: AuthenticatedSocket,
    payload: { chat_id: string; is_typing: boolean },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, is_typing: isTyping } = payload;
    if (!chatId) return;

    const members = await this.getChatMemberIds(chatId);
    if (!members.includes(client.userId)) return;

    const data = JSON.stringify({
      type: 'typing',
      chat_id: chatId,
      user_id: client.userId,
      is_typing: isTyping,
    });
    members.forEach((uid) => {
      if (uid !== client.userId) this.sendToUser(uid, data);
    });
  }

  @SubscribeMessage('ack')
  async handleAck(
    client: AuthenticatedSocket,
    payload: {
      chat_id: string;
      message_id: string;
      status: 'delivered' | 'read';
    },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, message_id: messageId, status } = payload;
    if (!chatId || !messageId || !status) return;

    const members = await this.getChatMemberIds(chatId);
    if (!members.includes(client.userId)) return;
    const updatedMessage = await this.messagesService.updateMessageStatus(
      chatId,
      messageId,
      client.userId,
      status,
    );
    const effectiveStatus = updatedMessage?.status ?? status;

    const data = JSON.stringify({
      type: 'ack',
      chat_id: chatId,
      message_id: messageId,
      user_id: client.userId,
      status: effectiveStatus,
    });
    members.forEach((uid) => this.sendToUser(uid, data));
  }
}
