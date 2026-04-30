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
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { ChatsService } from '../chats/chats.service';
import { ChannelsService } from '../channels/channels.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ChatusFatherService } from '../mini-apps/chatus-father.service';

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

  private readonly log = new Logger(WebsocketGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly messagesService: MessagesService,
    private readonly chatsService: ChatsService,
    private readonly channelsService: ChannelsService,
    private readonly realtimeService: RealtimeService,
    private readonly chatusFatherService: ChatusFatherService,
  ) {}

  async handleConnection(client: AuthenticatedSocket, ...args: unknown[]) {
    const request = (args[0] as { url?: string })?.url;
    const url = new URL(request || '/', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      this.log.warn('WS connection rejected: no token');
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
      this.realtimeService.registerClient(payload.sub, client);

      const now = new Date();
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { isOnline: true, lastSeen: now },
      });

      this.broadcastPresence(payload.sub, true, now);
      this.log.log(`User connected (WS) userId=${payload.sub}`);
    } catch (err) {
      this.log.warn(
        `WS connection rejected: invalid token or DB error: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.close(4003, 'Invalid token');
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (!userId) return;

    const disconnectedLastSocket = this.realtimeService.unregisterClient(userId, client);

    if (disconnectedLastSocket) {
      const lastSeen = new Date();
      this.prisma.user
        .update({
          where: { id: userId },
          data: { isOnline: false, lastSeen },
        })
        .catch((err) =>
          this.log.error(
            `Failed to update user offline status userId=${userId}`,
            err instanceof Error ? err.stack : String(err),
          ),
        );
      this.broadcastPresence(userId, false, lastSeen);
    }
    this.log.log(`User disconnected (WS) userId=${userId}`);
  }

  private broadcastPresence(userId: string, isOnline: boolean, lastSeen?: Date | number | null) {
    const normalizedLastSeen =
      lastSeen instanceof Date
        ? lastSeen.getTime()
        : typeof lastSeen === 'number'
          ? lastSeen
          : null;
    this.realtimeService.broadcastToAuthenticatedUsers({
      type: 'presence',
      user_id: userId,
      is_online: isOnline,
      last_seen: normalizedLastSeen,
    });
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
        media_type?: string;
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
      } | {
        media_type?: string;
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
      }[];
    },
  ) {
    if (!client.userId) return;
    if (!payload || typeof payload !== 'object') {
      this.log.warn(`send_message: invalid payload userId=${client.userId}`);
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

    const effectiveMsgType = msgType ?? 'text';
    const wsOpId = randomUUID();
    const contentLength = typeof content === 'string' ? content.length : 0;

    this.log.log(
      `send_message start ${JSON.stringify({
        wsOpId,
        chatId,
        userId: client.userId,
        msgType: effectiveMsgType,
        contentLength,
        hasMedia: Boolean(media),
        clientTempId: clientTempId ?? undefined,
      })}`,
    );

    if (effectiveMsgType === 'text') {
      const c = content ?? '';
      if (typeof c !== 'string' || c.trim() === '') {
        this.log.warn(
          `send_message: content required for text wsOpId=${wsOpId} chatId=${chatId} userId=${client.userId}`,
        );
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
      const members = await this.prisma.chatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });
      this.log.log(
        `send_message broadcast ${JSON.stringify({
          wsOpId,
          messageId: message.id,
          chatId,
          memberCount: members.length,
          previewLen: message.content ? Math.min(80, message.content.length) : 0,
        })}`,
      );
      const data = JSON.stringify({
        type: 'message',
        message: {
          ...message,
          client_temp_id: clientTempId ?? null,
        },
      });
      members.forEach(({ userId }) => this.realtimeService.sendToUser(userId, data));

      if (effectiveMsgType === 'text' && typeof content === 'string' && content.trim()) {
        const fatherChatId = await this.chatusFatherService.getChatIdIfChatusFather(
          chatId,
          client.userId,
        );
        if (fatherChatId) {
          const replies = await this.chatusFatherService.handleUserMessage(
            fatherChatId,
            client.userId,
            content,
          );
          for (const reply of replies) {
            const fatherPayload = JSON.stringify({ type: 'message', message: reply });
            members.forEach(({ userId }) =>
              this.realtimeService.sendToUser(userId, fatherPayload),
            );
          }
        }
      }
    } catch (err) {
      this.log.error(
        `send_message failed ${JSON.stringify({
          wsOpId,
          chatId,
          userId: client.userId,
          msgType: effectiveMsgType,
        })}`,
        err instanceof Error ? err.stack : String(err),
      );
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

    const wsOpId = randomUUID();
    try {
      const chatBeforeDelete = await this.prisma.chat.findUnique({
        where: { id: chatId },
        select: { pinnedMessageId: true },
      });
      const deletedPinnedMessage = chatBeforeDelete?.pinnedMessageId === messageId;

      const message = await this.messagesService.deleteMessage(
        chatId,
        messageId,
        client.userId,
      );
      await this.realtimeService.broadcastToChatMembers(chatId, {
        type: 'message_deleted',
        chat_id: chatId,
        message_id: message.id,
      });

      if (deletedPinnedMessage) {
        await this.realtimeService.broadcastToChatMembers(chatId, {
          type: 'chat_pinned_message_updated',
          chat_id: chatId,
          pinned_message_id: null,
        });
      }
      this.log.log(
        `delete_message ok ${JSON.stringify({ wsOpId, chatId, messageId, userId: client.userId })}`,
      );
    } catch (err) {
      this.log.error(
        `delete_message failed ${JSON.stringify({ wsOpId, chatId, messageId, userId: client.userId })}`,
        err instanceof Error ? err.stack : String(err),
      );
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

    const wsOpId = randomUUID();
    try {
      const chat = await this.chatsService.setPinnedMessage(
        chatId,
        client.userId,
        messageId ?? null,
      );
      await this.realtimeService.broadcastToChatMembers(chatId, {
        type: 'chat_pinned_message_updated',
        chat_id: chat.id,
        pinned_message_id: chat.pinned_message_id,
      });
      this.log.log(
        `pin_message ok ${JSON.stringify({
          wsOpId,
          chatId,
          userId: client.userId,
          pinnedMessageId: messageId ?? null,
        })}`,
      );
    } catch (err) {
      this.log.error(
        `pin_message failed ${JSON.stringify({ wsOpId, chatId, userId: client.userId })}`,
        err instanceof Error ? err.stack : String(err),
      );
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

    const wsOpId = randomUUID();
    try {
      const members = await this.prisma.chatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });
      if (!members.some((member) => member.userId === client.userId)) return;

      const data = JSON.stringify({
        type: 'message',
        chat_id: chatId,
        sender_id: client.userId,
        message,
      });
      members.forEach(({ userId }) => {
        if (userId !== client.userId) this.realtimeService.sendToUser(userId, data);
      });
    } catch (err) {
      this.log.error(
        `relay message failed ${JSON.stringify({ wsOpId, chatId, userId: client.userId })}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    client: AuthenticatedSocket,
    payload: { chat_id: string; is_typing: boolean },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, is_typing: isTyping } = payload;
    if (!chatId) return;

    const wsOpId = randomUUID();
    try {
      const members = await this.prisma.chatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });
      if (!members.some((member) => member.userId === client.userId)) return;

      const data = JSON.stringify({
        type: 'typing',
        chat_id: chatId,
        user_id: client.userId,
        is_typing: isTyping,
      });
      members.forEach(({ userId }) => {
        if (userId !== client.userId) this.realtimeService.sendToUser(userId, data);
      });
    } catch (err) {
      this.log.error(
        `typing relay failed ${JSON.stringify({ wsOpId, chatId, userId: client.userId })}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
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

    const wsOpId = randomUUID();
    try {
      const members = await this.prisma.chatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });
      if (!members.some((member) => member.userId === client.userId)) return;
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
      members.forEach(({ userId }) => this.realtimeService.sendToUser(userId, data));
    } catch (err) {
      this.log.error(
        `ack failed ${JSON.stringify({ wsOpId, chatId, messageId, userId: client.userId, status })}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @SubscribeMessage('channel_publish_post')
  async handleChannelPublishPost(
    client: AuthenticatedSocket,
    payload: {
      channel_id?: string;
      content?: string | null;
      msg_type?: string;
      media?: Record<string, unknown>;
    },
  ) {
    if (!client.userId) return;
    const channelId = payload?.channel_id;
    if (!channelId) return;

    const wsOpId = randomUUID();
    try {
      await this.channelsService.publishPost(channelId, client.userId, {
        content: payload.content ?? null,
        msg_type: payload.msg_type ?? 'text',
        media: payload.media,
      });
      this.log.log(
        `channel_publish_post ok ${JSON.stringify({ wsOpId, channelId, userId: client.userId })}`,
      );
    } catch (err) {
      this.log.error(
        `channel_publish_post failed ${JSON.stringify({ wsOpId, channelId, userId: client.userId })}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @SubscribeMessage('discussion_send_message')
  async handleDiscussionSendMessage(
    client: AuthenticatedSocket,
    payload: {
      channel_id?: string;
      post_id?: string;
      content?: string | null;
      msg_type?: string;
      reply_to_id?: string | null;
      media?: Record<string, unknown>;
    },
  ) {
    if (!client.userId) return;
    const channelId = payload?.channel_id;
    const postId = payload?.post_id;
    if (!channelId || !postId) return;

    const wsOpId = randomUUID();
    try {
      await this.channelsService.createDiscussionMessage(
        channelId,
        postId,
        client.userId,
        {
          content: payload.content ?? null,
          msg_type: payload.msg_type ?? 'text',
          reply_to_id: payload.reply_to_id ?? null,
          media: payload.media,
        },
      );
      this.log.log(
        `discussion_send_message ok ${JSON.stringify({
          wsOpId,
          channelId,
          postId,
          userId: client.userId,
        })}`,
      );
    } catch (err) {
      this.log.error(
        `discussion_send_message failed ${JSON.stringify({
          wsOpId,
          channelId,
          postId,
          userId: client.userId,
        })}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @SubscribeMessage('toggle_reaction')
  async handleToggleReaction(
    client: AuthenticatedSocket,
    payload: {
      chat_id?: string;
      message_id?: string;
      emoji?: string;
    },
  ) {
    if (!client.userId) return;
    const chatId = payload?.chat_id;
    const messageId = payload?.message_id;
    const emoji = payload?.emoji;
    if (!chatId || !messageId || !emoji) return;

    const wsOpId = randomUUID();
    try {
      const updated = await this.messagesService.toggleReaction(
        chatId,
        messageId,
        client.userId,
        emoji,
      );
      await this.realtimeService.broadcastToChatMembers(chatId, {
        type: 'message_reactions_updated',
        ...updated,
      });
      this.log.log(
        `toggle_reaction ok ${JSON.stringify({
          wsOpId,
          chatId,
          messageId,
          userId: client.userId,
          emoji,
        })}`,
      );
    } catch (err) {
      this.log.error(
        `toggle_reaction failed ${JSON.stringify({
          wsOpId,
          chatId,
          messageId,
          userId: client.userId,
          emoji,
        })}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
