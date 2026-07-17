import { describe, expect, it } from 'vitest';
import type { ChatSummary } from '@/types/chat';
import {
  formatTypingLabel,
  formatTypingPeopleCount,
  resolveTypingPeople,
} from '../typingFormatters';

function makeChat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: 'chat-1',
    chat_type: 'group',
    name: 'Team',
    peer_display_name: null,
    avatar_url: null,
    last_message_id: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count: 0,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    draft: null,
    created_at: 0,
    updated_at: 0,
    members: [
      {
        chat_id: 'chat-1',
        user_id: 'u1',
        role: 'member',
        access_status: 'active',
        subscription_expires_at: null,
        tag: null,
        tag_color: null,
        joined_at: 0,
        user: {
          id: 'u1',
          username: 'anna',
          handle: null,
          display_name: 'Анна Иванова',
          avatar_url: 'https://example.com/a.png',
          phone: null,
          is_online: true,
          last_seen: null,
        },
      },
      {
        chat_id: 'chat-1',
        user_id: 'u2',
        role: 'member',
        access_status: 'active',
        subscription_expires_at: null,
        tag: null,
        tag_color: null,
        joined_at: 0,
        user: {
          id: 'u2',
          username: 'boris',
          handle: null,
          display_name: 'Борис',
          avatar_url: null,
          phone: null,
          is_online: false,
          last_seen: null,
        },
      },
      {
        chat_id: 'chat-1',
        user_id: 'u3',
        role: 'member',
        access_status: 'active',
        subscription_expires_at: null,
        tag: null,
        tag_color: null,
        joined_at: 0,
        user: {
          id: 'u3',
          username: 'clara',
          handle: null,
          display_name: 'Клара Петрова',
          avatar_url: null,
          phone: null,
          is_online: false,
          last_seen: null,
        },
      },
    ],
    ...overrides,
  };
}

describe('typingFormatters', () => {
  it('formats private typing as plain text', () => {
    const people = resolveTypingPeople(makeChat({ chat_type: 'private' }), ['u1']);
    expect(formatTypingLabel(people, false)).toBe('печатает...');
  });

  it('formats one / two / many group typers with Russian plural', () => {
    const chat = makeChat();
    const one = resolveTypingPeople(chat, ['u1']);
    const two = resolveTypingPeople(chat, ['u1', 'u2']);
    const many = resolveTypingPeople(chat, ['u1', 'u2', 'u3']);

    expect(formatTypingLabel(one, true)).toBe('Анна печатает...');
    expect(formatTypingLabel(two, true)).toBe('Анна и Борис печатают...');
    expect(formatTypingLabel(many, true)).toBe('3 человека печатают...');
  });

  it('uses Russian plural forms for people count', () => {
    expect(formatTypingPeopleCount(3)).toBe('3 человека печатают...');
    expect(formatTypingPeopleCount(5)).toBe('5 человек печатают...');
    expect(formatTypingPeopleCount(21)).toBe('21 человек печатает...');
    expect(formatTypingPeopleCount(22)).toBe('22 человека печатают...');
  });

  it('resolves avatar and first name from members', () => {
    const people = resolveTypingPeople(makeChat(), ['u1']);
    expect(people[0]).toEqual({
      userId: 'u1',
      displayName: 'Анна',
      avatarUrl: 'https://example.com/a.png',
    });
  });
});
