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
import { ChatType } from '@prisma/client';

const SIGNALING_PORT = parseInt(process.env.SIGNALING_PORT ?? '4002', 10);

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
}

/** WebRTC signaling: relay offer/answer/ICE between peers. */
@WebSocketGateway(SIGNALING_PORT, { path: '/' })
@Injectable()
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly userSockets = new Map<string, Set<AuthenticatedSocket>>();
  private readonly log = new Logger(SignalingGateway.name);

  /** ack_key → pending sender ack for dm_send */
  private readonly pendingDms = new Map<
    string,
    { resolve: (acked: boolean) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket, ...args: unknown[]) {
    const request = (args[0] as { url?: string })?.url;
    const url = new URL(request || '/', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      this.log.warn('Signaling connection rejected: no token');
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
      this.log.log(`User connected (signaling) userId=${payload.sub}`);
    } catch (err) {
      this.log.warn(
        `Signaling connection rejected: invalid token or DB error: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.close(4003, 'Invalid token');
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (!userId) return;

    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(client);
      if (set.size === 0) this.userSockets.delete(userId);
    }
    this.log.log(`User disconnected (signaling) userId=${userId}`);
  }

  @SubscribeMessage('dm_send')
  async handleDmSend(
    client: AuthenticatedSocket,
    payload: {
      ack_key: string;
      recipient_user_id: string;
      chat_id: string;
      content: string;
      temp_id: string;
      reply_to_id?: string | null;
      timeout_ms?: number;
    },
  ) {
    if (!client.userId) return;
    const ackKey = payload?.ack_key;
    const recipientId = payload?.recipient_user_id;
    const chatId = payload?.chat_id;
    const content = payload?.content;
    const tempId = payload?.temp_id;
    if (!ackKey || !recipientId || !chatId || !client.userId) return;

    const timeoutMs = typeof payload.timeout_ms === 'number' ? payload.timeout_ms : 2500;
    if (typeof content !== 'string') return;

    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, chatType: ChatType.private },
      select: {
        members: { select: { userId: true } },
      },
    });
    if (!chat) {
      client.send(JSON.stringify({ type: 'dm_fallback', ack_key: ackKey, reason: 'invalid_chat' }));
      return;
    }
    const ids = new Set(chat.members.map((m) => m.userId));
    if (!ids.has(client.userId) || !ids.has(recipientId)) {
      client.send(JSON.stringify({ type: 'dm_fallback', ack_key: ackKey, reason: 'invalid_chat' }));
      return;
    }

    const recipientSockets = this.userSockets.get(recipientId);
    if (!recipientSockets || recipientSockets.size === 0) {
      client.send(
        JSON.stringify({ type: 'dm_fallback', ack_key: ackKey, reason: 'recipient_offline' }),
      );
      return;
    }

    const acked = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingDms.delete(ackKey);
        resolve(false);
      }, Math.min(timeoutMs, 10_000));
      this.pendingDms.set(ackKey, { resolve, timer });

      const deliverPayload = JSON.stringify({
        type: 'dm_deliver',
        ack_key: ackKey,
        from_user_id: client.userId,
        chat_id: chatId,
        content,
        temp_id: tempId,
        reply_to_id: payload.reply_to_id ?? null,
        sent_at: Date.now(),
      });
      recipientSockets.forEach((sock) => {
        if (sock.readyState === 1) sock.send(deliverPayload);
      });
    });

    if (acked) {
      client.send(JSON.stringify({ type: 'dm_sent', ack_key: ackKey, transport: 'p2p' }));
    } else {
      client.send(JSON.stringify({ type: 'dm_fallback', ack_key: ackKey, reason: 'ack_timeout' }));
    }
  }

  @SubscribeMessage('dm_ack')
  handleDmAck(client: AuthenticatedSocket, payload: { ack_key?: string }) {
    void client;
    const key = payload?.ack_key;
    if (!key) return;
    const pending = this.pendingDms.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingDms.delete(key);
      pending.resolve(true);
    }
  }

  private sendToUser(userId: string, data: string) {
    const set = this.userSockets.get(userId);
    if (set) {
      set.forEach((client) => {
        if (client.readyState === 1) client.send(data);
      });
    }
  }

  @SubscribeMessage('offer')
  handleOffer(
    client: AuthenticatedSocket,
    payload: {
      target_user_id: string;
      offer: RTCSessionDescriptionInit;
      call_type?: 'audio' | 'video';
    },
  ) {
    if (!client.userId) return;
    const { target_user_id: targetUserId, offer, call_type: callType } = payload;
    if (!targetUserId || !offer) return;

    const data = JSON.stringify({
      type: 'offer',
      from_user_id: client.userId,
      offer,
      call_type: callType === 'video' ? 'video' : 'audio',
    });
    this.sendToUser(targetUserId, data);
  }

  @SubscribeMessage('answer')
  handleAnswer(
    client: AuthenticatedSocket,
    payload: { target_user_id: string; answer: RTCSessionDescriptionInit },
  ) {
    if (!client.userId) return;
    const { target_user_id: targetUserId, answer } = payload;
    if (!targetUserId || !answer) return;

    const data = JSON.stringify({
      type: 'answer',
      from_user_id: client.userId,
      answer,
    });
    this.sendToUser(targetUserId, data);
  }

  @SubscribeMessage('ice')
  handleIce(
    client: AuthenticatedSocket,
    payload: { target_user_id: string; candidate: RTCIceCandidateInit },
  ) {
    if (!client.userId) return;
    const { target_user_id: targetUserId, candidate } = payload;
    if (!targetUserId || !candidate) return;

    const data = JSON.stringify({
      type: 'ice_candidate',
      from_user_id: client.userId,
      candidate,
    });
    this.sendToUser(targetUserId, data);
  }

  @SubscribeMessage('call_cancel')
  handleCallCancel(
    client: AuthenticatedSocket,
    payload: { target_user_id: string },
  ) {
    if (!client.userId) return;
    const { target_user_id: targetUserId } = payload;
    if (!targetUserId) return;

    const data = JSON.stringify({
      type: 'call_cancel',
      from_user_id: client.userId,
    });
    this.sendToUser(targetUserId, data);
  }

  @SubscribeMessage('call_decline')
  handleCallDecline(
    client: AuthenticatedSocket,
    payload: { target_user_id: string },
  ) {
    if (!client.userId) return;
    const { target_user_id: targetUserId } = payload;
    if (!targetUserId) return;

    const data = JSON.stringify({
      type: 'call_decline',
      from_user_id: client.userId,
    });
    this.sendToUser(targetUserId, data);
  }

  @SubscribeMessage('call_end')
  handleCallEnd(
    client: AuthenticatedSocket,
    payload: { target_user_id: string },
  ) {
    if (!client.userId) return;
    const { target_user_id: targetUserId } = payload;
    if (!targetUserId) return;

    const data = JSON.stringify({
      type: 'call_end',
      from_user_id: client.userId,
    });
    this.sendToUser(targetUserId, data);
  }

  @SubscribeMessage('call_busy')
  handleCallBusy(
    client: AuthenticatedSocket,
    payload: { target_user_id: string },
  ) {
    if (!client.userId) return;
    const { target_user_id: targetUserId } = payload;
    if (!targetUserId) return;

    const data = JSON.stringify({
      type: 'call_busy',
      from_user_id: client.userId,
    });
    this.sendToUser(targetUserId, data);
  }
}
