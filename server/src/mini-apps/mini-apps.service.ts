import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { MiniApp } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEVELOPER_AGREEMENT_VERSION,
  INIT_PAYLOAD_TTL_SECONDS,
  MINI_APP_DEFAULT_EXTRA_HOSTS,
  SESSION_TOKEN_TTL_SECONDS,
} from './mini-apps.constants';

export interface MiniAppPublicDto {
  id: string;
  short_id: string;
  title: string;
  description: string | null;
  icon_url: string | null;
  base_url: string;
  is_published: boolean;
  created_at: string;
}

export interface MiniAppOwnerDto extends MiniAppPublicDto {
  secret: string;
  allowed_hosts: string[];
}

export interface InitPayload {
  app_id: string;
  user: {
    id: string;
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };
  auth_date: number;
  nonce: string;
  exp: number;
}

export interface SessionBundle {
  init_data: string;
  expires_at: number;
  base_url: string;
  app_id: string;
  /** Hostnames the in-app WebView may load (OAuth redirects, CDN, etc.). */
  allowed_hosts: string[];
}

export interface SessionTokenBundle {
  session_token: string;
  expires_at: number;
  user_id: string;
  app_id: string;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(str: string): Buffer {
  const padded = str + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Merge app URL host + DB allowlist + shared OAuth hosts for WebView navigation policy. */
function buildMiniAppAllowedHosts(
  baseUrl: string,
  dbHosts: string[],
): string[] {
  const set = new Set<string>();
  try {
    set.add(new URL(baseUrl).host.toLowerCase());
  } catch {
    /* ignore */
  }
  for (const h of dbHosts ?? []) {
    const t = typeof h === 'string' ? h.trim().toLowerCase() : '';
    if (t) set.add(t);
  }
  for (const h of MINI_APP_DEFAULT_EXTRA_HOSTS) {
    set.add(h);
  }
  return [...set];
}

@Injectable()
export class MiniAppsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Developer profile ---

  async ensureDeveloper(userId: string) {
    const existing = await this.prisma.developerProfile.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new ForbiddenException(
        'Оферта не подписана. Подтвердите согласие у @ChatusFather.',
      );
    }
    return existing;
  }

  async acceptAgreement(userId: string) {
    return this.prisma.developerProfile.upsert({
      where: { userId },
      create: {
        userId,
        agreementAcceptedAt: new Date(),
        agreementVersion: DEVELOPER_AGREEMENT_VERSION,
      },
      update: {
        agreementAcceptedAt: new Date(),
        agreementVersion: DEVELOPER_AGREEMENT_VERSION,
      },
    });
  }

