import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ChatType } from '@prisma/client';
import Expo, { type ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private readonly expo: Expo;

  constructor(private readonly prisma: PrismaService) {
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    this.expo = new Expo(
      accessToken ? { accessToken } : {},
    );
  }

  async registerToken(
    userId: string,
    expoToken: string,
    platform: string,
  ): Promise<void> {
    const trimmed = expoToken.trim();
    if (!Expo.isExpoPushToken(trimmed)) {
      throw new BadRequestException('Invalid Expo push token');
    }
    const plat = platform === 'ios' ? 'ios' : 'android';
    await this.prisma.pushDevice.upsert({
      where: { expoToken: trimmed },
      create: { userId, expoToken: trimmed, platform: plat },
      update: { userId, platform: plat },
    });
  }

  async unregisterToken(userId: string, expoToken: string): Promise<void> {
    const trimmed = expoToken.trim();
    await this.prisma.pushDevice.deleteMany({
      where: { userId, expoToken: trimmed },
    });
  }

  /** Отправить push всем участникам чата, кроме отправителя (Expo Push). */
  async notifyNewMessage(chatId: string, senderId: string): Promise<void> {
    try {
      const chat = await this.prisma.chat.findUnique({
        where: { id: chatId },
        select: {
          name: true,
          chatType: true,
          lastMessagePreview: true,
          members: {
            select: {
              userId: true,
              user: {
                select: {
                  displayName: true,
                  username: true,
                  handle: true,
                },
              },
            },
          },
        },
      });
      if (!chat) return;

      let title = chat.name?.trim() ?? '';
      if (!title && chat.chatType === ChatType.private) {
        const peer = chat.members.find((m) => m.userId !== senderId);
        const u = peer?.user;
        title =
          u?.displayName?.trim() ||
          u?.username?.trim() ||
          (u?.handle ? `@${u.handle}` : '') ||
          'Личный чат';
      }
      if (!title) title = 'Chatus';

      const body =
        chat.lastMessagePreview?.trim() || 'Новое сообщение';

      const recipientIds = chat.members
        .filter((m) => m.userId !== senderId)
        .map((m) => m.userId);
      if (recipientIds.length === 0) return;

      const devices = await this.prisma.pushDevice.findMany({
        where: { userId: { in: recipientIds } },
        select: { expoToken: true },
      });
      const tokens = [...new Set(devices.map((d) => d.expoToken))].filter((t) =>
        Expo.isExpoPushToken(t),
      );
      if (tokens.length === 0) return;

      const messages: ExpoPushMessage[] = tokens.map((to) => ({
        to,
        /** Файл из бандла (expo-notifications plugin → sounds). */
        sound: 'message_notification.wav',
        title,
        body: body.slice(0, 200),
        priority: 'high',
        data: { chat_id: chatId, kind: 'new_message' },
        android: { channelId: 'chatus_messages' },
      }));

      const chunks = this.expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await this.expo.sendPushNotificationsAsync(chunk);
        } catch (e) {
          this.log.warn(`Expo push chunk failed: ${String(e)}`);
        }
      }
    } catch (e) {
      this.log.warn(`notifyNewMessage failed: ${String(e)}`);
    }
  }
}
