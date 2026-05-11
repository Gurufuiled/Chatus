import { Body, Controller, ForbiddenException, Get, Patch, Request, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RelayPolicyConfig } from '../config';
import { AdminRelayPolicyService, RelayPolicyOverrides } from './admin-relay-policy.service';

/** Comma-separated user UUIDs permitted to adjust relay overrides (JWT `sub`). */
function parseRelayPolicyAdminIds(): Set<string> {
  const raw = process.env.CHATUS_RELAY_POLICY_ADMIN_IDS ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

@Controller('admin/relay-policy')
@UseGuards(JwtAuthGuard)
export class AdminRelayPolicyController {
  constructor(
    private readonly adminRelayPolicyService: AdminRelayPolicyService,
    private readonly relayPolicy: RelayPolicyConfig,
  ) {}

  @Get()
  async getPolicy(@Request() req: { user: User }) {
    this.assertRelayPolicyAdmin(req.user);
    const envPolicy = this.relayPolicy.getPolicy();
    const overrides = await this.adminRelayPolicyService.getOverrides();
    return {
      env: {
        RELAY_TEXT_CACHE_SECONDS: envPolicy.textCacheSeconds,
        RELAY_MEDIA_CACHE_SECONDS: envPolicy.mediaCacheSeconds,
        RELAY_GROUP_TEXT_CACHE_SECONDS: envPolicy.groupTextCacheSeconds,
        RELAY_CHANNEL_POST_RETENTION_SECONDS: envPolicy.channelPostRetentionSeconds,
        P2P_PEER_ATTEMPT_TIMEOUT_MS: envPolicy.peerAttemptTimeoutMs,
      },
      overrides,
      effective: {
        RELAY_TEXT_CACHE_SECONDS: overrides.RELAY_TEXT_CACHE_SECONDS ?? envPolicy.textCacheSeconds,
        RELAY_MEDIA_CACHE_SECONDS: overrides.RELAY_MEDIA_CACHE_SECONDS ?? envPolicy.mediaCacheSeconds,
        RELAY_GROUP_TEXT_CACHE_SECONDS:
          overrides.RELAY_GROUP_TEXT_CACHE_SECONDS ?? envPolicy.groupTextCacheSeconds,
        RELAY_CHANNEL_POST_RETENTION_SECONDS:
          overrides.RELAY_CHANNEL_POST_RETENTION_SECONDS ?? envPolicy.channelPostRetentionSeconds,
        P2P_PEER_ATTEMPT_TIMEOUT_MS:
          overrides.P2P_PEER_ATTEMPT_TIMEOUT_MS ?? envPolicy.peerAttemptTimeoutMs,
      },
    };
  }

  @Patch()
  async patchPolicy(
    @Request() req: { user: User },
    @Body() body: RelayPolicyOverrides,
  ): Promise<RelayPolicyOverrides> {
    this.assertRelayPolicyAdmin(req.user);
    return this.adminRelayPolicyService.setOverrides(body);
  }

  private assertRelayPolicyAdmin(user: User): void {
    const allowed = parseRelayPolicyAdminIds();
    if (allowed.size === 0) {
      throw new ForbiddenException('Relay policy admin allowlist not configured');
    }
    if (!allowed.has(user.id)) {
      throw new ForbiddenException('Relay policy admin access required');
    }
  }
}
