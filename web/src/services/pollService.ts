import { apiRequest, ApiError } from './apiClient';
import type { MappedMessage } from '@/types/message';
import type { MappedPoll, PollPayload } from '@/utils/pollPayload';
import { mappedPollToPayload } from '@/utils/pollPayload';

export interface CreatePollInput {
  chatId: string;
  question: string;
  options: string[];
  isAnonymous?: boolean;
  allowsMultiple?: boolean;
}

export interface VotePollInput {
  chatId: string;
  messageId: string;
  optionIds: string[];
}

export type CreatePollResult = {
  message: MappedMessage;
  poll: MappedPoll;
};

export function isPollsApiLive(): boolean {
  return true;
}

export const pollQueryKey = (chatId: string, messageId: string) =>
  ['poll', chatId, messageId] as const;

/**
 * POST /chats/:chatId/polls
 * Body: { question, options, is_anonymous?, allows_multiple? }
 */
export async function createPollMessage(input: CreatePollInput): Promise<CreatePollResult> {
  try {
    const result = await apiRequest<CreatePollResult>(
      `/chats/${encodeURIComponent(input.chatId)}/polls`,
      {
        method: 'POST',
        body: JSON.stringify({
          question: input.question.trim(),
          options: input.options.map((text) => text.trim()).filter(Boolean),
          is_anonymous: input.isAnonymous !== false,
          allows_multiple: input.allowsMultiple === true,
        }),
      },
    );
    return {
      message: {
        ...result.message,
        poll: result.poll,
      },
      poll: result.poll,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      throw new Error('Создание опросов недоступно');
    }
    throw err;
  }
}

/** GET /chats/:chatId/polls/:messageId */
export async function fetchPoll(
  chatId: string,
  messageId: string,
): Promise<MappedPoll> {
  return apiRequest<MappedPoll>(
    `/chats/${encodeURIComponent(chatId)}/polls/${encodeURIComponent(messageId)}`,
  );
}

/**
 * POST /chats/:chatId/polls/:messageId/vote
 * Body: { option_ids: string[] }
 */
export async function votePoll(input: VotePollInput): Promise<MappedPoll> {
  try {
    return await apiRequest<MappedPoll>(
      `/chats/${encodeURIComponent(input.chatId)}/polls/${encodeURIComponent(input.messageId)}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({ option_ids: input.optionIds }),
      },
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      throw new Error('Голосование в опросах недоступно');
    }
    throw err;
  }
}

export function pollToMessageContent(poll: MappedPoll | PollPayload): string {
  if ('total_votes' in poll) {
    return mappedPollToPayload(poll).question;
  }
  return poll.question;
}
