import { describe, expect, it } from 'vitest';
import {
  buildGroupCallRecordingPayload,
  parseGroupCallRecordingMessage,
} from '../groupCallRecordingMessage';

const encoder = new TextEncoder();

function encode(msg: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(msg));
}

describe('parseGroupCallRecordingMessage', () => {
  it('parses a valid recording announcement', () => {
    const parsed = parseGroupCallRecordingMessage(
      encode({
        type: 'group_call_recording',
        active: true,
        byUserId: 'user-1',
        byDisplayName: 'Alice',
      }),
    );
    expect(parsed).toEqual({
      type: 'group_call_recording',
      active: true,
      byUserId: 'user-1',
      byDisplayName: 'Alice',
    });
  });

  it('rejects empty byUserId', () => {
    expect(
      parseGroupCallRecordingMessage(
        encode({
          type: 'group_call_recording',
          active: true,
          byUserId: '   ',
          byDisplayName: 'Alice',
        }),
      ),
    ).toBeNull();
  });

  it('rejects wrong type or invalid JSON', () => {
    expect(
      parseGroupCallRecordingMessage(
        encode({ type: 'other', active: true, byUserId: 'u1' }),
      ),
    ).toBeNull();
    expect(parseGroupCallRecordingMessage(encoder.encode('not-json'))).toBeNull();
  });

  it('truncates long display names', () => {
    const longName = 'A'.repeat(80);
    const parsed = parseGroupCallRecordingMessage(
      encode({
        type: 'group_call_recording',
        active: false,
        byUserId: 'user-2',
        byDisplayName: longName,
      }),
    );
    expect(parsed?.byDisplayName).toHaveLength(64);
    expect(parsed?.byDisplayName.endsWith('…')).toBe(true);
  });

  it('round-trips via buildGroupCallRecordingPayload', () => {
    const payload = buildGroupCallRecordingPayload(true, 'u-9', 'Bob');
    expect(parseGroupCallRecordingMessage(payload)).toEqual({
      type: 'group_call_recording',
      active: true,
      byUserId: 'u-9',
      byDisplayName: 'Bob',
    });
  });
});
