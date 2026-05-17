import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ChatType } from '@prisma/client';
import Expo, { type ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

/** FCM `tag`: same value replaces the previous notification for this chat (one slot per chat). */
function pushTagForChat(chatId: string): string {
  return `chatus-${chatId}`;
}

type ExpoPushMessageWithAndroid = ExpoPushMessage & {
  tag?: string;
  collapseId?: string;
};

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
    this.log.log(`push token registered userId=${userId} platform=${plat}`);
  }

  async unregisterToken(userId: string, expoToken: string): Promise<void> {
    const trimmed = expoToken.trim();
    await this.prisma.pushDevice.deleteMany({
      where: { userId, expoToken: trimmed },
    });
  }

  private getPublicOrigin(): string | null {
    const explicit =
      process.env.PUBLIC_ORIGIN?.trim() || process.env.API_PUBLIC_ORIGIN?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, '');
    }
    const redirect = process.env.LOGINUS_REDIRECT_URI?.trim();
    if (redirect) {
      try {
        return new URL(redirect).origin;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  private absoluteMediaUrl(url: string | null | undefined): string | undefined {
    const trimmed = url?.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('//')) return undefined;
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    if (!trimmed.startsWith('/')) return undefined;
    const origin = this.getPublicOrigin();
    if (!origin) return undefined;
    return `${origin}${trimmed}`;
  }

  /**
   * Expo richContent.image on Android often loads over HTTPS; cleartext http URLs may fail silently.
   */
  private safePushImageUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('https://')) return url;
    if (url.startsWith('http://')) {
      this.log.debug(
        'notifyNewMessage: skip richContent.image (use HTTPS PUBLIC_ORIGIN for avatar in push)',
      );
      return undefined;
    }
    return url;
  }

  private senderDisplayName(sender: {
    displayName: string | null;
    username: string | null;
    handle: string | null;
  } | null): string {
    if (!sender) return 'Сообщение';
    return (
      sender.displayName?.trim() ||
      sender.username?.trim() ||
      (sender.handle ? `@${sender.handle}` : '') ||
      'Сообщение'
    );
  }

  /** Отправить push всем участникам чата, кроме отправителя (Expo Push). */
  async notifyNewMessage(chatId: string, senderId: string): Promise<void> {
    try {
      const [chat, sender] = await Promise.all([
        this.prisma.chat.findUnique({
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
        }),
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: {
            displayName: true,
            username: true,
            handle: true,
            avatarUrl: true,
          },
        }),
      ]);
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

      const preview =
        chat.lastMessagePreview?.trim() || 'Новое сообщение';
      const senderLabel = this.senderDisplayName(sender);
      const avatarUrl = this.safePushImageUrl(
        this.absoluteMediaUrl(sender?.avatarUrl ?? null),
      );

      const recipientIds = chat.members
        .filter((m) => m.userId !== senderId)
        .map((m) => m.userId);
      if (recipientIds.length === 0) return;

      const [devices, unreadRows] = await Promise.all([
        this.prisma.pushDevice.findMany({
          where: { userId: { in: recipientIds } },
          select: { expoToken: true, userId: true, platform: true },
        }),
        this.prisma.chatMember.findMany({
          where: { chatId, userId: { in: recipientIds } },
          select: { userId: true, unreadCount: true },
        }),
      ]);

      const unreadByUserId = new Map(
        unreadRows.map((r) => [r.userId, Math.max(0, r.unreadCount)]),
      );

      const tokenToUserId = new Map<string, string>();
      const tokenToPlatform = new Map<string, 'ios' | 'android'>();
      let invalidExpoTokenRows = 0;
      for (const d of devices) {
        const t = d.expoToken.trim();
        if (!Expo.isExpoPushToken(t)) {
          invalidExpoTokenRows += 1;
          continue;
        }
        const plat = d.platform === 'ios' ? 'ios' : 'android';
        if (!tokenToUserId.has(t)) {
          tokenToUserId.set(t, d.userId);
          tokenToPlatform.set(t, plat);
        }
      }

      const uniqueTokens = [...tokenToUserId.keys()];
      if (uniqueTokens.length === 0) {
        const rid = recipientIds.join(',');
        if (devices.length === 0) {
          this.log.log(
            `notifyNewMessage: skip push (no push_devices for recipient userIds=[${rid}] chatId=${chatId}) — app must POST /users/me/push-token after login + notification permission`,
          );
        } else {
          this.log.log(
            `notifyNewMessage: skip push (${devices.length} push_devices row(s), ${invalidExpoTokenRows} not valid Expo format; recipient userIds=[${rid}] chatId=${chatId})`,
          );
        }
        return;
      }

      const tag = pushTagForChat(chatId);

      const messages: ExpoPushMessageWithAndroid[] = uniqueTokens.map((to) => {
        const userId = tokenToUserId.get(to)!;
        const unread = Math.max(1, unreadByUserId.get(userId) ?? 1);
        const core = `${senderLabel}: ${preview}`;
        const tail = unread > 1 ? `\nи ещё ${unread - 1}` : '';
        const body = (core + tail).slice(0, 400);
        const msg: ExpoPushMessageWithAndroid = {
          to,
          title,
          body,
          priority: 'high',
          channelId: 'chatus_messages',
          tag,
          collapseId: tag,
          data: { chat_id: chatId, kind: 'new_message' },
        };
        // Expo: `sound` is iOS-only in push API; sending it to Android can break FCM delivery.
        if (tokenToPlatform.get(to) === 'ios') {
          msg.sound = 'message_notification.wav';
        }
        // Small icon: use manifest `default_notification_icon` from expo-notifications (omit `icon`).
        if (avatarUrl) {
          msg.richContent = { image: avatarUrl };
        }
        return msg;
      });

      const chunks = this.expo.chunkPushNotifications(messages);
      let okTickets = 0;
      let errTickets = 0;
      for (const chunk of chunks) {
        const chunkSize = chunk.length;
        try {
          const tickets = await this.expo.sendPushNotificationsAsync(chunk);
          for (const ticket of tickets) {
            if (ticket.status === 'ok') {
              okTickets += 1;
            } else if (ticket.status === 'error') {
              errTickets += 1;
              const errTicket = ticket;
              this.log.warn(`Expo push ticket error: ${errTicket.message}`);
              if (errTicket.details != null) {
                try {
                  this.log.debug(
                    `Expo push ticket details: ${JSON.stringify(errTicket.details)}`,
                  );
                } catch {
                  this.log.debug('Expo push ticket details: [unserializable]');
                }
              }
            }
          }
        } catch (e) {
          errTickets += chunkSize;
          this.log.warn(`Expo push chunk failed: ${String(e)}`);
        }
      }
      this.log.log(
        `notifyNewMessage: Expo push done chatId=${chatId} tokens=${uniqueTokens.length} ok=${okTickets} error=${errTickets}`,
      );
    } catch (e) {
      this.log.warn(`notifyNewMessage failed: ${String(e)}`);
    }
  }
}
