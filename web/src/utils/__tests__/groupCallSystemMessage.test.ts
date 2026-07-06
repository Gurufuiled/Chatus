import { describe, expect, it } from 'vitest';
import {
  formatGroupCallParticipantNames,
  formatParticipantCount,
  groupCallSystemPreviewText,
  parseGroupCallSystemContent,
} from '@/utils/groupCallSystemMessage';

describe('parseGroupCallSystemContent', () => {
  it('parses valid started payload', () => {
    const payload = parseGroupCallSystemContent(
      JSON.stringify({
        v: 1,
        kind: 'group_call',
        action: 'started',
        room_id: 'room-1',
        display: 'papuas начала голосовой чат',
      }),
    );
    expect(payload).toEqual({
      v: 1,
      kind: 'group_call',
      action: 'started',
      room_id: 'room-1',
      display: 'papuas начала голосовой чат',
    });
  });

  it('returns null for plain text', () => {
    expect(parseGroupCallSystemContent('hello')).toBeNull();
  });

  it('returns null for invalid schema', () => {
    expect(parseGroupCallSystemContent(JSON.stringify({ kind: 'group_call' }))).toBeNull();
  });
});

describe('groupCallSystemPreviewText', () => {
  it('returns display field for system payload', () => {
    expect(
      groupCallSystemPreviewText(
        JSON.stringify({
          v: 1,
          kind: 'group_call',
          action: 'started',
          room_id: 'room-1',
          display: 'Голосовой чат начат',
        }),
      ),
    ).toBe('Голосовой чат начат');
  });
});

describe('formatParticipantCount', () => {
  it('uses Russian plural forms', () => {
    expect(formatParticipantCount(1)).toBe('1 участник');
    expect(formatParticipantCount(3)).toBe('3 участника');
    expect(formatParticipantCount(5)).toBe('5 участников');
  });
});

describe('formatGroupCallParticipantNames', () => {
  it('joins names and adds remainder suffix', () => {
    expect(
      formatGroupCallParticipantNames([
        { displayName: 'Anna' },
        { displayName: 'Bob' },
        { displayName: 'Carl' },
      ]),
    ).toBe('Anna, Bob и ещё 1');
  });
});
