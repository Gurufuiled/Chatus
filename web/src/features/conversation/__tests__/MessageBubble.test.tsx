import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '@/features/conversation/MessageBubble';
import { makeMedia, makeMessage } from '@/test/fixtures';
import { encodeStickerPayload } from '@/utils/stickerPayload';

const toggleMutate = vi.fn();

vi.mock('@/data/stickerCatalog', () => ({
  getStickerImageUrl: () => '/stickers/mock.webp',
}));

vi.mock('@/queries/messages.queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/queries/messages.queries')>();
  return {
    ...actual,
    useMessagesQuery: vi.fn(),
    useToggleReactionMutation: () => ({
      mutate: toggleMutate,
      isPending: false,
    }),
  };
});

vi.mock('@/queries/auth.queries', () => ({
  useMeQuery: () => ({ data: { id: 'me-1' } }),
}));

vi.mock('@/queries/chats.queries', () => ({
  useChatsQuery: () => ({ data: [{ id: 'chat-1', chat_type: 'private', members: [] }] }),
}));

vi.mock('@/features/conversation/VoiceMessagePlayer', () => ({
  VoiceMessagePlayer: ({ src }: { src: string }) => <div data-testid="voice-player">{src}</div>,
}));

vi.mock('@/features/conversation/MediaMessageContent', () => ({
  ImageMessageContent: ({ url }: { url: string }) => <img alt="Photo" src={url} />,
  VideoMessageContent: ({ url, round }: { url: string; round?: boolean }) => (
    <div data-testid="video-content" data-round={round ? '1' : '0'}>
      {url}
    </div>
  ),
  FileMessageContent: ({ fileName }: { fileName: string | null }) => (
    <span>{fileName ?? 'File'}</span>
  ),
}));

vi.mock('@/features/conversation/PollMessageContent', () => ({
  PollMessageContent: () => <div data-testid="poll-content">Poll</div>,
}));

import type { UseQueryResult } from '@tanstack/react-query';
import type { MappedMessage } from '@/types/message';
import { useMessagesQuery } from '@/queries/messages.queries';

function mockMessagesQuery(messages: MappedMessage[]) {
  return { data: messages } as unknown as UseQueryResult<MappedMessage[]>;
}

describe('MessageBubble', () => {
  beforeEach(() => {
    toggleMutate.mockReset();
    vi.mocked(useMessagesQuery).mockReturnValue(mockMessagesQuery([]));
  });

  it('hides deleted messages instead of showing a placeholder', () => {
    const { container } = render(
      <MessageBubble
        chatId="chat-1"
        message={makeMessage({ is_deleted: true })}
        isOutgoing={false}
        selectionActive={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows reply quote with Russian voice label', () => {
    const replyTarget = makeMessage({
      id: 'reply-src',
      sender_name: 'Боб',
      msg_type: 'voice',
      content: '/uploads/v.webm',
      media: [makeMedia({ remote_url: '/uploads/v.webm', media_type: 'voice' })],
    });
    vi.mocked(useMessagesQuery).mockReturnValue(mockMessagesQuery([replyTarget]));

    render(
      <MessageBubble
        chatId="chat-1"
        message={makeMessage({ reply_to_id: 'reply-src', content: 'ответ' })}
        isOutgoing
        selectionActive={false}
      />,
    );

    expect(screen.getByText('Боб')).toBeInTheDocument();
    expect(screen.getByText('Голосовое сообщение')).toBeInTheDocument();
    expect(screen.getByText('ответ')).toBeInTheDocument();
  });

  it('shows deleted reply preview in Russian', () => {
    const replyTarget = makeMessage({ id: 'reply-del', is_deleted: true });
    vi.mocked(useMessagesQuery).mockReturnValue(mockMessagesQuery([replyTarget]));

    render(
      <MessageBubble
        chatId="chat-1"
        message={makeMessage({ reply_to_id: 'reply-del' })}
        isOutgoing={false}
        selectionActive={false}
      />,
    );

    expect(screen.getByText('Удалённое сообщение')).toBeInTheDocument();
  });

  it('renders voice player for voice messages', () => {
    const message = makeMessage({
      msg_type: 'voice',
      media: [makeMedia({ remote_url: '/uploads/voice.webm', media_type: 'voice' })],
    });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    expect(screen.getByTestId('voice-player')).toHaveTextContent('/uploads/voice.webm');
  });

  it('renders round video note content', () => {
    const message = makeMessage({
      msg_type: 'video_note',
      media: [
        makeMedia({
          remote_url: '/uploads/note.mp4',
          media_type: 'video',
          is_round: true,
        }),
      ],
    });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    expect(screen.getByTestId('video-content')).toHaveAttribute('data-round', '1');
  });

  it('renders image bubble with resolved url', () => {
    const message = makeMessage({
      msg_type: 'image',
      content: null,
      media: [makeMedia({ remote_url: '/uploads/photo.jpg' })],
    });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    const img = screen.getByRole('img', { name: 'Photo' });
    expect(img).toHaveAttribute('src', expect.stringContaining('/uploads/photo.jpg'));
  });

  it('toggles reaction when chip is clicked', async () => {
    const user = userEvent.setup();
    const message = makeMessage({
      reactions: [{ emoji: '👍', count: 2, reacted_by_me: true }],
    });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );

    await user.click(screen.getByRole('button', { name: 'Реакция 👍' }));
    expect(toggleMutate).toHaveBeenCalledWith({
      chatId: 'chat-1',
      messageId: 'msg-1',
      emoji: '👍',
    });
  });

  it('does not show quick reaction while sending', () => {
    const message = makeMessage({ status: 'sending' });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    expect(screen.queryByRole('button', { name: /Реакция/ })).not.toBeInTheDocument();
  });

  it('renders sticker image from encoded payload', () => {
    const stickerContent = encodeStickerPayload({ packId: 'default', stickerId: 'smile' });
    const message = makeMessage({ msg_type: 'text', content: stickerContent });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing={false} selectionActive={false} />,
    );
    expect(screen.getByRole('img', { name: 'Sticker' })).toBeInTheDocument();
  });
});
