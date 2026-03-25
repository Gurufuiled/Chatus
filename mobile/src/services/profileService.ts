/**
 * ProfileService - GET/PATCH /users/me for profile data.
 * Uses apiClient for auth. Avatar URLs are resolved via resolveAvatarUrl.
 */

import { apiGet, apiPatch } from './apiClient';
import type { ApiUser } from './AuthService';

export interface ProfileUpdateData {
  display_name?: string;
  avatar_url?: string;
  handle?: string;
}

/** Fetch current user profile from GET /users/me. */
export async function getProfile(): Promise<ApiUser> {
  const res = await apiGet('/users/me');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to load profile: ${res.status}`);
  }
  return res.json() as Promise<ApiUser>;
}

/** Search users by display name, username, or handle. Leading `@` is supported and helps prioritize handle matches. */
export async function searchUsers(query: string): Promise<ApiUser[]> {
  const res = await apiGet(`/users/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Search failed: ${res.status}`);
  }
  return res.json() as Promise<ApiUser[]>;
}

/** Fetch another user's public profile by id. */
export async function getUserProfile(userId: string): Promise<ApiUser> {
  const res = await apiGet(`/users/${encodeURIComponent(userId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to load user profile: ${res.status}`);
  }
  return res.json() as Promise<ApiUser>;
}

/** Update profile via PATCH /users/me. Returns updated user. */
export async function updateProfile(data: ProfileUpdateData): Promise<ApiUser> {
  const res = await apiPatch('/users/me', data);
  if (!res.ok) {
    const text = await res.text();
    let message = `Failed to update profile: ${res.status}`;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed?.message) message = parsed.message;
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  return res.json() as Promise<ApiUser>;
}
