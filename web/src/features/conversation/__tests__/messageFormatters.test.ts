import { describe, expect, it } from 'vitest';
import { getOutgoingMessagePreview, isTempMessageId } from '@/features/conversation/messageFormatters';
import { encodeStickerPayload } from '@/utils/stickerPayload';
import { makeMessage } from '@/test/fixtures';

describe('messageFormatters', () => {
  it('detects temp message ids', () => {
    expect(isTempMessageId('temp-abc')).toBe(true);
    expect(isTempMessageId('real-1')).toBe(false);
  });

  it('builds outgoing previews for media types', () => {
    expect(getOutgoingMessagePreview(makeMessage({ msg_type: 'image' }))).toBe('Photo');
    expect(getOutgoingMessagePreview(makeMessage({ msg_type: 'voice' }))).toBe('Voice message');
    expect(getOutgoingMessagePreview(makeMessage({ msg_type: 'file', content: 'report.pdf' }))).toBe(
      'report.pdf',
    );
  });

  it('shows Sticker preview for encoded sticker content', () => {
    const content = encodeStickerPayload({ packId: 'p', stickerId: 's' });
    expect(getOutgoingMessagePreview(makeMessage({ msg_type: 'text', content }))).toBe('Sticker');
  });
});
