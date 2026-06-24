import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const RELAY_POLICY_KEYS = [
  'RELAY_TEXT_CACHE_SECONDS',
  'RELAY_MEDIA_CACHE_SECONDS',
  'RELAY_GROUP_TEXT_CACHE_SECONDS',
  'RELAY_CHANNEL_POST_RETENTION_SECONDS',
  'P2P_PEER_ATTEMPT_TIMEOUT_MS',
] as const;

export type RelayPolicyKey = (typeof RELAY_POLICY_KEYS)[number];

export interface RelayPolicyOverrides {
  RELAY_TEXT_CACHE_SECONDS?: number;
  RELAY_MEDIA_CACHE_SECONDS?: number;
  RELAY_GROUP_TEXT_CACHE_SECONDS?: number;
  RELAY_CHANNEL_POST_RETENTION_SECONDS?: number;
  P2P_PEER_ATTEMPT_TIMEOUT_MS?: number;
}

@Injectable()
export class AdminRelayPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverrides(): Promise<RelayPolicyOverrides> {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { in: [...RELAY_POLICY_KEYS] } },
    });
    const result: Record<string, number> = {};
    for (const row of rows) {
      const key = row.key as RelayPolicyKey;
      if (!RELAY_POLICY_KEYS.includes(key)) continue;
      const val = Number.parseInt(row.value, 10);
      if (!Number.isNaN(val)) {
        result[key] = val;
      }
    }
    return result as RelayPolicyOverrides;
  }

  async setOverrides(
    patch: RelayPolicyOverrides,
  ): Promise<RelayPolicyOverrides> {
    const entries = Object.entries(patch) as [
      RelayPolicyKey,
      number | undefined,
    ][];
    const ops = entries
      .filter(([key]) => RELAY_POLICY_KEYS.includes(key))
      .map(([key, value]) => {
        if (value === undefined || value === null) {
          return this.prisma.systemConfig.deleteMany({ where: { key } });
        }
        return this.prisma.systemConfig.upsert({
          where: { key },
          create: { key, value: String(value) },
          update: { value: String(value) },
        });
      });
    if (ops.length > 0) {
      await this.prisma.$transaction(ops);
    }
    return this.getOverrides();
  }
}
