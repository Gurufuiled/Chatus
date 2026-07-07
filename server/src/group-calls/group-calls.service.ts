import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ChatType, Prisma } from '@prisma/client';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver,
} from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  buildGroupCallSystemContent,
  type GroupCallSystemPayload,
} from './group-call-system-message.util';

export type GroupCallParticipantDto = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_muted: boolean;
};

type ActiveRoomRow = {
  id: string;
  chatId: string;
  livekitRoomName: string;
  startedByUserId: string;
  startedAt: Date;
};

@Injectable()
export class GroupCallsService {
  private readonly log = new Logger(GroupCallsService.name);
  private readonly roomParticipants = new Map<string, Set<string>>();
  private readonly userActiveRoomId = new Map<string, string>();
  private readonly participantMuted = new Map<string, boolean>();
  private roomService: RoomServiceClient | null = null;
  private webhookReceiver: WebhookReceiver | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesService: MessagesService,
    private readonly realtime: RealtimeService,
  ) {}

  private getLivekitApiKey(): string {
    const key = process.env.LIVEKIT_API_KEY?.trim();
    if (!key) {
      throw new Error('LIVEKIT_API_KEY is not configured');
    }
    return key;
  }

  private getLivekitApiSecret(): string {
    const secret = process.env.LIVEKIT_API_SECRET?.trim();
    if (!secret) {
      throw new Error('LIVEKIT_API_SECRET is not configured');
    }
    return secret;
  }

  private getLivekitHttpUrl(): string {
    return (
      process.env.LIVEKIT_HTTP_URL?.trim() ||
      process.env.LIVEKIT_URL?.trim()?.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:') ||
      'http://127.0.0.1:7880'
    );
  }

  getLivekitClientUrl(): string {
    return (
      process.env.LIVEKIT_CLIENT_URL?.trim() ||
      process.env.LIVEKIT_URL?.trim() ||
      'ws://127.0.0.1:7880'
    );
  }

  private getRoomService(): RoomServiceClient {
    if (!this.roomService) {
      this.roomService = new RoomServiceClient(
        this.getLivekitHttpUrl(),
        this.getLivekitApiKey(),
        this.getLivekitApiSecret(),
      );
    }
    return this.roomService;
  }

  private getWebhookReceiver(): WebhookReceiver {
    if (!this.webhookReceiver) {
      this.webhookReceiver = new WebhookReceiver(
        this.getLivekitApiKey(),
        this.getLivekitApiSecret(),
      );
    }
    return this.webhookReceiver;
  }

  private participantKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  private async assertGroupMember(chatId: string, userId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
        chat: { chatType: ChatType.group },
      },
      include: {
        user: true,
        chat: true,
      },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this group chat');
    }
    return member;
  }

  private async getActiveRoomForChat(chatId: string): Promise<ActiveRoomRow | null> {
    return this.prisma.groupCallRoom.findFirst({
      where: { chatId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  private async getRoomOrThrow(roomId: string): Promise<ActiveRoomRow> {
    const room = await this.prisma.groupCallRoom.findUnique({
      where: { id: roomId },
    });
    if (!room || room.endedAt) {
      throw new NotFoundException('Group call not found or already ended');
    }
    return room;
  }

  private assertNotInAnotherCall(userId: string, roomId?: string) {
    const activeRoomId = this.userActiveRoomId.get(userId);
    if (activeRoomId && activeRoomId !== roomId) {
      throw new ConflictException(
        'Leave the current group call before joining another',
      );
    }
  }

  private addParticipant(roomId: string, userId: string) {
    let set = this.roomParticipants.get(roomId);
    if (!set) {
      set = new Set();
      this.roomParticipants.set(roomId, set);
    }
    set.add(userId);
    this.userActiveRoomId.set(userId, roomId);
  }

  private removeParticipant(roomId: string, userId: string) {
    const set = this.roomParticipants.get(roomId);
    set?.delete(userId);
    if (set && set.size === 0) {
      this.roomParticipants.delete(roomId);
    }
    if (this.userActiveRoomId.get(userId) === roomId) {
      this.userActiveRoomId.delete(userId);
    }
    this.participantMuted.delete(this.participantKey(roomId, userId));
  }

  private async resolveParticipants(
    roomId: string,
    userIds: Iterable<string>,
  ): Promise<GroupCallParticipantDto[]> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        displayName: true,
        lastName: true,
        avatarUrl: true,
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return ids.map((userId) => {
      const user = byId.get(userId);
      const displayName = [user?.displayName, user?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Участник';
      return {
        user_id: userId,
        display_name: displayName,
        avatar_url: user?.avatarUrl ?? null,
        is_muted: this.participantMuted.get(this.participantKey(roomId, userId)) ?? false,
      };
    });
  }

  private async broadcastParticipants(room: ActiveRoomRow) {
    const set = this.roomParticipants.get(room.id) ?? new Set<string>();
    const participants = await this.resolveParticipants(room.id, set);
    await this.realtime.broadcastToChatMembers(room.chatId, {
      type: 'group_call_participants',
      chat_id: room.chatId,
      room_id: room.id,
      participants,
    });
  }

  private async broadcastStarted(room: ActiveRoomRow, startedByUserId: string) {
    await this.realtime.broadcastToChatMembers(room.chatId, {
      type: 'group_call_started',
      chat_id: room.chatId,
      room_id: room.id,
      started_by: startedByUserId,
      started_at: room.startedAt.getTime(),
    });
  }

  private async broadcastEnded(room: ActiveRoomRow) {
    await this.realtime.broadcastToChatMembers(room.chatId, {
      type: 'group_call_ended',
      chat_id: room.chatId,
      room_id: room.id,
    });
  }

  private async createSystemMessage(
    chatId: string,
    senderId: string,
    payload: GroupCallSystemPayload,
  ) {
    const message = await this.messagesService.createMessage(
      chatId,
      senderId,
      'system',
      buildGroupCallSystemContent(payload),
      undefined,
      null,
      undefined,
      { chatType: 'group' },
    );
    await this.realtime.broadcastToChatMembers(chatId, {
      type: 'message',
      message,
    });
    return message;
  }

  private async buildAccessToken(
    livekitRoomName: string,
    userId: string,
    displayName: string,
  ): Promise<string> {
    const token = new AccessToken(
      this.getLivekitApiKey(),
      this.getLivekitApiSecret(),
      {
        identity: userId,
        name: displayName,
        ttl: '6h',
      },
    );
    token.addGrant({
      roomJoin: true,
      room: livekitRoomName,
      canPublish: true,
      canSubscribe: true,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE],
    });
    return token.toJwt();
  }

  async createRoom(chatId: string, userId: string) {
    const member = await this.assertGroupMember(chatId, userId);
    this.assertNotInAnotherCall(userId);

    const existing = await this.getActiveRoomForChat(chatId);
    if (existing) {
      throw new ConflictException('An active group call already exists for this chat');
    }

    const livekitRoomName = `group-${chatId}-${randomUUID()}`;

    let room: ActiveRoomRow;
    try {
      room = await this.prisma.groupCallRoom.create({
        data: {
          chatId,
          livekitRoomName,
          startedByUserId: userId,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('An active group call already exists for this chat');
      }
      throw err;
    }

    try {
      await this.getRoomService().createRoom({
        name: livekitRoomName,
        emptyTimeout: 60 * 5,
        maxParticipants: parseInt(process.env.GROUP_CALL_MAX_PARTICIPANTS ?? '30', 10),
      });
    } catch (err) {
      await this.prisma.groupCallRoom.delete({ where: { id: room.id } }).catch(() => {});
      this.log.error(
        `LiveKit createRoom failed chatId=${chatId}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }

    const displayName = [member.user.displayName, member.user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Участник';

    await this.createSystemMessage(chatId, userId, {
      v: 1,
      kind: 'group_call',
      action: 'started',
      room_id: room.id,
      display: `${displayName} начала голосовой чат`,
    });

    await this.broadcastStarted(room, userId);

    const token = await this.buildAccessToken(livekitRoomName, userId, displayName);

    return {
      room: this.mapRoom(room, 1),
      token,
      livekit_url: this.getLivekitClientUrl(),
      room_name: livekitRoomName,
    };
  }

  private async countLiveKitParticipants(
    livekitRoomName: string,
    roomId?: string,
  ): Promise<number> {
    const inMemory =
      roomId != null ? (this.roomParticipants.get(roomId)?.size ?? 0) : 0;
    if (inMemory > 0) return inMemory;
    try {
      const participants = await this.getRoomService().listParticipants(livekitRoomName);
      return participants.length;
    } catch {
      return inMemory;
    }
  }

  async getActiveRoom(chatId: string, userId: string) {
    await this.assertGroupMember(chatId, userId);
    const room = await this.getActiveRoomForChat(chatId);
    if (!room) return null;
    const inMemoryCount = this.roomParticipants.get(room.id)?.size ?? 0;
    const count =
      inMemoryCount > 0
        ? inMemoryCount
        : await this.countLiveKitParticipants(room.livekitRoomName, room.id);
    return this.mapRoom(room, count);
  }

  async joinRoom(roomId: string, userId: string) {
    const room = await this.getRoomOrThrow(roomId);
    const member = await this.assertGroupMember(room.chatId, userId);
    this.assertNotInAnotherCall(userId, roomId);

    const displayName = [member.user.displayName, member.user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Участник';

    const token = await this.buildAccessToken(room.livekitRoomName, userId, displayName);

    return {
      token,
      livekit_url: this.getLivekitClientUrl(),
      room_name: room.livekitRoomName,
      room: this.mapRoom(
        room,
        await this.countLiveKitParticipants(room.livekitRoomName, room.id),
      ),
    };
  }

  async leaveRoom(roomId: string, userId: string) {
    const room = await this.getRoomOrThrow(roomId);
    await this.assertGroupMember(room.chatId, userId);
    this.removeParticipant(roomId, userId);
    await this.broadcastParticipants(room);
    return { ok: true };
  }

  async endRoom(roomId: string, userId: string) {
    const room = await this.getRoomOrThrow(roomId);
    if (room.startedByUserId !== userId) {
      throw new ForbiddenException('Only the call creator can end the room for everyone');
    }
    await this.finalizeRoom(room, userId);
    return { ok: true };
  }

  private mapRoom(room: ActiveRoomRow, participantCount: number) {
    return {
      id: room.id,
      chat_id: room.chatId,
      livekit_room_name: room.livekitRoomName,
      started_by_user_id: room.startedByUserId,
      started_at: room.startedAt.getTime(),
      participant_count: participantCount,
    };
  }

  private async finalizeRoom(room: ActiveRoomRow, endedByUserId: string) {
    const endedAt = new Date();
    const result = await this.prisma.groupCallRoom.updateMany({
      where: { id: room.id, endedAt: null },
      data: { endedAt },
    });
    if (result.count === 0) {
      return;
    }

    try {
      await this.getRoomService().deleteRoom(room.livekitRoomName);
    } catch (err) {
      this.log.warn(
        `LiveKit deleteRoom failed room=${room.livekitRoomName}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const durationMinutes = Math.max(
      1,
      Math.round((endedAt.getTime() - room.startedAt.getTime()) / 60000),
    );

    await this.createSystemMessage(room.chatId, endedByUserId, {
      v: 1,
      kind: 'group_call',
      action: 'ended',
      room_id: room.id,
      display: 'Голосовой чат завершён',
      duration_minutes: durationMinutes,
    });

    const participants = this.roomParticipants.get(room.id);
    if (participants) {
      for (const participantUserId of participants) {
        this.userActiveRoomId.delete(participantUserId);
      }
    }
    this.roomParticipants.delete(room.id);
    await this.broadcastEnded(room);
  }

           async handleWebhook(rawBody: Buffer, authHeader: string | undefined) {
    const receiver = this.getWebhookReceiver();
    let event;
    try {
      event = await receiver.receive(rawBody.toString('utf8'), authHeader);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('authorization header is empty')) {
        throw new UnauthorizedException(message);
      }
      if (
        message.includes('sha256 checksum') ||
        message.includes('invalid token') ||
        message.includes('signature')
      ) {
        throw new BadRequestException(message);
      }
      this.log.warn(`LiveKit webhook verification failed: ${message}`);
      throw new BadRequestException('Invalid LiveKit webhook payload');
    }

    const roomName = event.room?.name;
    if (!roomName) return { ok: true };

    const room = await this.prisma.groupCallRoom.findFirst({
      where: { livekitRoomName: roomName, endedAt: null },
    });
    if (!room) return { ok: true };

    switch (event.event) {
      case 'participant_joined': {
        const identity = event.participant?.identity;
        if (identity) {
          this.addParticipant(room.id, identity);
          await this.broadcastParticipants(room);
        }
        break;
      }
      case 'participant_left': {
        const identity = event.participant?.identity;
        if (identity) {
          this.removeParticipant(room.id, identity);
          await this.broadcastParticipants(room);
        }
        break;
      }
      case 'room_finished': {
        await this.finalizeRoom(room, room.startedByUserId);
        break;
      }
      default:
        break;
    }

    return { ok: true };
  }
}