  async isDeveloper(userId: string): Promise<boolean> {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { userId },
    });
    return !!profile;
  }

  // --- Mini App CRUD ---

  async createApp(
    ownerId: string,
    input: {
      title: string;
      base_url: string;
      description?: string;
      icon_url?: string;
    },
  ): Promise<MiniAppOwnerDto> {
    await this.ensureDeveloper(ownerId);
    this.validateHttpsUrl(input.base_url);

    const host = new URL(input.base_url).host.toLowerCase();
    const title = input.title?.trim();
    if (!title || title.length < 2 || title.length > 64) {
      throw new BadRequestException('Название должно быть от 2 до 64 символов');
    }

    const shortId = this.generateShortId();
    const secret = randomBytes(32).toString('hex');

    const app = await this.prisma.miniApp.create({
      data: {
        id: randomUUID(),
        shortId,
        ownerId,
        title,
        description: input.description?.trim() || null,
        iconUrl: input.icon_url?.trim() || null,
        baseUrl: input.base_url,
        allowedHosts: [host],
        secret,
        isPublished: true, // v1: auto-publish
      },
    });

    return this.toOwnerDto(app);
  }

  async updateApp(
    ownerId: string,
    appId: string,
    patch: Partial<{
      title: string;
      description: string;
      icon_url: string;
      base_url: string;
      is_published: boolean;
    }>,
  ): Promise<MiniAppOwnerDto> {
    const app = await this.getOwnedAppOrThrow(ownerId, appId);

    const data: Parameters<PrismaService['miniApp']['update']>[0]['data'] = {};
    if (patch.title !== undefined) {
      const t = patch.title.trim();
      if (t.length < 2 || t.length > 64) {
        throw new BadRequestException(
          'Название должно быть от 2 до 64 символов',
        );
      }
      data.title = t;
    }
    if (patch.description !== undefined)
      data.description = patch.description.trim() || null;
    if (patch.icon_url !== undefined)
      data.iconUrl = patch.icon_url.trim() || null;
    if (patch.base_url !== undefined) {
      this.validateHttpsUrl(patch.base_url);
      data.baseUrl = patch.base_url;
      data.allowedHosts = [new URL(patch.base_url).host.toLowerCase()];
    }
    if (patch.is_published !== undefined) data.isPublished = patch.is_published;

    const updated = await this.prisma.miniApp.update({
      where: { id: app.id },
      data,
    });
    return this.toOwnerDto(updated);
  }

  async deleteApp(ownerId: string, appId: string): Promise<void> {
    const app = await this.getOwnedAppOrThrow(ownerId, appId);
    await this.prisma.miniApp.delete({ where: { id: app.id } });
  }

  async listOwnedApps(ownerId: string): Promise<MiniAppOwnerDto[]> {
    const apps = await this.prisma.miniApp.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return apps.map((a) => this.toOwnerDto(a));
  }

  async listPublishedApps(): Promise<MiniAppPublicDto[]> {
    const apps = await this.prisma.miniApp.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
    });
    return apps.map((a) => this.toPublicDto(a));
  }

  async getPublicApp(appId: string): Promise<MiniAppPublicDto> {
    const app = await this.findAppByIdOrShortId(appId);
    if (!app.isPublished) throw new NotFoundException('Mini App not found');
    return this.toPublicDto(app);
  }

  // --- Init payload / sessions ---

  async createInitBundle(
    appId: string,
    userId: string,
  ): Promise<SessionBundle> {
    const app = await this.findAppByIdOrShortId(appId);
    if (!app.isPublished) {
      throw new NotFoundException('Mini App not found or not published');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, username: true, avatarUrl: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const now = Math.floor(Date.now() / 1000);
    const payload: InitPayload = {
      app_id: app.shortId,
      user: {
        id: user.id,
        display_name: user.displayName,
        username: user.username,
        avatar_url: user.avatarUrl,
      },
      auth_date: now,
      nonce: randomBytes(8).toString('hex'),
      exp: now + INIT_PAYLOAD_TTL_SECONDS,
    };

    const init_data = this.signPayload(payload, app.secret);

    return {
      init_data,
      expires_at: payload.exp,
      base_url: app.baseUrl,
      app_id: app.shortId,
      allowed_hosts: buildMiniAppAllowedHosts(app.baseUrl, app.allowedHosts),
    };
  }

  async exchangeInitData(
    appId: string,
    initData: string,
  ): Promise<SessionTokenBundle> {
    const app = await this.findAppByIdOrShortId(appId);
    const payload = this.verifyInitData(initData, app.secret);
    if (payload.app_id !== app.shortId) {
      throw new UnauthorizedException('app_id mismatch');
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + SESSION_TOKEN_TTL_SECONDS;
    const session = {
      sub: payload.user.id,
      app: app.shortId,
      iat: now,
      exp,
      kind: 'miniapp_session' as const,
    };
    const session_token = this.signPayload(session, app.secret);

    return {
      session_token,
      expires_at: exp,
      user_id: payload.user.id,
      app_id: app.shortId,
    };
  }

  // --- sendData ---

  async receiveSendData(
    appId: string,
    initData: string,
    data: string,
  ): Promise<{ accepted: boolean; user_id: string }> {
    const app = await this.findAppByIdOrShortId(appId);
    const payload = this.verifyInitData(initData, app.secret);
    if (payload.app_id !== app.shortId) {
      throw new UnauthorizedException('app_id mismatch');
    }
    // v1: no size/rate limits; payload is accepted and available to developer via webhook later.
    // Currently we just acknowledge; extension point for webhook delivery later.
    if (typeof data !== 'string') {
      throw new BadRequestException('data must be string');
    }
    return { accepted: true, user_id: payload.user.id };
  }

  // --- helpers ---

  private signPayload(payload: object, secret: string): string {
    const b64 = b64urlEncode(JSON.stringify(payload));
    const sig = createHmac('sha256', secret).update(b64).digest('hex');
    return `${b64}.${sig}`;
  }

  verifyInitData(initData: string, secret: string): InitPayload {
    const parts = initData.split('.');
    if (parts.length !== 2)
      throw new UnauthorizedException('Bad init_data format');
    const [b64, sig] = parts;
    const expected = createHmac('sha256', secret).update(b64).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Bad signature');
    }
    let payload: InitPayload;
    try {
      payload = JSON.parse(b64urlDecode(b64).toString('utf8')) as InitPayload;
    } catch {
      throw new UnauthorizedException('Bad init_data payload');
    }
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('init_data expired');
    }
    return payload;
  }

  private validateHttpsUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('URL некорректный');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Разрешены только HTTPS URL');
    }
  }

  private generateShortId(): string {
    return `app_${randomBytes(5).toString('hex')}`;
  }

  private async getOwnedAppOrThrow(
    ownerId: string,
    appId: string,
  ): Promise<MiniApp> {
    const app = await this.findAppByIdOrShortId(appId);
    if (app.ownerId !== ownerId) {
      throw new ForbiddenException('Not your app');
    }
    return app;
  }

  private async findAppByIdOrShortId(key: string): Promise<MiniApp> {
    const app = await this.prisma.miniApp.findFirst({
      where: {
        OR: [{ id: key }, { shortId: key }],
      },
    });
    if (!app) throw new NotFoundException('Mini App not found');
    return app;
  }

  private toPublicDto(app: MiniApp): MiniAppPublicDto {
    return {
      id: app.id,
      short_id: app.shortId,
      title: app.title,
      description: app.description,
      icon_url: app.iconUrl,
      base_url: app.baseUrl,
      is_published: app.isPublished,
      created_at: app.createdAt.toISOString(),
    };
  }

  private toOwnerDto(app: MiniApp): MiniAppOwnerDto {
    return {
      ...this.toPublicDto(app),
      secret: app.secret,
      allowed_hosts: app.allowedHosts,
    };
  }
}
