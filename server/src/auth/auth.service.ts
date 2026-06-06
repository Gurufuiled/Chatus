import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { mapUser, type MappedUser } from '../common/mappers';
import type { User } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';

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
  ) {
    this.loginusBaseUrl = (
      process.env.LOGINUS_BASE_URL || 'https://loginus.startapus.com'
    ).replace(/\/$/, '');
    this.loginusClientId = process.env.LOGINUS_CLIENT_ID || '';
    this.loginusClientSecret = process.env.LOGINUS_CLIENT_SECRET || '';
  }

  getLoginUrl(redirectUriParam?: string): { url: string; redirect_uri: string } {
    let redirectUri =
      process.env.LOGINUS_REDIRECT_URI ||
      'http://localhost:4000/api/auth/callback';
    if (redirectUriParam === 'emulator' && process.env.LOGINUS_REDIRECT_URI_EMULATOR) {
      redirectUri = process.env.LOGINUS_REDIRECT_URI_EMULATOR;
    }
    const params = new URLSearchParams({
      client_id: this.loginusClientId || 'messenger',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile organizations roles permissions',
      state: randomUUID(),
    });
    const url = `${this.loginusBaseUrl}/ru/auth?${params.toString()}`;
    return { url, redirect_uri: redirectUri };
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
      const { data } = await axios.get<LoginusUserInfo>(userinfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
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
      }>(idToken);
      if (payload?.sub) {
        userInfo = {
          id: payload.sub,
          email: payload.email ?? null,
          firstName: payload.firstName ?? payload.first_name,
          lastName: payload.lastName ?? payload.last_name,
          phone: payload.phone ?? payload.phone_number ?? null,
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

    const user = await this.findOrCreateUser({
      ...userInfo,
      id: loginusId,
    });
    const loginusRefresh =
      tokens.refresh_token ??
      (tokens as { refreshToken?: string }).refreshToken;
    const { access_token, expires_at, refresh_token } = await this.issueTokens(
      user,
      loginusRefresh,
    );

    return {
      access_token,
      refresh_token,
      expires_at,
      user: mapUser(user),
      ...(idToken && { id_token: idToken }),
    };
  }

  private async findOrCreateUser(userInfo: LoginusUserInfo): Promise<User> {
    const loginusId = userInfo.id;
    const username = userInfo.email ?? null;
    const displayName =
      [userInfo.firstName, userInfo.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || null;

    let phone: string | null = null;
    if (userInfo.phone) {
      const raw = userInfo.phone.replace(/\D/g, '');
      if (raw.length > 0) {
        if (raw.length === 11 && raw.startsWith('8')) {
          phone = `+7${raw.slice(1)}`;
        } else if (raw.length === 11 && raw.startsWith('7')) {
          phone = `+${raw}`;
        } else if (raw.length === 10 && raw.startsWith('9')) {
          phone = `+7${raw}`;
        } else {
          phone = `+${raw}`;
        }
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { loginusId },
    });
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          username: username ?? existing.username,
          displayName: displayName ?? existing.displayName,
          ...(phone && !existing.phone ? { phone } : {}),
        },
      });
    }

    return this.prisma.user.create({
      data: {
        loginusId,
        username,
        displayName,
        phone,
      },
    });
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
