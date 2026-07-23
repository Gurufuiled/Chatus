import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '@/features/conversation/MessageBubble';
import { makeMedia, makeMessage } from '@/test/fixtures';
import { encodeStickerPayload } from '@/utils/stickerPayload';

const toggleMutate = vi.fn();
const joinMutate = vi.fn();
const joinMutateAsync = vi.fn();
const navigateMock = vi.fn();
const resolveInviteMock = vi.fn();
const confirmMock = vi.fn(() => true);

vi.mock('@/data/stickerCatalog', () => ({
  getStickerImageUrl: () => '/stickers/mock.webp',
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/services/chatService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chatService')>();
  return {
    ...actual,
    resolveGroupInvite: (...args: unknown[]) => resolveInviteMock(...args),
  };
});

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
  useJoinGroupByInviteMutation: () => ({
    mutate: joinMutate,
    mutateAsync: joinMutateAsync,
    isPending: false,
  }),
  useResolveGroupInviteQuery: () => ({
    data: undefined,
    isLoading: false,
  }),
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
    joinMutate.mockReset();
    joinMutateAsync.mockReset();
    navigateMock.mockReset();
    resolveInviteMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockReturnValue(true);
    vi.stubGlobal('confirm', confirmMock);
    resolveInviteMock.mockResolvedValue({
      chat_id: 'group-joined',
      name: 'Тестовая',
      avatar_url: null,
      member_count: 3,
    });
    joinMutateAsync.mockResolvedValue({ id: 'group-joined' });
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

  it('overlays timestamp on media-only photo bubbles', () => {
    const message = makeMessage({
      msg_type: 'image',
      content: null,
      status: 'read',
      media: [makeMedia({ remote_url: '/uploads/photo.jpg' })],
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    expect(container.querySelector('.message-bubble--visual-media')).toBeTruthy();
    expect(container.querySelector('.message-bubble--media-only')).toBeTruthy();
    const overlay = container.querySelector('.message-bubble__meta--overlay');
    expect(overlay).toBeTruthy();
    expect(container.querySelector('.message-bubble__media-frame')?.contains(overlay)).toBe(true);
    expect(overlay?.querySelector('.chat-status-checks')).toBeTruthy();
  });

  it('keeps timestamp below caption for photo with caption', () => {
    const message = makeMessage({
      msg_type: 'image',
      content: 'Hello caption',
      status: 'sent',
      media: [makeMedia({ remote_url: '/uploads/photo.jpg' })],
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing={false} selectionActive={false} />,
    );
    expect(container.querySelector('.message-bubble--with-caption')).toBeTruthy();
    expect(container.querySelector('.message-bubble__meta--overlay')).toBeNull();
    expect(screen.getByText('Hello caption')).toHaveClass('message-bubble__caption');
    expect(container.querySelector('.message-bubble__meta')).toBeTruthy();
  });

  it('shows sender name above visual media in groups', () => {
    const message = makeMessage({
      msg_type: 'image',
      content: null,
      sender_name: 'Мария',
      media: [makeMedia({ remote_url: '/uploads/photo.jpg' })],
    });
    const { container } = render(
      <MessageBubble
        chatId="chat-1"
        message={message}
        isOutgoing={false}
        selectionActive={false}
        showSenderName
        senderDisplayName="Мария"
        senderNameColor="#E17076"
      />,
    );
    expect(screen.getByText('Мария')).toHaveClass('message-bubble__sender-name');
    expect(container.querySelector('.message-bubble--with-sender')).toBeTruthy();
    expect(container.querySelector('.message-bubble__meta--overlay')).toBeTruthy();
  });

  it('keeps external meta when image url is missing', () => {
    const message = makeMessage({
      msg_type: 'image',
      content: null,
      media: [],
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    expect(container.querySelector('.message-bubble__meta--overlay')).toBeNull();
    expect(container.querySelector('.message-bubble__meta')).toBeTruthy();
  });

  it('overlays timestamp on media-only flat video above controls', () => {
    const message = makeMessage({
      msg_type: 'video',
      content: null,
      status: 'sent',
      media: [makeMedia({ remote_url: '/uploads/clip.mp4', media_type: 'video' })],
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    expect(container.querySelector('.message-bubble--flat-video')).toBeTruthy();
    expect(container.querySelector('.message-bubble--album')).toBeNull();
    expect(container.querySelector('.message-bubble__meta--overlay')).toBeTruthy();
  });

  it('overlays timestamp on media-only album bubbles', () => {
    const message = makeMessage({
      msg_type: 'image',
      content: null,
      status: 'read',
      media: [
        makeMedia({ id: 'm1', remote_url: '/uploads/a.jpg' }),
        makeMedia({ id: 'm2', remote_url: '/uploads/b.jpg' }),
      ],
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    expect(container.querySelector('.message-bubble--album')).toBeTruthy();
    expect(container.querySelector('.message-bubble--media-only')).toBeTruthy();
    expect(container.querySelector('.message-bubble--flat-video')).toBeNull();
    const overlay = container.querySelector('.message-bubble__meta--overlay');
    expect(overlay).toBeTruthy();
    expect(container.querySelector('.message-bubble__media-frame')?.contains(overlay)).toBe(true);
  });

  it('keeps external meta for video with caption', () => {
    const message = makeMessage({
      msg_type: 'video',
      content: 'Watch this',
      status: 'sent',
      media: [makeMedia({ remote_url: '/uploads/clip.mp4', media_type: 'video' })],
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing={false} selectionActive={false} />,
    );
    expect(container.querySelector('.message-bubble--with-caption')).toBeTruthy();
    expect(container.querySelector('.message-bubble__meta--overlay')).toBeNull();
    expect(screen.getByText('Watch this')).toHaveClass('message-bubble__caption');
    expect(container.querySelector('.message-bubble__meta')).toBeTruthy();
  });

  it('keeps bubble chrome for media-only with reactions', () => {
    const message = makeMessage({
      msg_type: 'image',
      content: null,
      status: 'read',
      media: [makeMedia({ remote_url: '/uploads/photo.jpg' })],
      reactions: [{ emoji: '👍', count: 1, reacted_by_me: false }],
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing selectionActive={false} />,
    );
    const bubble = container.querySelector('.message-bubble');
    expect(bubble).toHaveClass('message-bubble--media-only');
    expect(bubble).toHaveClass('message-bubble--with-reactions');
    expect(container.querySelector('.message-bubble__meta--overlay')).toBeTruthy();
    expect(container.querySelector('.message-bubble__footer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Реакция 👍' })).toBeInTheDocument();
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

  it('renders invite-only message as join card and joins on click', async () => {
    const user = userEvent.setup();
    const message = makeMessage({
      msg_type: 'text',
      content: 'chatus://join/group-ab76be66',
    });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing={false} selectionActive={false} />,
    );
    expect(screen.getByText('Приглашение в группу')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Присоединиться к группе/i }));
    expect(resolveInviteMock).toHaveBeenCalledWith('group-ab76be66');
    expect(confirmMock).toHaveBeenCalled();
    expect(joinMutateAsync).toHaveBeenCalledWith('group-ab76be66');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/chat/$chatId',
      params: { chatId: 'group-joined' },
    });
  });

  it('does not join when confirm is cancelled', async () => {
    const user = userEvent.setup();
    confirmMock.mockReturnValue(false);
    const message = makeMessage({
      msg_type: 'text',
      content: 'chatus://join/group-ab76be66',
    });
    render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing={false} selectionActive={false} />,
    );
    await user.click(screen.getByRole('button', { name: /Присоединиться к группе/i }));
    expect(confirmMock).toHaveBeenCalled();
    expect(joinMutateAsync).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders inline invite link inside mixed text', () => {
    const message = makeMessage({
      msg_type: 'text',
      content: 'Заходи chatus://join/demo-token сюда',
    });
    const { container } = render(
      <MessageBubble chatId="chat-1" message={message} isOutgoing={false} selectionActive={false} />,
    );
    expect(container.querySelector('.message-bubble--invite')).toBeNull();
    expect(screen.getByRole('button', { name: 'chatus://join/demo-token' })).toBeInTheDocument();
  });

  it('shows colored sender name when requested for group runs', () => {
    const message = makeMessage({ sender_name: 'Мария' });
    const { container } = render(
      <MessageBubble
        chatId="chat-1"
        message={message}
        isOutgoing={false}
        selectionActive={false}
        showSenderName
        senderDisplayName="Мария"
        senderNameColor="#E17076"
      />,
    );
    const name = screen.getByText('Мария');
    expect(name).toHaveClass('message-bubble__sender-name');
    expect(name).toHaveStyle({ color: '#E17076' });
    expect(container.querySelector('.message-bubble--with-sender')).toBeTruthy();
  });

  it('hides sender name when showSenderName is false', () => {
    const message = makeMessage({ sender_name: 'Мария' });
    render(
      <MessageBubble
        chatId="chat-1"
        message={message}
        isOutgoing={false}
        selectionActive={false}
        showSenderName={false}
        senderDisplayName="Мария"
      />,
    );
    expect(screen.queryByText('Мария')).not.toBeInTheDocument();
  });
});
