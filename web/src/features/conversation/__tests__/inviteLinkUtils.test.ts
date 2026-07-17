import { describe, expect, it } from 'vitest';
import {
  extractInviteToken,
  findInviteMatches,
  isInviteOnlyMessage,
} from '@/features/conversation/inviteLinkUtils';

describe('inviteLinkUtils', () => {
  it('parses chatus://join tokens', () => {
    expect(extractInviteToken('chatus://join/group-ab76be66')).toBe('group-ab76be66');
    expect(isInviteOnlyMessage('chatus://join/group-ab76be66')).toBe(true);
  });

  it('does not treat arbitrary https /join URLs as invites', () => {
    expect(extractInviteToken('https://chatus.app/join/tok123')).toBeNull();
    expect(extractInviteToken('https://github.com/join/foo')).toBeNull();
    expect(findInviteMatches('see https://meetup.com/invite/bar').length).toBe(0);
  });

  it('finds invite matches inside mixed text', () => {
    const text = 'Привет chatus://join/abc и ещё текст';
    const matches = findInviteMatches(text);
    expect(matches.map((m) => m.token)).toEqual(['abc']);
    expect(isInviteOnlyMessage(text)).toBe(false);
  });
});
