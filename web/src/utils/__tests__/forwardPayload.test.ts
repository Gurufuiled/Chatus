import { describe, expect, it } from 'vitest';
import { buildForwardPayload, canForwardMessage } from '@/utils/forwardPayload';
import { makeMedia, makeMessage } from '@/test/fixtures';

describe('forwardPayload', () => {
  it('returns null for deleted messages', () => {
    const message = makeMessage({ is_deleted: true });
    expect(buildForwardPayload(message)).toBeNull();
    expect(canForwardMessage(message)).toBe(false);
  });

  it('forwards text with metadata fallbacks', () => {
    const message = makeMessage({
      msg_type: 'text',
      content: 'Привет',
      forwarded_from_message_id: null,
      forwarded_from_name: null,
    });

    const payload = buildForwardPayload(message);
    expect(payload).toMatchObject({
      content: 'Привет',
      msg_type: 'text',
      forwarded_from_message_id: 'msg-1',
      forwarded_from_name: 'Alice',
      forwarded_from_chat_id: 'chat-1',
      forwarded_from_sender_id: 'user-1',
    });
  });

  it('forwards image with media url and dimensions', () => {
    const media = makeMedia({ remote_url: '/uploads/img.jpg', width: 640, height: 480 });
    const message = makeMessage({ msg_type: 'image', media: [media] });

    const payload = buildForwardPayload(message);
    expect(payload).toMatchObject({
      msg_type: 'image',
      media: { url: '/uploads/img.jpg', width: 640, height: 480 },
    });
  });

  it('returns null for image without remote url', () => {
    const message = makeMessage({
      msg_type: 'image',
      media: [makeMedia({ remote_url: null })],
    });
    expect(buildForwardPayload(message)).toBeNull();
  });

  it('forwards voice with duration and waveform', () => {
    const media = makeMedia({
      media_type: 'voice',
      remote_url: '/uploads/voice.webm',
      duration_ms: 4200,
      waveform: 'abc',
    });
    const message = makeMessage({ msg_type: 'voice', media: [media] });

    const payload = buildForwardPayload(message);
    expect(payload).toMatchObject({
      content: '/uploads/voice.webm',
      msg_type: 'voice',
      media: { url: '/uploads/voice.webm', duration_ms: 4200, waveform: 'abc' },
    });
  });

  it('does not forward video_note (unsupported type in forward builder)', () => {
    const media = makeMedia({
      media_type: 'video',
      remote_url: '/uploads/note.mp4',
      thumbnail_url: '/uploads/note-thumb.jpg',
      duration_ms: 3000,
      is_round: true,
    });
    const message = makeMessage({ msg_type: 'video_note', media: [media] });

    expect(buildForwardPayload(message)).toBeNull();
    expect(canForwardMessage(message)).toBe(false);
  });

  it('forwards video with thumbnail metadata', () => {
    const media = makeMedia({
      media_type: 'video',
      remote_url: '/uploads/clip.mp4',
      thumbnail_url: '/uploads/clip-thumb.jpg',
      duration_ms: 3000,
    });
    const message = makeMessage({ msg_type: 'video', media: [media] });

    const payload = buildForwardPayload(message);
    expect(payload?.msg_type).toBe('video');
    expect(payload?.media).toMatchObject({
      url: '/uploads/clip.mp4',
      thumbnail_url: '/uploads/clip-thumb.jpg',
    });
  });

  it('allows overriding forward metadata', () => {
    const message = makeMessage({ msg_type: 'text', content: 'fwd' });
    const payload = buildForwardPayload(message, {
      messageId: 'orig-99',
      name: 'Иван',
      chatId: 'chat-orig',
      senderId: 'user-orig',
    });
    expect(payload).toMatchObject({
      forwarded_from_message_id: 'orig-99',
      forwarded_from_name: 'Иван',
      forwarded_from_chat_id: 'chat-orig',
      forwarded_from_sender_id: 'user-orig',
    });
  });

  it('does not forward unsupported message types', () => {
    const message = makeMessage({ msg_type: 'system' });
    expect(buildForwardPayload(message)).toBeNull();
  });
});
