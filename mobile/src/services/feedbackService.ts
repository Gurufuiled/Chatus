import { apiGet, apiPost } from './apiClient';

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
  author_id: string;
  created_at: number;
  author: FeedbackAuthor;
};

export async function fetchFeedbackList(kind: 'bug' | 'suggestion'): Promise<FeedbackEntry[]> {
  const res = await apiGet(`/feedback?type=${encodeURIComponent(kind)}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<FeedbackEntry[]>;
}

export async function createFeedback(payload: {
  type: 'bug' | 'suggestion';
  title: string;
  body: string;
}): Promise<FeedbackEntry> {
  const res = await apiPost('/feedback', payload);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<FeedbackEntry>;
}
