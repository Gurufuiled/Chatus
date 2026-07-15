import type { MappedMessage } from '@/types/message';

export interface PollOption {
  id: string;
  text: string;
  voter_count: number;
  voted_by_me?: boolean;
}

export interface PollPayload {
  question: string;
  options: PollOption[];
  is_anonymous: boolean;
  allows_multiple?: boolean;
  total_voter_count: number;
  /** Option ids the current user voted for. */
  chosen_option_ids: string[];
  is_closed?: boolean;
}

/** Server MappedPoll shape from GET/POST poll endpoints. */
export interface MappedPoll {
  id: string;
  message_id: string;
  question: string;
  is_anonymous: boolean;
  allows_multiple: boolean;
  is_closed: boolean;
  total_votes: number;
  options: {
    id: string;
    text: string;
    index: number;
    vote_count: number;
    voted_by_me: boolean;
  }[];
  my_option_ids: string[];
}

const POLL_CONTENT_PREFIX = 'chatus:poll:';

export function mappedPollToPayload(poll: MappedPoll): PollPayload {
  return {
    question: poll.question,
    is_anonymous: poll.is_anonymous,
    allows_multiple: poll.allows_multiple,
    is_closed: poll.is_closed,
    total_voter_count: poll.total_votes,
    chosen_option_ids: poll.my_option_ids ?? [],
    options: poll.options.map((opt) => ({
      id: opt.id,
      text: opt.text,
      voter_count: opt.vote_count,
      voted_by_me: opt.voted_by_me,
    })),
  };
}

export function encodePollContent(
  poll: Omit<PollPayload, 'total_voter_count' | 'chosen_option_ids' | 'options'> & {
    options: Array<{ id?: string; text: string; voter_count?: number }>;
  },
): string {
  const payload: PollPayload = {
    question: poll.question.trim(),
    is_anonymous: poll.is_anonymous,
    allows_multiple: poll.allows_multiple === true,
    options: poll.options.map((opt, index) => ({
      id: opt.id?.trim() || `opt-${index + 1}`,
      text: opt.text.trim(),
      voter_count: opt.voter_count ?? 0,
    })),
    total_voter_count: 0,
    chosen_option_ids: [],
    is_closed: false,
  };
  return `${POLL_CONTENT_PREFIX}${JSON.stringify(payload)}`;
}

export function tryParsePollPayload(content: string | null | undefined): PollPayload | null {
  if (!content) return null;
  const raw = content.startsWith(POLL_CONTENT_PREFIX)
    ? content.slice(POLL_CONTENT_PREFIX.length)
    : content;
  try {
    const parsed = JSON.parse(raw) as Partial<PollPayload>;
    if (typeof parsed.question !== 'string' || !Array.isArray(parsed.options)) return null;
    const options = parsed.options
      .map((opt, index) => {
        if (!opt || typeof opt !== 'object') return null;
        const text = typeof opt.text === 'string' ? opt.text.trim() : '';
        if (!text) return null;
        return {
          id: typeof opt.id === 'string' && opt.id ? opt.id : `opt-${index + 1}`,
          text,
          voter_count: typeof opt.voter_count === 'number' ? opt.voter_count : 0,
        };
      })
      .filter((opt): opt is PollOption => opt != null);
    if (options.length < 2) return null;
    return {
      question: parsed.question.trim(),
      options,
      is_anonymous: parsed.is_anonymous !== false,
      allows_multiple: parsed.allows_multiple === true,
      total_voter_count:
        typeof parsed.total_voter_count === 'number'
          ? parsed.total_voter_count
          : options.reduce((sum, o) => sum + o.voter_count, 0),
      chosen_option_ids: Array.isArray(parsed.chosen_option_ids)
        ? parsed.chosen_option_ids.filter((id): id is string => typeof id === 'string')
        : [],
      is_closed: parsed.is_closed === true,
    };
  } catch {
    return null;
  }
}

export function getPollFromMessage(
  message: Pick<MappedMessage, 'msg_type' | 'content' | 'poll'>,
): PollPayload | null {
  if (message.poll) {
    return mappedPollToPayload(message.poll);
  }
  if (message.msg_type === 'poll') {
    // Server stores question as plain content; options come from poll fetch.
    return null;
  }
  if (message.msg_type === 'text' && message.content?.startsWith(POLL_CONTENT_PREFIX)) {
    return tryParsePollPayload(message.content);
  }
  return null;
}

export function isPollMessage(
  message: Pick<MappedMessage, 'msg_type' | 'content' | 'poll'>,
): boolean {
  if (message.msg_type === 'poll') return true;
  return getPollFromMessage(message) != null;
}
