import { describe, expect, it } from 'vitest';
import {
  encodePollContent,
  getPollFromMessage,
  mappedPollToPayload,
  tryParsePollPayload,
} from '@/utils/pollPayload';

describe('pollPayload', () => {
  it('encodes and parses poll content', () => {
    const content = encodePollContent({
      question: 'Coffee?',
      is_anonymous: true,
      options: [{ text: 'Yes' }, { text: 'No' }],
    });
    const poll = tryParsePollPayload(content);
    expect(poll?.question).toBe('Coffee?');
    expect(poll?.options).toHaveLength(2);
    expect(poll?.is_anonymous).toBe(true);
  });

  it('detects poll messages by msg_type or prefix', () => {
    expect(getPollFromMessage({ msg_type: 'poll', content: 'Q' })).toBeNull();
    expect(isPollByType()).toBe(true);
    const content = encodePollContent({
      question: 'Q',
      is_anonymous: false,
      options: [{ text: 'A' }, { text: 'B' }],
    });
    expect(getPollFromMessage({ msg_type: 'text', content })).not.toBeNull();
    expect(getPollFromMessage({ msg_type: 'text', content: 'hello' })).toBeNull();
  });

  it('maps server MappedPoll shape', () => {
    const payload = mappedPollToPayload({
      id: 'p1',
      message_id: 'm1',
      question: 'Lunch?',
      is_anonymous: true,
      allows_multiple: false,
      is_closed: false,
      total_votes: 2,
      options: [
        { id: 'o1', text: 'A', index: 0, vote_count: 1, voted_by_me: true },
        { id: 'o2', text: 'B', index: 1, vote_count: 1, voted_by_me: false },
      ],
      my_option_ids: ['o1'],
    });
    expect(payload.total_voter_count).toBe(2);
    expect(payload.chosen_option_ids).toEqual(['o1']);
    expect(payload.options[0].voter_count).toBe(1);
  });
});

function isPollByType() {
  return getPollFromMessage({
    msg_type: 'poll',
    content: 'Q',
    poll: {
      id: 'p1',
      message_id: 'm1',
      question: 'Q',
      is_anonymous: true,
      allows_multiple: false,
      is_closed: false,
      total_votes: 0,
      options: [
        { id: 'o1', text: 'A', index: 0, vote_count: 0, voted_by_me: false },
        { id: 'o2', text: 'B', index: 1, vote_count: 0, voted_by_me: false },
      ],
      my_option_ids: [],
    },
  }) != null;
}
