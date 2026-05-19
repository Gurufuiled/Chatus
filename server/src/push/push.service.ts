import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ChatType } from '@prisma/client';
import Expo, { type ExpoPushMessage } from 'expo-server-sdk';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';

/** Firebase Admin SDK — lazy import to avoid hard crash when the package is missing. */
let firebaseAdmin: typeof import('firebase-admin') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  firebaseAdmin = require('firebase-admin');
} catch {
  /* firebase-admin not installed — FCM direct push disabled */
}

/** FCM `tag`: same value replaces the previous notification for this chat (one slot per chat). */
function pushTagForChat(chatId: string): string {
  return `chatus-${chatId}`;
}

type ExpoPushMessageWithAndroid = ExpoPushMessage & {
  tag?: string;
  collapseId?: string;
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly log = new Logger(PushService.name);
  private readonly expo: Expo;
  private fcmInitialized = false;

  constructor(private readonly prisma: PrismaService) {
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    this.expo = new Expo(
      accessToken ? { accessToken } : {},
    );
  }

  onModuleInit(): void {
    this.initFirebaseAdmin();
  }

  private initFirebaseAdmin(): void {
    if (!firebaseAdmin) {
      this.log.warn(
        'firebase-admin is not installed — FCM direct push disabled. Run: npm install firebase-admin',
      );
      return;
    }

    // Already initialized (e.g. hot-reload)
    if (firebaseAdmin.apps?.length) {
      this.fcmInitialized = true;
      this.log.log('Firebase Admin SDK already initialized');
      return;
    }

    const saKeyPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
      path.resolve(process.cwd(), 'firebase-service-account.json');

    if (!fs.existsSync(saKeyPath)) {
      this.log.warn(
        `Firebase service account key not found at ${saKeyPath} — FCM direct push disabled`,
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(saKeyPath) as Record<string, unknown>;
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(
          serviceAccount as Parameters<typeof firebaseAdmin.credential.cert>[0],
        ),
      });
      this.fcmInitialized = true;
      this.log.log('Firebase Admin SDK initialized for FCM push');
    } catch (e) {
      this.log.warn(`Firebase Admin SDK init failed: ${String(e)}`);
    }
  }

  async registerToken(
    userId: string,
    expoToken: string,
    platform: string,
    fcmToken?: string,
  ): Promise<void> {
    const trimmed = expoToken.trim();
    if (!Expo.isExpoPushToken(trimmed)) {
      throw new BadRequestException('Invalid Expo push token');
    }
    const plat = platform === 'ios' ? 'ios' : 'android';
    const fcmTrimmed = fcmToken?.trim() || null;
    await this.prisma.pushDevice.upsert({
      where: { expoToken: trimmed },
      create: { userId, expoToken: trimmed, fcmToken: fcmTrimmed, platform: plat },
      update: { userId, platform: plat, fcmToken: fcmTrimmed },
    });
    this.log.log(
      `push token registered userId=${userId} platform=${plat} hasFcm=${!!fcmTrimmed}`,
    );
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

  // ---------------------------------------------------------------------------
  //  FCM direct push via Firebase Admin SDK (shows in notification tray
  //  even when the app process is completely killed)
  // ---------------------------------------------------------------------------

  private async sendFcmDirectPush(input: {
    fcmTokens: { token: string; userId: string }[];
    title: string;
    body: string;
    chatId: string;
    tag: string;
    imageUrl?: string;
  }): Promise<{ ok: number; error: number }> {
    if (!this.fcmInitialized || !firebaseAdmin) {
      return { ok: 0, error: 0 };
    }

    const messaging = firebaseAdmin.messaging();
    let ok = 0;
    let error = 0;

    const promises = input.fcmTokens.map(async ({ token }) => {
      try {
        await messaging.send({
          token,
          notification: {
            title: input.title,
            body: input.body,
            ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
          },
          data: {
            chat_id: input.chatId,
            kind: 'new_message',
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'chatus_messages',
              tag: input.tag,
              icon: 'notification_icon',
              color: '#4B8FEA',
              defaultSound: true,
              defaultVibrateTimings: true,
            },
          },
        });
        ok += 1;
      } catch (e) {
        error += 1;
        this.log.warn(`FCM direct send failed: ${String(e)}`);
      }
    });

    await Promise.allSettled(promises);
    return { ok, error };
  }

  /** Отправить push всем участникам чата, кроме отправителя (Expo Push + FCM direct). */
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
          select: { expoToken: true, fcmToken: true, userId: true, platform: true },
        }),
        this.prisma.chatMember.findMany({
          where: { chatId, userId: { in: recipientIds } },
          select: { userId: true, unreadCount: true },
        }),
      ]);

      const unreadByUserId = new Map(
        unreadRows.map((r) => [r.userId, Math.max(0, r.unreadCount)]),
      );

      // Separate Android FCM tokens for direct push
      const fcmDirectTokens: { token: string; userId: string }[] = [];
      // Expo tokens for iOS (and Android fallback when no FCM token)
      const expoTokensForIos: { to: string; userId: string; platform: 'ios' | 'android' }[] = [];

      let invalidExpoTokenRows = 0;
      for (const d of devices) {
        const expoT = d.expoToken.trim();
        const fcmT = d.fcmToken?.trim() ?? '';
        const plat = d.platform === 'ios' ? 'ios' : 'android' as const;

        if (plat === 'android' && fcmT) {
          // Android with FCM token → use direct Firebase Admin push
          fcmDirectTokens.push({ token: fcmT, userId: d.userId });
        } else if (Expo.isExpoPushToken(expoT)) {
          // iOS or Android without FCM token → use Expo Push
          expoTokensForIos.push({ to: expoT, userId: d.userId, platform: plat });
        } else {
          invalidExpoTokenRows += 1;
        }
      }

      const tag = pushTagForChat(chatId);

      // --- FCM Direct Push (Android — works even when process is killed) ---
      if (fcmDirectTokens.length > 0) {
        const core = `${senderLabel}: ${preview}`;
        const fcmResult = await this.sendFcmDirectPush({
          fcmTokens: fcmDirectTokens,
          title,
          body: core.slice(0, 400),
          chatId,
          tag,
          imageUrl: avatarUrl,
        });
        this.log.log(
          `notifyNewMessage: FCM direct done chatId=${chatId} tokens=${fcmDirectTokens.length} ok=${fcmResult.ok} error=${fcmResult.error}`,
        );
      }

      // --- Expo Push (iOS + Android fallback) ---
      if (expoTokensForIos.length > 0) {
        const messages: ExpoPushMessageWithAndroid[] = expoTokensForIos.map(({ to, userId, platform }) => {
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
          if (platform === 'ios') {
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
          `notifyNewMessage: Expo push done chatId=${chatId} tokens=${expoTokensForIos.length} ok=${okTickets} error=${errTickets}`,
        );
      }

      if (fcmDirectTokens.length === 0 && expoTokensForIos.length === 0) {
        const rid = recipientIds.join(',');
        if (devices.length === 0) {
          this.log.log(
            `notifyNewMessage: skip push (no push_devices for recipient userIds=[${rid}] chatId=${chatId}) — app must POST /users/me/push-token after login + notification permission`,
          );
        } else {
          this.log.log(
            `notifyNewMessage: skip push (${devices.length} push_devices row(s), ${invalidExpoTokenRows} not valid; recipient userIds=[${rid}] chatId=${chatId})`,
          );
        }
      }
    } catch (e) {
      this.log.warn(`notifyNewMessage failed: ${String(e)}`);
    }
  }
}
