import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  type LoginusOutboundProfile,
  outboundProfileFingerprint,
  toPublicAbsoluteUrl,
} from './loginus-profile.util';

@Injectable()
export class LoginusProfileClient {
  private readonly logger = new Logger(LoginusProfileClient.name);
  private readonly apiBaseUrl: string;
  private readonly embeddedSecret: string;
  private readonly lastSyncedBySub = new Map<string, string>();

  constructor() {
    this.apiBaseUrl = (
      process.env.LOGINUS_API_BASE_URL || 'https://id.startapus.com/api/v2'
    ).replace(/\/$/, '');
    this.embeddedSecret = process.env.LOGINUS_EMBEDDED_SECRET ?? '';
  }

  resolvePublicAvatarUrl(
    avatarUrl: string | null | undefined,
  ): string | undefined {
    return toPublicAbsoluteUrl(avatarUrl);
  }

  async syncProfileToLoginus(profile: LoginusOutboundProfile): Promise<void> {
    if (!this.embeddedSecret) {
      this.logger.warn(
        'LOGINUS_EMBEDDED_SECRET not set; skip outbound profile sync',
      );
      return;
    }

    const body: LoginusOutboundProfile = { sub: profile.sub };
    if (profile.firstName) body.firstName = profile.firstName;
    if (profile.lastName) body.lastName = profile.lastName;
    if (profile.avatarUrl) body.avatarUrl = profile.avatarUrl;

    const fingerprint = outboundProfileFingerprint(body);
    if (this.lastSyncedBySub.get(profile.sub) === fingerprint) {
      return;
    }

    const url = `${this.apiBaseUrl}/embedded-apps/chatus/profile`;
    try {
      await axios.patch(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Embedded-App-Secret': this.embeddedSecret,
        },
      });
      this.lastSyncedBySub.set(profile.sub, fingerprint);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      this.logger.error('Loginus profile PATCH failed', {
        status: axiosErr?.response?.status,
        data: axiosErr?.response?.data,
        message: axiosErr?.message,
      });
      throw err;
    }
  }
}
