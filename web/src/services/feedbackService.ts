import { apiRequest } from './apiClient';

export type FeedbackAuthor = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

export type FeedbackEntry = {
  id: string;
  type: 'bug' | 'suggestion';
  status: 'open' | 'closed';
  title: string;
  body: string;
  attachment_url?: string | null;
  author_id: string;
  created_at: number;
  author: FeedbackAuthor;
};

export async function fetchFeedbackList(kind: 'bug' | 'suggestion'): Promise<FeedbackEntry[]> {
  return apiRequest<FeedbackEntry[]>(`/feedback?type=${encodeURIComponent(kind)}`);
}

export async function createFeedback(payload: {
  type: 'bug' | 'suggestion';
  title: string;
  body: string;
  attachment_url?: string;
}): Promise<FeedbackEntry> {
  return apiRequest<FeedbackEntry>('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
