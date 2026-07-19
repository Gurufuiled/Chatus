import { describe, expect, it } from 'vitest';
import {
  hashSenderColor,
  isSameGroupMessageRun,
  resolveMessageSender,
  GROUP_MSG_TIME_GAP_MS,
} from '@/features/conversation/messageSender';
import { makeMessage } from '@/test/fixtures';
import type { ChatSummary } from '@/types/chat';

describe('messageSender', () => {
  it('hashes stable peer colors', () => {
    expect(hashSenderColor('user-a')).toBe(hashSenderColor('user-a'));
    expect(hashSenderColor('user-a')).not.toBe(hashSenderColor('user-b'));
  });

  it('prefers message sender fields, then chat members', () => {
    const chat = {
      id: 'chat-1',
      chat_type: 'group',
      members: [
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
            username: 'bob',
            handle: 'bob',
            display_name: 'Bob Member',
            avatar_url: '/uploads/bob.png',
            phone: null,
            is_online: false,
            last_seen: null,
          },
        },
      ],
    } as ChatSummary;

    const fromMessage = resolveMessageSender(
      chat,
      makeMessage({
        sender_id: 'u2',
        sender_name: 'Bob Msg',
        sender_avatar_url: 'https://cdn.example.com/bob.jpg',
      }),
    );
    expect(fromMessage.displayName).toBe('Bob Msg');
    expect(fromMessage.avatarUrl).toContain('cdn.example.com/bob.jpg');

    const fromMember = resolveMessageSender(
      chat,
      makeMessage({ sender_id: 'u2', sender_name: null, sender_avatar_url: null }),
    );
    expect(fromMember.displayName).toBe('Bob Member');
    expect(fromMember.avatarUrl).toContain('/uploads/bob.png');
  });

  it('chains same incoming sender within the time gap', () => {
    const t0 = 1_000_000;
    const a = makeMessage({ id: '1', sender_id: 'u1', created_at: t0 });
    const b = makeMessage({
      id: '2',
      sender_id: 'u1',
      created_at: t0 + GROUP_MSG_TIME_GAP_MS - 1,
    });
    const c = makeMessage({
      id: '3',
      sender_id: 'u2',
      created_at: t0 + 10,
    });
    const far = makeMessage({
      id: '4',
      sender_id: 'u1',
      created_at: t0 + GROUP_MSG_TIME_GAP_MS + 1,
    });
    const system = makeMessage({
      id: '5',
      sender_id: 'u1',
      msg_type: 'system',
      created_at: t0 + 5,
    });

    expect(isSameGroupMessageRun(a, b, 'me')).toBe(true);
    expect(isSameGroupMessageRun(a, c, 'me')).toBe(false);
    expect(isSameGroupMessageRun(a, far, 'me')).toBe(false);
    expect(isSameGroupMessageRun(a, system, 'me')).toBe(false);
  });

  it('does not chain across outgoing vs incoming', () => {
    const t0 = 1_000_000;
    const incoming = makeMessage({ id: '1', sender_id: 'u1', created_at: t0 });
    const outgoing = makeMessage({ id: '2', sender_id: 'me', created_at: t0 + 10 });
    expect(isSameGroupMessageRun(incoming, outgoing, 'me')).toBe(false);
  });
});
