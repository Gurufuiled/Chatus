import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RealtimeSocket = {
  readyState: number;
  send(data: string): void;
};

@Injectable()
export class RealtimeService {
  private readonly userSockets = new Map<string, Set<RealtimeSocket>>();

  constructor(private readonly prisma: PrismaService) {}

  registerClient(userId: string, client: RealtimeSocket) {
    let set = this.userSockets.get(userId);
    if (!set) {
      set = new Set();
      this.userSockets.set(userId, set);
    }
    set.add(client);
  }

  unregisterClient(userId: string, client: RealtimeSocket): boolean {
    const set = this.userSockets.get(userId);
    if (!set) {
      return false;
    }

    set.delete(client);
    if (set.size === 0) {
      this.userSockets.delete(userId);
      return true;
    }

    return false;
  }

  broadcastToAuthenticatedUsers(data: Record<string, unknown>) {
    const serialized = JSON.stringify(data);
    this.userSockets.forEach((sockets) => {
      sockets.forEach((client) => {
        if (client.readyState === 1) {
          client.send(serialized);
        }
      });
    });
  }

  async broadcastToChatMembers(chatId: string, data: Record<string, unknown>) {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    const serialized = JSON.stringify(data);
    members.forEach(({ userId }) => this.sendToUser(userId, serialized));
  }

  sendToUser(userId: string, data: string) {
    const set = this.userSockets.get(userId);
    if (!set) {
      return;
    }

    set.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }

  isUserOnline(userId: string): boolean {
    const set = this.userSockets.get(userId);
    return set != null && set.size > 0;
  }
}
