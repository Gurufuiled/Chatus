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
  lineSyncTailCount: number;
  lineSyncTailTtlSeconds: number;
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
  /** Default 86400 (1 day): private-chat text mailbox TTL when peer is offline; set to 0 to disable. */
  const textCacheSeconds =
    parseNonNegativeInt(env, 'RELAY_TEXT_CACHE_SECONDS', 86400) ?? 86400;
  return {
    peerAttemptTimeoutMs: parsePositiveInt(
      env,
      'P2P_PEER_ATTEMPT_TIMEOUT_MS',
      2500,
    ),
    peerMetricsEnabled: parseBoolean(env, 'P2P_PEER_METRICS_ENABLED', true),
    mode: parseRelayMode(env),
    textCacheSeconds,
    deleteAfterAllDevicesAck: parseBoolean(
      env,
      'RELAY_DELETE_AFTER_ALL_DEVICES_ACK',
      false,
    ),
    /** Default 86400 (1 day): mailbox fallback media TTL when peer is offline; set to 0 to disable. */
    mediaCacheSeconds:
      parseNonNegativeInt(env, 'RELAY_MEDIA_CACHE_SECONDS', 86400) ?? 86400,
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
    lineSyncTailCount: parsePositiveInt(env, 'LINE_SYNC_TAIL_COUNT', 10),
    lineSyncTailTtlSeconds:
      parseNonNegativeInt(
        env,
        'LINE_SYNC_TAIL_TTL_SECONDS',
        textCacheSeconds,
      ) ?? textCacheSeconds,
    defaultTransport: Transport.websocket,
  };
}

export type EffectiveCachePolicy = {
  /** How long to keep text in server mailbox (0 = no enforced TTL). */
  textCacheSeconds: number;
  /** How long to keep media blobs in server mailbox (0 = no enforced TTL). */
  mediaCacheSeconds: number;
};

/** Chat types understood by the policy resolver. */
export type MailboxChatType = 'private' | 'group' | 'channel' | 'discussion';

export type MailboxMessageType =
  | 'text'
  | 'image'
  | 'voice'
  | 'video_note'
  | 'video'
  | 'file'
  | 'system';

export type EffectiveMessageCachePolicy = EffectiveCachePolicy & {
  messageType: MailboxMessageType | string;
  metadataCacheSeconds: number;
  blobCacheSeconds: number | null;
  hasMediaBlob: boolean;
  mediaRetainUntilDownload: boolean;
  mediaMaxBytes: number | null;
};

export type ChannelPostPolicy = {
  postRetentionSeconds: number;
  mediaMinRetentionSeconds: number;
  fanoutMaxConcurrent: number | null;
};

export type LineSyncTailPolicy = {
  retainLastN: number;
  ttlSeconds: number;
};

const MEDIA_MESSAGE_TYPES = new Set<MailboxMessageType>([
  'image',
  'voice',
  'video_note',
  'video',
  'file',
]);

export function computeEffectiveCachePolicy(
  snapshot: RelayPolicySnapshot,
  chatType: MailboxChatType | string,
): EffectiveCachePolicy {
  if (chatType === 'group') {
    return {
      textCacheSeconds:
        snapshot.groupTextCacheSeconds ?? snapshot.textCacheSeconds,
      mediaCacheSeconds: snapshot.mediaCacheSeconds,
    };
  }

  if (chatType === 'channel' || chatType === 'discussion') {
    return {
      textCacheSeconds:
        snapshot.channelPostRetentionSeconds ?? snapshot.textCacheSeconds,
      mediaCacheSeconds:
        snapshot.channelMediaMinRetentionSeconds ?? snapshot.mediaCacheSeconds,
    };
  }

  return {
    textCacheSeconds: snapshot.textCacheSeconds,
    mediaCacheSeconds: snapshot.mediaCacheSeconds,
  };
}

export function hasMailboxMediaBlob(
  messageType: MailboxMessageType | string,
  mediaCount = 0,
): boolean {
  return (
    mediaCount > 0 || MEDIA_MESSAGE_TYPES.has(messageType as MailboxMessageType)
  );
}

export function computeEffectiveMessageCachePolicy(
  snapshot: RelayPolicySnapshot,
  chatType: MailboxChatType | string,
  messageType: MailboxMessageType | string,
  mediaCount = 0,
): EffectiveMessageCachePolicy {
  const base = computeEffectiveCachePolicy(snapshot, chatType);
  const hasMediaBlob = hasMailboxMediaBlob(messageType, mediaCount);

  return {
    ...base,
    messageType,
    metadataCacheSeconds: base.textCacheSeconds,
    blobCacheSeconds: hasMediaBlob ? base.mediaCacheSeconds : null,
    hasMediaBlob,
    mediaRetainUntilDownload: snapshot.mediaRetainUntilDownload,
    mediaMaxBytes: snapshot.mediaMaxBytes,
  };
}

export function computeChannelPostPolicy(
  snapshot: RelayPolicySnapshot,
): ChannelPostPolicy {
  const channelPolicy = computeEffectiveCachePolicy(snapshot, 'channel');

  return {
    postRetentionSeconds: channelPolicy.textCacheSeconds,
    mediaMinRetentionSeconds: channelPolicy.mediaCacheSeconds,
    fanoutMaxConcurrent: snapshot.fanoutMaxConcurrent,
  };
}

export function computeLineSyncTailPolicy(
  snapshot: RelayPolicySnapshot,
): LineSyncTailPolicy {
  return {
    retainLastN: snapshot.lineSyncTailCount,
    ttlSeconds: snapshot.lineSyncTailTtlSeconds,
  };
}

export class RelayPolicyConfig {
  private readonly policy: RelayPolicySnapshot;

  /** Pass a snapshot from tests; in Nest use `RelayPolicyModule` factory (loads from `process.env`). */
  constructor(snapshot: RelayPolicySnapshot) {
    this.policy = snapshot;
  }

  getPolicy(): RelayPolicySnapshot {
    return this.policy;
  }

  getDefaultTransport(): Transport {
    return this.policy.defaultTransport;
  }

  /**
   * Returns the effective mailbox cache policy for the given chat type.
   * Group overrides fall back to the generic private-chat policy when not set.
   * Channel/discussion share the channel retention settings.
   */
  getEffectiveCachePolicy(
    chatType: MailboxChatType | string,
  ): EffectiveCachePolicy {
    return computeEffectiveCachePolicy(this.policy, chatType);
  }

  getEffectiveMessageCachePolicy(
    chatType: MailboxChatType | string,
    messageType: MailboxMessageType | string,
    mediaCount = 0,
  ): EffectiveMessageCachePolicy {
    return computeEffectiveMessageCachePolicy(
      this.policy,
      chatType,
      messageType,
      mediaCount,
    );
  }

  getChannelPostPolicy(): ChannelPostPolicy {
    return computeChannelPostPolicy(this.policy);
  }

  getLineSyncTailPolicy(): LineSyncTailPolicy {
    return computeLineSyncTailPolicy(this.policy);
  }
}
