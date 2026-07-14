import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { mapUser, type MappedUser } from '../common/mappers';
import type { User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';
import type { LoginusProfileDto } from './dto/loginus-profile.dto';
import { UploadService } from '../upload/upload.service';
import {
  buildUserUpdateFromLoginusProfile,
  extractChatUsUploadPath,
  extractLoginusId,
  isForeignUploadAvatarPath,
  normalizeLoginusPhone,
  profileFieldsFromInitPayload,
  resolveInboundAvatarUrl,
  type LoginusInitDataPayload,
  type LoginusProfileFields,
} from './loginus-profile.util';

/** Декодирует JWT payload без проверки подписи (для id_token от Loginus). */
function decodeJwtPayload<T = Record<string, unknown>>(
  token: string,
): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export interface LoginusTokenResponse {
  access_token?: string;
  accessToken?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refreshToken?: string;
  id_token?: string;
}

export interface LoginusUserInfo {
  id: string;
  email?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  user: MappedUser;
  /** Loginus id_token for SLO (Single Logout). Optional. */
  id_token?: string;
}

@Injectable()
export class AuthService {
  private readonly loginusBaseUrl: string;
  private readonly loginusClientId: string;
  private readonly loginusClientSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly uploadService: UploadService,
  ) {
    this.loginusBaseUrl = (
      process.env.LOGINUS_BASE_URL || 'https://id.startapus.com'
    ).replace(/\/$/, '');
    this.loginusClientId = process.env.LOGINUS_CLIENT_ID || '';
    this.loginusClientSecret = process.env.LOGINUS_CLIENT_SECRET || '';
  }

  private pickLoginusAvatar(
    ...candidates: Array<string | null | undefined>
  ): string | null {
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
  }

  getLoginUrl(
    redirectUriParam?: string,
    platform?: string,
  ): { url: string; redirect_uri: string; oauth_state?: string } {
    let redirectUri =
      process.env.LOGINUS_REDIRECT_URI ||
      'http://localhost:4000/api/auth/callback';
    if (redirectUriParam === 'emulator' && process.env.LOGINUS_REDIRECT_URI_EMULATOR) {
      redirectUri = process.env.LOGINUS_REDIRECT_URI_EMULATOR;
    }
    const statePrefix = platform === 'web' ? 'web:' : '';
    const state = `${statePrefix}${randomUUID()}`;
    const params = new URLSearchParams({
      client_id: this.loginusClientId || 'messenger',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile organizations roles permissions',
      state,
    });
    const url = `${this.loginusBaseUrl}/ru/auth?${params.toString()}`;
    return {
      url,
      redirect_uri: redirectUri,
      oauth_state: platform === 'web' ? state : undefined,
    };
  }

  async logout(
    userId: string,
    idToken?: string,
  ): Promise<{ ok: boolean; slo_url?: string }> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });

    if (!idToken || !idToken.trim()) {
      return { ok: true };
    }

    const postLogoutRedirectUri =
      process.env.LOGINUS_REDIRECT_URI_LOGOUT ||
      process.env.LOGINUS_REDIRECT_URI?.replace(
        /\/api\/auth\/callback\/?(\?.*)?$/,
        '/api/auth/logout-done',
      ) ||
      'http://localhost:4000/api/auth/logout-done';

    const params = new URLSearchParams({
      id_token_hint: idToken.trim(),
      client_id: this.loginusClientId || 'messenger',
      post_logout_redirect_uri: postLogoutRedirectUri,
    });
    const sloUrl = `${this.loginusBaseUrl}/api/v2/oauth/end_session?${params.toString()}`;
    return { ok: true, slo_url: sloUrl };
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<LoginusTokenResponse> {
    const tokenUrl = `${this.loginusBaseUrl}/api/oauth/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.loginusClientId,
      client_secret: this.loginusClientSecret,
      code,
      redirect_uri: redirectUri,
    });

    try {
      const { data: res } = await axios.post<
        | LoginusTokenResponse
        | { success?: boolean; data?: LoginusTokenResponse }
      >(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      });
      const tokens =
        res && typeof res === 'object' && 'data' in res && res.data
          ? res.data
          : (res as LoginusTokenResponse);
      return tokens;
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: unknown };
        message?: string;
      };
      const errorMessage =
        (axiosErr?.response?.data as { error_description?: string })
          ?.error_description ||
        (axiosErr?.response?.data as { error?: string })?.error ||
        axiosErr?.message ||
        'Failed to exchange authorization code for token';
      throw new UnauthorizedException(errorMessage);
    }
  }

  async getUserInfo(accessToken: string): Promise<LoginusUserInfo> {
    if (!accessToken || accessToken.length < 10) {
      throw new UnauthorizedException(
        'Loginus returned empty or invalid access_token. Check LOGINUS_CLIENT_ID/SECRET and redirect_uri.',
      );
    }
    const userinfoUrl = `${this.loginusBaseUrl}/api/v2/oauth/userinfo`;

    try {
      const { data } = await axios.get<Record<string, unknown>>(userinfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const id =
        (typeof data.id === 'string' && data.id) ||
        (typeof data.sub === 'string' && data.sub) ||
        '';
      return {
        id,
        email:
          typeof data.email === 'string'
            ? data.email
            : ((data.email as string | null | undefined) ?? null),
        firstName:
          (typeof data.firstName === 'string' && data.firstName) ||
          (typeof data.first_name === 'string' && data.first_name) ||
          undefined,
        lastName:
          (typeof data.lastName === 'string' && data.lastName) ||
          (typeof data.last_name === 'string' && data.last_name) ||
          undefined,
        phone:
          (typeof data.phone === 'string' && data.phone) ||
          (typeof data.phone_number === 'string' && data.phone_number) ||
          null,
        avatarUrl: this.pickLoginusAvatar(
          typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
          typeof data.avatar_url === 'string' ? data.avatar_url : null,
          typeof data.avatar === 'string' ? data.avatar : null,
          typeof data.picture === 'string' ? data.picture : null,
          typeof data.photo === 'string' ? data.photo : null,
        ),
      };
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      const status = axiosErr?.response?.status;
      const body = axiosErr?.response?.data;
      const msg =
        typeof body === 'object' && body !== null && 'error_description' in body
          ? (body as { error_description?: string }).error_description
          : typeof body === 'object' && body !== null && 'message' in body
            ? (body as { message?: string }).message
            : axiosErr?.message;
      console.error('[Auth] Loginus userinfo failed:', { status, body, msg });
      throw new UnauthorizedException(
        msg ||
          `Invalid or expired access token (Loginus: ${status ?? 'unknown'})`,
      );
    }
  }

  verifyInitData(initData: string): LoginusInitDataPayload {
    const embeddedSecret = process.env.LOGINUS_EMBEDDED_SECRET;
    if (!embeddedSecret) {
      throw new BadRequestException('LOGINUS_EMBEDDED_SECRET must be configured');
    }

    let payload: LoginusInitDataPayload;
    try {
      payload = this.jwtService.verify(initData, {
        secret: embeddedSecret,
        algorithms: ['HS256'],
      }) as LoginusInitDataPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired initData');
    }

    if (payload.aud !== 'embedded_app') {
      throw new UnauthorizedException('Invalid initData audience');
    }

    const expectedAppSlug = process.env.LOGINUS_EMBEDDED_APP_SLUG;
    if (expectedAppSlug && payload.appSlug !== expectedAppSlug) {
      throw new UnauthorizedException('Invalid initData appSlug');
    }

    if (typeof payload.time !== 'number') {
      throw new UnauthorizedException('initData missing time');
    }
    const ageSec = Math.floor(Date.now() / 1000) - payload.time;
    if (ageSec > 300 || ageSec < -60) {
      throw new UnauthorizedException('initData expired or invalid time');
    }

    if (!extractLoginusId(payload)) {
      throw new BadRequestException('initData missing sub');
    }

    return payload;
  }

  private profileOverrideFromDto(
    profileDto: LoginusProfileDto | undefined,
    loginusId: string,
  ): Partial<LoginusProfileFields> | undefined {
    if (!profileDto) return undefined;
    return {
      loginusId: profileDto.sub ?? profileDto.userId ?? loginusId,
      email: profileDto.email ?? null,
      firstName: profileDto.firstName ?? null,
      lastName: profileDto.lastName ?? null,
      avatarUrl:
        profileDto.avatarUrl ?? profileDto.avatar_url ?? profileDto.avatar ?? null,
    };
  }

  async syncProfileFromInitData(
    userId: string,
    initData: string,
    profileDto?: LoginusProfileDto,
  ): Promise<MappedUser> {
    const payload = this.verifyInitData(initData);
    const loginusId = extractLoginusId(payload);
    if (!loginusId) {
      throw new BadRequestException('initData missing sub');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.loginusId || user.loginusId !== loginusId) {
      throw new UnauthorizedException('initData sub does not match authenticated user');
    }

    const refreshed = await this.applyLoginusProfileToUser(
      user,
      profileFieldsFromInitPayload(
        payload,
        this.profileOverrideFromDto(profileDto, loginusId),
      ),
    );
    return mapUser(refreshed);
  }

  async loginWithInitData(
    initData: string,
    profileDto?: LoginusProfileDto,
  ): Promise<AuthResponse> {
    const payload = this.verifyInitData(initData);
    const loginusId = extractLoginusId(payload)!;
    const fields = profileFieldsFromInitPayload(
      payload,
      this.profileOverrideFromDto(profileDto, loginusId),
    );

    const userInfo: LoginusUserInfo = {
      id: loginusId,
      email: payload.email?.trim() || null,
      firstName: fields.firstName ?? undefined,
      lastName: fields.lastName ?? undefined,
      phone: fields.phone ?? null,
    };

    const user = await this.findOrCreateUser(userInfo);
    const refreshedUser = await this.applyLoginusProfileToUser(user, fields);

    const { access_token, expires_at, refresh_token } =
      await this.issueTokens(refreshedUser, randomUUID());

    return {
      access_token,
      refresh_token,
      expires_at,
      user: mapUser(refreshedUser),
    };
  }

  async loginWithCode(
    code: string,
    redirectUri: string,
  ): Promise<AuthResponse> {
    if (!this.loginusClientId || !this.loginusClientSecret) {
      throw new BadRequestException(
        'LOGINUS_CLIENT_ID and LOGINUS_CLIENT_SECRET must be configured',
      );
    }
    const tokens = await this.exchangeCodeForToken(code, redirectUri);
    const loginusAccessToken = tokens.access_token ?? tokens.accessToken ?? '';
    if (!loginusAccessToken) {
      throw new UnauthorizedException(
        'Loginus did not return access_token. Check client config and redirect_uri.',
      );
    }
    let userInfo: LoginusUserInfo;
    const idToken = tokens.id_token;
    if (idToken) {
      const payload = decodeJwtPayload<{
        sub?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        phone_number?: string;
        avatarUrl?: string;
        avatar_url?: string;
        avatar?: string;
        picture?: string;
        photo?: string;
      }>(idToken);
      if (payload?.sub) {
        userInfo = {
          id: payload.sub,
          email: payload.email ?? null,
          firstName: payload.firstName ?? payload.first_name,
          lastName: payload.lastName ?? payload.last_name,
          phone: payload.phone ?? payload.phone_number ?? null,
          avatarUrl: this.pickLoginusAvatar(
            payload.avatarUrl,
            payload.avatar_url,
            payload.avatar,
            payload.picture,
            payload.photo,
          ),
        };
      } else {
        userInfo = await this.getUserInfo(loginusAccessToken);
      }
    } else {
      userInfo = await this.getUserInfo(loginusAccessToken);
    }

    const loginusId = userInfo.id ?? (userInfo as { sub?: string }).sub;
    if (!loginusId) {
      throw new BadRequestException('Loginus userinfo missing id');
    }

    // Prefer userinfo avatar when id_token lacked one.
    if (!userInfo.avatarUrl) {
      try {
        const fresh = await this.getUserInfo(loginusAccessToken);
        if (fresh.avatarUrl) userInfo.avatarUrl = fresh.avatarUrl;
        if (!userInfo.firstName && fresh.firstName) userInfo.firstName = fresh.firstName;
        if (!userInfo.lastName && fresh.lastName) userInfo.lastName = fresh.lastName;
      } catch {
        /* id_token path already succeeded; avatar is best-effort */
      }
    }

    const user = await this.findOrCreateUser({
      ...userInfo,
      id: loginusId,
    });
    const refreshedUser = await this.applyLoginusProfileToUser(user, {
      loginusId,
      email: userInfo.email ?? null,
      firstName: userInfo.firstName ?? null,
      lastName: userInfo.lastName ?? null,
      avatarUrl: userInfo.avatarUrl ?? null,
      phone: userInfo.phone ?? null,
    });
    const loginusRefresh =
      tokens.refresh_token ??
      (tokens as { refreshToken?: string }).refreshToken;
    const { access_token, expires_at, refresh_token } = await this.issueTokens(
      refreshedUser,
      loginusRefresh,
    );

    return {
      access_token,
      refresh_token,
      expires_at,
      user: mapUser(refreshedUser),
      ...(idToken && { id_token: idToken }),
    };
  }

  private async applyLoginusProfileToUser(
    user: User,
    fields: LoginusProfileFields,
  ): Promise<User> {
    const { data } = buildUserUpdateFromLoginusProfile(user, fields);

    // Cache Loginus avatars into ChatUs storage. Heal foreign `/uploads/avatars/...`
    // even when the current Loginus payload omits avatar.
    const avatarSource =
      fields.avatarUrl?.trim() ||
      (isForeignUploadAvatarPath(user.avatarUrl) ? user.avatarUrl : null);
    const inboundAvatar = resolveInboundAvatarUrl(user.avatarUrl, avatarSource);
    if (inboundAvatar !== undefined) {
      const ownedPath = extractChatUsUploadPath(inboundAvatar);
      if (ownedPath) {
        if (ownedPath !== (user.avatarUrl ?? null)) {
          data.avatarUrl = ownedPath;
        } else {
          delete data.avatarUrl;
        }
      } else {
        const cached = await this.uploadService.cacheRemoteAvatar(inboundAvatar);
        if (cached) {
          if (cached !== (user.avatarUrl ?? null)) {
            data.avatarUrl = cached;
          } else {
            delete data.avatarUrl;
          }
        } else if (isForeignUploadAvatarPath(user.avatarUrl)) {
          data.avatarUrl = null;
        } else if (/^https?:\/\//i.test(inboundAvatar)) {
          // Non-allowlisted CDN (e.g. Yandex): keep absolute URL as hotlink fallback.
          if (inboundAvatar !== (user.avatarUrl ?? null)) {
            data.avatarUrl = inboundAvatar;
          } else {
            delete data.avatarUrl;
          }
        } else {
          delete data.avatarUrl;
        }
      }
    }

    let phoneUpdate = data.phone;
    if (phoneUpdate) {
      const phoneOwner = await this.prisma.user.findUnique({
        where: { phone: phoneUpdate },
        select: { id: true },
      });
      if (phoneOwner && phoneOwner.id !== user.id) {
        delete data.phone;
        phoneUpdate = undefined;
      }
    }

    if (data.username) {
      const usernameOwner = await this.prisma.user.findUnique({
        where: { username: data.username },
        select: { id: true },
      });
      if (usernameOwner && usernameOwner.id !== user.id) {
        delete data.username;
      }
    }

    if (Object.keys(data).length === 0) return user;

    try {
      return await this.prisma.user.update({
        where: { id: user.id },
        data,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return user;
      }
      throw err;
    }
  }

  private async findOrCreateUser(userInfo: LoginusUserInfo): Promise<User> {
    const loginusId = userInfo.id;
    const username = userInfo.email ?? null;
    const displayName = userInfo.firstName?.trim() || null;
    const lastName = userInfo.lastName?.trim() || null;
    const phone = normalizeLoginusPhone(userInfo.phone);

    const existing = await this.prisma.user.findUnique({
      where: { loginusId },
    });
    if (existing) {
      const updateData: Prisma.UserUpdateInput = {};
      if (username && username !== existing.username) {
        const usernameOwner = await this.prisma.user.findUnique({
          where: { username },
          select: { id: true },
        });
        if (!usernameOwner || usernameOwner.id === existing.id) {
          updateData.username = username;
        }
      }
      if (userInfo.firstName !== undefined) {
        updateData.displayName = displayName;
      }
      if (userInfo.lastName !== undefined) {
        updateData.lastName = lastName;
      }

      let phoneUpdate: string | undefined;
      if (phone && !existing.phone) {
        const phoneOwner = await this.prisma.user.findUnique({
          where: { phone },
          select: { id: true },
        });
        if (!phoneOwner || phoneOwner.id === existing.id) {
          phoneUpdate = phone;
        }
      }

      if (
        Object.keys(updateData).length === 0 &&
        !phoneUpdate
      ) {
        return existing;
      }

      try {
        return await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            ...(phoneUpdate ? { phone: phoneUpdate } : {}),
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const target = Array.isArray(err.meta?.target)
            ? (err.meta.target as string[])
            : [];
          const isUsernameConflict = target.some(
            (f) => f === 'username' || f === 'users_username_key',
          );
          const isPhoneConflict = target.some(
            (f) => f === 'phone' || f === 'users_phone_key',
          );
          const retryData: Prisma.UserUpdateInput = { ...updateData };
          let retryPhone = phoneUpdate;
          if (isUsernameConflict) {
            console.warn(
              `[Auth] Dropping username update for user ${existing.id}: "${String(updateData.username)}" already taken by another account`,
            );
            delete retryData.username;
          }
          if (isPhoneConflict) {
            console.warn(
              `[Auth] Dropping phone update for user ${existing.id}: phone already taken by another account`,
            );
            retryPhone = undefined;
          }
          if (Object.keys(retryData).length === 0 && !retryPhone) {
            return existing;
          }
          return this.prisma.user.update({
            where: { id: existing.id },
            data: {
              ...retryData,
              ...(retryPhone ? { phone: retryPhone } : {}),
            },
          });
        }
        throw err;
      }
    }

    let createPhone = phone;
    if (createPhone) {
      const phoneOwner = await this.prisma.user.findUnique({
        where: { phone: createPhone },
        select: { id: true },
      });
      if (phoneOwner) {
        createPhone = null;
      }
    }

    if (username) {
      const byUsername = await this.prisma.user.findUnique({
        where: { username },
      });
      if (byUsername) {
        if (byUsername.loginusId === loginusId) {
          return byUsername;
        }
        if (!byUsername.loginusId) {
          let linkPhone: string | undefined;
          if (createPhone && !byUsername.phone) {
            const phoneOwner = await this.prisma.user.findUnique({
              where: { phone: createPhone },
              select: { id: true },
            });
            if (!phoneOwner || phoneOwner.id === byUsername.id) {
              linkPhone = createPhone;
            }
          }
          try {
            return await this.prisma.user.update({
              where: { id: byUsername.id },
              data: {
                loginusId,
                displayName: displayName ?? byUsername.displayName,
                lastName: lastName ?? byUsername.lastName,
                ...(linkPhone ? { phone: linkPhone } : {}),
              },
            });
          } catch (err) {
            if (
              err instanceof Prisma.PrismaClientKnownRequestError &&
              err.code === 'P2002'
            ) {
              const raced = await this.prisma.user.findUnique({
                where: { loginusId },
              });
              if (raced) return raced;
            }
            throw err;
          }
        }
      }
    }

    let createUsername = username;
    if (createUsername) {
      const usernameOwner = await this.prisma.user.findUnique({
        where: { username: createUsername },
        select: { id: true },
      });
      if (usernameOwner) {
        createUsername = null;
      }
    }

    try {
      return await this.prisma.user.create({
        data: {
          loginusId,
          username: createUsername,
          displayName,
          lastName,
          phone: createPhone,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.user.findUnique({ where: { loginusId } });
        if (raced) return raced;

        const target = Array.isArray(err.meta?.target)
          ? (err.meta.target as string[])
          : [];
        const isPhoneConflict =
          target.length === 0 ||
          target.some((f) => f === 'phone' || f === 'users_phone_key');
        const isUsernameConflict =
          target.length === 0 ||
          target.some((f) => f === 'username' || f === 'users_username_key');
        if (isPhoneConflict && createPhone) {
          return this.prisma.user.create({
            data: {
              loginusId,
              username: createUsername,
              displayName,
              lastName,
              phone: null,
            },
          });
        }
        if (isUsernameConflict && createUsername) {
          return this.prisma.user.create({
            data: {
              loginusId,
              username: null,
              displayName,
              lastName,
              phone: createPhone,
            },
          });
        }
      }
      throw err;
    }
  }

  private async issueTokens(
    user: User,
    loginusRefreshToken?: string,
  ): Promise<{
    access_token: string;
    expires_at: number;
    refresh_token?: string;
  }> {
    const payload = { sub: user.id };
    const accessToken = this.jwtService.sign(payload);
    const jwtExpiresSeconds = parseInt(
      process.env.JWT_EXPIRES_IN ?? '3600',
      10,
    );
    const expiresAt = Date.now() + jwtExpiresSeconds * 1000;

    let refreshToken: string | undefined;
    if (loginusRefreshToken) {
      refreshToken = randomUUID();
      const expiresAtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          expiresAt: expiresAtDate,
        },
      });
    }

    return {
      access_token: accessToken,
      expires_at: expiresAt,
      refresh_token: refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_at: number;
  }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.delete({ where: { id: record.id } });

    const payload = { sub: record.user.id };
    const accessToken = this.jwtService.sign(payload);
    const jwtExpiresSeconds = parseInt(
      process.env.JWT_EXPIRES_IN ?? '3600',
      10,
    );
    const expiresAt = Date.now() + jwtExpiresSeconds * 1000;

    const newRefreshToken = randomUUID();
    const expiresAtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: record.userId,
        token: newRefreshToken,
        expiresAt: expiresAtDate,
      },
    });

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_at: expiresAt,
    };
  }

  async validateUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }
}
