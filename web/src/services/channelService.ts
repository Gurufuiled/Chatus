import { apiRequest } from './apiClient';
import type { ChatSummary } from '@/types/chat';

export async function createChannel(payload: {
  name: string;
  description?: string;
  visibility: 'public' | 'private';
  access_type: 'free' | 'paid';
  subscription_price_cents?: number;
  subscription_period_days?: number;
  preview_post_count?: number;
  allow_comments?: boolean;
  allow_reactions?: boolean;
}): Promise<ChatSummary> {
  return apiRequest<ChatSummary>('/channels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
