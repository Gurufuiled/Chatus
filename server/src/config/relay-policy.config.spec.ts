import { Transport } from '@prisma/client';
import {
  computeChannelPostPolicy,
  computeEffectiveMessageCachePolicy,
  loadRelayPolicyFromEnv,
  RelayPolicyConfig,
  computeEffectiveCachePolicy,
  hasMailboxMediaBlob,
} from './relay-policy.config';

describe('loadRelayPolicyFromEnv', () => {
  it('keeps current relay behaviour by default', () => {
    expect(loadRelayPolicyFromEnv({})).toEqual({
      peerAttemptTimeoutMs: 2500,
      peerMetricsEnabled: true,
      mode: 'standard',
      textCacheSeconds: 0,
      deleteAfterAllDevicesAck: false,
      mediaCacheSeconds: 0,
      mediaRetainUntilDownload: true,
      mediaMaxBytes: null,
      groupTextCacheSeconds: null,
      channelPostRetentionSeconds: null,
      channelMediaMinRetentionSeconds: null,
      fanoutMaxConcurrent: null,
      defaultTransport: Transport.websocket,
    });
  });

  it('parses explicit relay policy env values', () => {
    expect(
      loadRelayPolicyFromEnv({
        RELAY_MODE: 'Minimal',
        P2P_PEER_ATTEMPT_TIMEOUT_MS: '1500',
        P2P_PEER_METRICS_ENABLED: '0',
        RELAY_TEXT_CACHE_SECONDS: '3600',
        RELAY_DELETE_AFTER_ALL_DEVICES_ACK: '1',
        RELAY_MEDIA_CACHE_SECONDS: '7200',
        RELAY_MEDIA_RETAIN_UNTIL_DOWNLOAD: 'false',
        RELAY_MEDIA_MAX_BYTES: '1048576',
        RELAY_GROUP_TEXT_CACHE_SECONDS: '1800',
        RELAY_CHANNEL_POST_RETENTION_SECONDS: '604800',
        RELAY_CHANNEL_MEDIA_MIN_RETENTION_SECONDS: '86400',
        RELAY_FANOUT_MAX_CONCURRENT: '8',
      }),
    ).toMatchObject({
      peerAttemptTimeoutMs: 1500,
      peerMetricsEnabled: false,
      mode: 'minimal',
      textCacheSeconds: 3600,
      deleteAfterAllDevicesAck: true,
      mediaCacheSeconds: 7200,
      mediaRetainUntilDownload: false,
      mediaMaxBytes: 1048576,
      groupTextCacheSeconds: 1800,
      channelPostRetentionSeconds: 604800,
      channelMediaMinRetentionSeconds: 86400,
      fanoutMaxConcurrent: 8,
    });
  });

  it('returns default policy (all zeros / no TTL) for all chat types when no overrides set', () => {
    const snapshot = loadRelayPolicyFromEnv({});

    expect(computeEffectiveCachePolicy(snapshot, 'private')).toEqual({
      textCacheSeconds: 0,
      mediaCacheSeconds: 0,
    });
    expect(computeEffectiveCachePolicy(snapshot, 'group')).toEqual({
      textCacheSeconds: 0,
      mediaCacheSeconds: 0,
    });
    expect(computeEffectiveCachePolicy(snapshot, 'channel')).toEqual({
      textCacheSeconds: 0,
      mediaCacheSeconds: 0,
    });
    expect(computeEffectiveCachePolicy(snapshot, 'discussion')).toEqual({
      textCacheSeconds: 0,
      mediaCacheSeconds: 0,
    });
  });

  it('applies group and channel overrides and resolves per-type effective policy', () => {
    const snapshot = loadRelayPolicyFromEnv({
      RELAY_TEXT_CACHE_SECONDS: '3600',
      RELAY_MEDIA_CACHE_SECONDS: '7200',
      RELAY_GROUP_TEXT_CACHE_SECONDS: '1800',
      RELAY_CHANNEL_POST_RETENTION_SECONDS: '604800',
      RELAY_CHANNEL_MEDIA_MIN_RETENTION_SECONDS: '86400',
    });

    expect(computeEffectiveCachePolicy(snapshot, 'private')).toEqual({
      textCacheSeconds: 3600,
      mediaCacheSeconds: 7200,
    });
    expect(computeEffectiveCachePolicy(snapshot, 'group')).toEqual({
      textCacheSeconds: 1800,
      mediaCacheSeconds: 7200,
    });
    expect(computeEffectiveCachePolicy(snapshot, 'channel')).toEqual({
      textCacheSeconds: 604800,
      mediaCacheSeconds: 86400,
    });
    expect(computeEffectiveCachePolicy(snapshot, 'discussion')).toEqual({
      textCacheSeconds: 604800,
      mediaCacheSeconds: 86400,
    });
  });

  it('group falls back to generic textCacheSeconds when RELAY_GROUP_TEXT_CACHE_SECONDS not set', () => {
    const snapshot = loadRelayPolicyFromEnv({
      RELAY_TEXT_CACHE_SECONDS: '3600',
      RELAY_MEDIA_CACHE_SECONDS: '7200',
    });

    expect(computeEffectiveCachePolicy(snapshot, 'group')).toEqual({
      textCacheSeconds: 3600,
      mediaCacheSeconds: 7200,
    });
  });

  it('channel/discussion fall back to generic cache seconds when channel-specific keys not set', () => {
    const snapshot = loadRelayPolicyFromEnv({
      RELAY_TEXT_CACHE_SECONDS: '3600',
      RELAY_MEDIA_CACHE_SECONDS: '7200',
    });

    expect(computeEffectiveCachePolicy(snapshot, 'channel')).toEqual({
      textCacheSeconds: 3600,
      mediaCacheSeconds: 7200,
    });
    expect(computeEffectiveCachePolicy(snapshot, 'discussion')).toEqual({
      textCacheSeconds: 3600,
      mediaCacheSeconds: 7200,
    });
  });

  it('RelayPolicyConfig.getEffectiveCachePolicy delegates to computeEffectiveCachePolicy', () => {
    const snapshot = loadRelayPolicyFromEnv({
      RELAY_TEXT_CACHE_SECONDS: '1000',
      RELAY_GROUP_TEXT_CACHE_SECONDS: '500',
    });
    const config = new RelayPolicyConfig(snapshot);

    expect(config.getEffectiveCachePolicy('group')).toEqual({
      textCacheSeconds: 500,
      mediaCacheSeconds: 0,
    });
    expect(config.getEffectiveCachePolicy('private')).toEqual({
      textCacheSeconds: 1000,
      mediaCacheSeconds: 0,
    });
  });

  it('identifies message types that carry media blobs', () => {
    expect(hasMailboxMediaBlob('text')).toBe(false);
    expect(hasMailboxMediaBlob('system')).toBe(false);
    expect(hasMailboxMediaBlob('image')).toBe(true);
    expect(hasMailboxMediaBlob('voice')).toBe(true);
    expect(hasMailboxMediaBlob('video_note')).toBe(true);
    expect(hasMailboxMediaBlob('video')).toBe(true);
    expect(hasMailboxMediaBlob('file')).toBe(true);
    expect(hasMailboxMediaBlob('text', 1)).toBe(true);
  });

  it('resolves message-level metadata and blob cache policy', () => {
    const snapshot = loadRelayPolicyFromEnv({
      RELAY_TEXT_CACHE_SECONDS: '3600',
      RELAY_MEDIA_CACHE_SECONDS: '7200',
      RELAY_MEDIA_RETAIN_UNTIL_DOWNLOAD: '0',
      RELAY_MEDIA_MAX_BYTES: '1048576',
      RELAY_CHANNEL_POST_RETENTION_SECONDS: '604800',
      RELAY_CHANNEL_MEDIA_MIN_RETENTION_SECONDS: '86400',
    });

    expect(computeEffectiveMessageCachePolicy(snapshot, 'private', 'text')).toMatchObject({
      metadataCacheSeconds: 3600,
      blobCacheSeconds: null,
      hasMediaBlob: false,
      mediaRetainUntilDownload: false,
      mediaMaxBytes: 1048576,
    });

    expect(computeEffectiveMessageCachePolicy(snapshot, 'private', 'image')).toMatchObject({
      metadataCacheSeconds: 3600,
      blobCacheSeconds: 7200,
      hasMediaBlob: true,
    });

    expect(computeEffectiveMessageCachePolicy(snapshot, 'channel', 'video')).toMatchObject({
      metadataCacheSeconds: 604800,
      blobCacheSeconds: 86400,
      hasMediaBlob: true,
    });
  });

  it('resolves channel post retention and fanout policy', () => {
    const snapshot = loadRelayPolicyFromEnv({
      RELAY_TEXT_CACHE_SECONDS: '3600',
      RELAY_MEDIA_CACHE_SECONDS: '7200',
      RELAY_CHANNEL_POST_RETENTION_SECONDS: '604800',
      RELAY_CHANNEL_MEDIA_MIN_RETENTION_SECONDS: '86400',
      RELAY_FANOUT_MAX_CONCURRENT: '16',
    });

    expect(computeChannelPostPolicy(snapshot)).toEqual({
      postRetentionSeconds: 604800,
      mediaMinRetentionSeconds: 86400,
      fanoutMaxConcurrent: 16,
    });
  });

  it('channel post policy falls back to generic cache settings by default', () => {
    const snapshot = loadRelayPolicyFromEnv({
      RELAY_TEXT_CACHE_SECONDS: '3600',
      RELAY_MEDIA_CACHE_SECONDS: '7200',
    });

    expect(computeChannelPostPolicy(snapshot)).toEqual({
      postRetentionSeconds: 3600,
      mediaMinRetentionSeconds: 7200,
      fanoutMaxConcurrent: null,
    });
  });

  it('falls back on invalid values without changing defaults', () => {
    expect(
      loadRelayPolicyFromEnv({
        RELAY_MODE: 'unknown',
        P2P_PEER_ATTEMPT_TIMEOUT_MS: '0',
        P2P_PEER_METRICS_ENABLED: 'maybe',
        RELAY_TEXT_CACHE_SECONDS: '-1',
        RELAY_DELETE_AFTER_ALL_DEVICES_ACK: 'yes',
        RELAY_MEDIA_CACHE_SECONDS: '10s',
        RELAY_MEDIA_RETAIN_UNTIL_DOWNLOAD: 'maybe',
        RELAY_MEDIA_MAX_BYTES: '',
      }),
    ).toMatchObject({
      peerAttemptTimeoutMs: 2500,
      peerMetricsEnabled: true,
      mode: 'standard',
      textCacheSeconds: 0,
      deleteAfterAllDevicesAck: false,
      mediaCacheSeconds: 0,
      mediaRetainUntilDownload: true,
      mediaMaxBytes: null,
      defaultTransport: Transport.websocket,
    });
  });
});
