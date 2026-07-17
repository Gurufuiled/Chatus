import { describe, expect, it } from 'vitest';
import {
  formatPeerLocalDisplayName,
  getPrivateChatPeerUserId,
  splitContactDisplayName,
} from '@/features/contacts/peerContactDisplay';
import { getChatDisplayName } from '@/features/chat-list/chatListFormatters';
import { makeChat } from '@/test/fixtures';

describe('peerContactDisplay', () => {
  it('formats local first+last name', () => {
    expect(
      formatPeerLocalDisplayName({ first_name: 'Анна', last_name: 'К.' }),
    ).toBe('Анна К.');
    expect(formatPeerLocalDisplayName({ first_name: 'Анна', last_name: null })).toBe('Анна');
    expect(formatPeerLocalDisplayName({ first_name: null, last_name: null })).toBeNull();
  });

  it('splits display name into first/last', () => {
    expect(splitContactDisplayName('Анна К.')).toEqual({
      firstName: 'Анна',
      lastName: 'К.',
    });
    expect(splitContactDisplayName('Анна')).toEqual({
      firstName: 'Анна',
      lastName: '',
    });
  });

  it('resolves private peer user id', () => {
    const chat = makeChat({
      chat_type: 'private',
      members: [
        {
          chat_id: 'chat-1',
          user_id: 'me-1',
          role: 'member',
          access_status: 'active',
          subscription_expires_at: null,
          tag: null,
          tag_color: null,
          joined_at: Date.now(),
        },
        {
          chat_id: 'chat-1',
          user_id: 'peer-1',
          role: 'member',
          access_status: 'active',
          subscription_expires_at: null,
          tag: null,
          tag_color: null,
          joined_at: Date.now(),
        },
      ],
    });
    expect(getPrivateChatPeerUserId(chat, 'me-1')).toBe('peer-1');
    expect(getPrivateChatPeerUserId(chat, null)).toBeNull();
  });

  it('prefers local override in getChatDisplayName', () => {
    const chat = makeChat({ peer_display_name: 'Bob' });
    expect(getChatDisplayName(chat)).toBe('Bob');
    expect(getChatDisplayName(chat, 'Мой контакт')).toBe('Мой контакт');
  });
});
