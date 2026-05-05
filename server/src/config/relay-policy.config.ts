import { Injectable } from '@nestjs/common';
import { Transport } from '@prisma/client';

export type RelayMode = 'standard' | 'minimal' | 'pop_like';

export interface RelayPolicySnapshot {
  peerAttemptTimeoutMs: number;
  peerMetricsEnabled: boolean;
  mode: RelayMode;
  textCacheSeconds: number;
  deleteAfterAllDevicesAck: boolean;
  mediaCacheSeconds: number;
  mediaRetainUntilDownload: boolean;
  mediaMaxBytes: number | null;
  groupTextCacheSeconds: number | null;
  channelPostRetentionSeconds: number | null;
  channelMediaMinRetentionSeconds: number | null;
  fanoutMaxConcurrent: number | null;
  defaultTransport: Transport;
}

const RELAY_MODES: readonly RelayMode[] = ['standard', 'minimal', 'pop_like'];

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseNonNegativeInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number | null,
): number | null {
  const raw = readEnv(env, name);
  if (!raw) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    return fallback;
  }
  return parseInt(raw, 10);
}

function parsePositiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const value = parseNonNegativeInt(env, name, fallback);
  return value && value > 0 ? value : fallback;
}

function parseBoolean(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const raw = readEnv(env, name)?.toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === '1' || raw === 'true') {
    return true;
  }
  if (raw === '0' || raw === 'false') {
    return false;
  }
  return fallback;
}

function parseRelayMode(env: NodeJS.ProcessEnv): RelayMode {
  const raw = readEnv(env, 'RELAY_MODE')?.toLowerCase();
  if (raw && RELAY_MODES.includes(raw as RelayMode)) {
    return raw as RelayMode;
  }
  return 'standard';
}

export function loadRelayPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RelayPolicySnapshot {
  return {
    peerAttemptTimeoutMs: parsePositiveInt(env, 'P2P_PEER_ATTEMPT_TIMEOUT_MS', 2500),
    peerMetricsEnabled: parseBoolean(env, 'P2P_PEER_METRICS_ENABLED', true),
    mode: parseRelayMode(env),
    textCacheSeconds: parseNonNegativeInt(env, 'RELAY_TEXT_CACHE_SECONDS', 0) ?? 0,
    deleteAfterAllDevicesAck: parseBoolean(
      env,
      'RELAY_DELETE_AFTER_ALL_DEVICES_ACK',
      false,
    ),
    mediaCacheSeconds: parseNonNegativeInt(env, 'RELAY_MEDIA_CACHE_SECONDS', 0) ?? 0,
    mediaRetainUntilDownload: parseBoolean(
      env,
      'RELAY_MEDIA_RETAIN_UNTIL_DOWNLOAD',
      true,
    ),
    mediaMaxBytes: parseNonNegativeInt(env, 'RELAY_MEDIA_MAX_BYTES', null),
    groupTextCacheSeconds: parseNonNegativeInt(
      env,
      'RELAY_GROUP_TEXT_CACHE_SECONDS',
      null,
    ),
    channelPostRetentionSeconds: parseNonNegativeInt(
      env,
      'RELAY_CHANNEL_POST_RETENTION_SECONDS',
      null,
    ),
    channelMediaMinRetentionSeconds: parseNonNegativeInt(
      env,
      'RELAY_CHANNEL_MEDIA_MIN_RETENTION_SECONDS',
      null,
    ),
    fanoutMaxConcurrent: parseNonNegativeInt(
      env,
      'RELAY_FANOUT_MAX_CONCURRENT',
      null,
    ),
    defaultTransport: Transport.websocket,
  };
}

@Injectable()
export class RelayPolicyConfig {
  private readonly policy = loadRelayPolicyFromEnv();

  getPolicy(): RelayPolicySnapshot {
    return this.policy;
  }

  getDefaultTransport(): Transport {
    return this.policy.defaultTransport;
  }
}
