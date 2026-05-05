import { Transport } from '@prisma/client';
import { loadRelayPolicyFromEnv } from './relay-policy.config';

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
