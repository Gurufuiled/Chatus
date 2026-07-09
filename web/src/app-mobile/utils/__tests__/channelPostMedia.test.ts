import { describe, expect, it } from 'vitest';
import {
  computeChannelMediaDisplaySize,
  getChannelPostAlbumMedia,
  isChannelAlbumPost,
} from '../channelPostMedia';
import type { MappedMessage } from '@/types/message';

function makePost(mediaCount: number): MappedMessage {
  return {
    id: 'p1',
    chat_id: 'c1',
    sender_id: 'u1',
    msg_type: 'image',
    content: null,
    reply_to_id: null,
    is_deleted: false,
    status: 'sent',
    created_at: 1,
    updated_at: 1,
    media: Array.from({ length: mediaCount }, (_, i) => ({
      id: `m${i}`,
      message_id: 'p1',
      media_type: 'image',
      file_name: null,
      mime_type: 'image/jpeg',
      file_size: null,
      width: 800,
      height: 1200,
      duration_ms: null,
      remote_url: `https://example.com/${i}.jpg`,
      thumbnail_url: null,
      waveform: null,
      is_round: false,
      created_at: 1,
    })),
  };
}

describe('channel album helpers', () => {
  it('detects multi-media album posts', () => {
    expect(isChannelAlbumPost(makePost(1))).toBe(false);
    expect(isChannelAlbumPost(makePost(2))).toBe(true);
    expect(getChannelPostAlbumMedia(makePost(11))).toHaveLength(10);
  });
});

describe('computeChannelMediaDisplaySize', () => {
  it('clamps portrait photos to channel max height', () => {
    const size = computeChannelMediaDisplaySize(1080, 1920, 390, 844);
    expect(size.width).toBeLessThanOrEqual(320);
    expect(size.height).toBeLessThanOrEqual(380);
    expect(size.height).toBeGreaterThan(size.width);
  });

  it('returns square fallback when dimensions are missing', () => {
    const size = computeChannelMediaDisplaySize(null, null, 390, 844);
    expect(size.width).toBe(size.height);
    expect(size.width).toBeLessThanOrEqual(240);
  });
});
