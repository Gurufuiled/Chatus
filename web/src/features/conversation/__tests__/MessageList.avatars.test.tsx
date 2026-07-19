import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from '@/features/conversation/MessageList';
import { makeMessage } from '@/test/fixtures';
import type { MappedMessage } from '@/types/message';
import type { UseQueryResult } from '@tanstack/react-query';

vi.mock('@/queries/messages.queries', () => ({
  useMessagesQuery: vi.fn(),
}));

vi.mock('@/queries/auth.queries', () => ({
  useMeQuery: vi.fn(),
}));

vi.mock('@/queries/chats.queries', () => ({
  useChatsQuery: vi.fn(),
}));

vi.mock('@/stores/messageContextStore', () => ({
  useMessageContextStore: (sel: (s: { closeMessageMenu: () => void; openMessageMenu: () => void }) => unknown) =>
    sel({ closeMessageMenu: vi.fn(), openMessageMenu: vi.fn() }),
}));

vi.mock('@/stores/selectionStore', () => ({
  useSelectionStore: (sel: (s: {
    isActive: boolean;
    chatId: string | null;
    selectedIds: string[];
    toggleMessage: () => void;
  }) => unknown) =>
    sel({ isActive: false, chatId: null, selectedIds: [], toggleMessage: vi.fn() }),
}));

vi.mock('@/features/conversation/MessageBubble', () => ({
  MessageBubble: ({
    message,
    showSenderName,
    senderDisplayName,
  }: {
    message: MappedMessage;
    showSenderName?: boolean;
    senderDisplayName?: string;
  }) => (
    <div data-testid={`bubble-${message.id}`}>
      {showSenderName ? <span data-testid="sender-name">{senderDisplayName}</span> : null}
      {message.content}
    </div>
  ),
}));

import { useMessagesQuery } from '@/queries/messages.queries';
import { useChatsQuery } from '@/queries/chats.queries';
import { useMeQuery } from '@/queries/auth.queries';

function mockMessages(messages: MappedMessage[]) {
  return { data: messages, isLoading: false, isError: false } as unknown as UseQueryResult<
    MappedMessage[]
  >;
}

describe('MessageList group avatars', () => {
  const t0 = 1_700_000_000_000;

  beforeEach(() => {
    vi.mocked(useMeQuery).mockReturnValue({ data: { id: 'me-1' } } as never);
    vi.mocked(useChatsQuery).mockReturnValue({
      data: [
        {
          id: 'chat-1',
          chat_type: 'group',
          name: 'школуса',
          peer_display_name: null,
          avatar_url: null,
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
                username: 'alice',
                handle: 'alice',
                display_name: 'Алиса',
                avatar_url: null,
                phone: null,
                is_online: false,
                last_seen: null,
              },
            },
          ],
        },
      ],
    } as never);
  });

  it('shows avatar only on the last message of an incoming run', () => {
    vi.mocked(useMessagesQuery).mockReturnValue(
      mockMessages([
        makeMessage({
          id: 'm1',
          sender_id: 'u1',
          sender_name: 'Алиса',
          content: 'one',
          created_at: t0,
        }),
        makeMessage({
          id: 'm2',
          sender_id: 'u1',
          sender_name: 'Алиса',
          content: 'two',
          created_at: t0 + 1000,
        }),
        makeMessage({
          id: 'm3',
          sender_id: 'me-1',
          sender_name: 'Me',
          content: 'reply',
          created_at: t0 + 2000,
        }),
      ]),
    );

    const { container } = render(<MessageList chatId="chat-1" />);
    const rows = container.querySelectorAll('.message-list__row--group-in');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector('.avatar')).toBeNull();
    expect(rows[1]!.querySelector('.avatar')).toBeTruthy();
    expect(screen.getByTestId('sender-name')).toHaveTextContent('Алиса');
    expect(screen.getAllByTestId('sender-name')).toHaveLength(1);
  });

  it('does not reserve avatar gutter in private chats', () => {
    vi.mocked(useChatsQuery).mockReturnValue({
      data: [{ id: 'chat-1', chat_type: 'private', name: null, members: [] }],
    } as never);
    vi.mocked(useMessagesQuery).mockReturnValue(
      mockMessages([
        makeMessage({
          id: 'm1',
          sender_id: 'u1',
          content: 'hi',
          created_at: t0,
        }),
      ]),
    );

    const { container } = render(<MessageList chatId="chat-1" />);
    expect(container.querySelector('.message-list__avatar-slot')).toBeNull();
    expect(container.querySelector('.message-list__row--group-in')).toBeNull();
  });

  it('skips avatar gutter while me is still loading', () => {
    vi.mocked(useMeQuery).mockReturnValue({ data: undefined } as never);
    vi.mocked(useMessagesQuery).mockReturnValue(
      mockMessages([
        makeMessage({
          id: 'm1',
          sender_id: 'me-1',
          sender_name: 'Me',
          content: 'mine',
          created_at: t0,
        }),
        makeMessage({
          id: 'm2',
          sender_id: 'u1',
          sender_name: 'Алиса',
          content: 'theirs',
          created_at: t0 + 1000,
        }),
      ]),
    );

    const { container } = render(<MessageList chatId="chat-1" />);
    expect(container.querySelector('.message-list__avatar-slot')).toBeNull();
    expect(container.querySelector('.message-list__row--group-in')).toBeNull();
  });

  it('skips avatar gutter for system messages', () => {
    vi.mocked(useMessagesQuery).mockReturnValue(
      mockMessages([
        makeMessage({
          id: 'sys-1',
          sender_id: 'u1',
          sender_name: 'Алиса',
          msg_type: 'system',
          content: 'Начат групповой звонок',
          created_at: t0,
        }),
        makeMessage({
          id: 'm1',
          sender_id: 'u1',
          sender_name: 'Алиса',
          content: 'всем привет',
          created_at: t0 + 1000,
        }),
      ]),
    );

    const { container } = render(<MessageList chatId="chat-1" />);
    const systemRow = container.querySelector('#msg-sys-1');
    expect(systemRow).toHaveClass('message-list__row--system');
    expect(systemRow!.querySelector('.message-list__avatar-slot')).toBeNull();
    expect(systemRow).not.toHaveClass('message-list__row--group-in');
    expect(container.querySelectorAll('.message-list__row--group-in')).toHaveLength(1);
    expect(container.querySelector('#msg-m1 .message-list__avatar-slot .avatar')).toBeTruthy();
  });
});
