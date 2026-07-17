import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConversationHeader } from '../ConversationHeader';
import { makeChat } from '@/test/fixtures';
import { useTypingStore } from '@/stores/typingStore';

vi.mock('@/queries/auth.queries', () => ({
  useMeQuery: () => ({ data: { id: 'me-1' } }),
}));

vi.mock('@/queries/peerContacts.queries', () => ({
  usePeerContactsMap: () => new Map(),
}));

describe('ConversationHeader typing', () => {
  beforeEach(() => {
    useTypingStore.setState({ typingUsersByChatId: {} });
  });

  it('shows member count when nobody is typing', () => {
    const chat = makeChat({
      chat_type: 'group',
      name: 'Team',
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
            avatar_url: null,
            phone: null,
            is_online: true,
            last_seen: null,
          },
        },
      ],
    });

    render(<ConversationHeader chat={chat} />);
    expect(screen.getByText('1 участников')).toBeInTheDocument();
  });

  it('renders TypingStatus with name when someone is typing', () => {
    const chat = makeChat({
      id: 'chat-1',
      chat_type: 'group',
      name: 'Team',
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
            avatar_url: null,
            phone: null,
            is_online: true,
            last_seen: null,
          },
        },
      ],
    });

    useTypingStore.getState().setTypingUser('chat-1', 'u1', true);
    render(<ConversationHeader chat={chat} />);
    expect(screen.getByText('Анна печатает...')).toBeInTheDocument();
    expect(screen.queryByText('1 участников')).not.toBeInTheDocument();
  });

  it('shows plain typing text for private chats', () => {
    const chat = makeChat({
      id: 'dm-1',
      chat_type: 'private',
      peer_display_name: 'Боб',
      members: [],
    });
    useTypingStore.getState().setTypingUser('dm-1', 'peer-1', true);
    render(<ConversationHeader chat={chat} />);
    expect(screen.getByText('печатает...')).toBeInTheDocument();
  });
});
