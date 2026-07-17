import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInfoSidebar } from '@/features/conversation/ChatInfoSidebar';
import { makeChat, makeMedia, makeMessage } from '@/test/fixtures';
import { defaultGroupSettings } from '@/types/groupSettings';

const addMembersMutate = vi.fn();
const updateGroupMutate = vi.fn();
const upsertPeerContactMutate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={props.to}>{children}</a>
  ),
}));

vi.mock('@/queries/auth.queries', () => ({
  useMeQuery: () => ({ data: { id: 'me-1' } }),
}));

vi.mock('@/queries/users.queries', () => ({
  useUserDetailQuery: () => ({ data: null }),
  useUserSearchQuery: () => ({ data: [], isFetching: false }),
}));

vi.mock('@/queries/peerContacts.queries', () => ({
  usePeerContactsMap: () => new Map(),
  useUpsertPeerContactMutation: () => ({
    mutate: upsertPeerContactMutate,
    isPending: false,
  }),
  usePeerContactsQuery: () => ({ data: [] }),
}));

vi.mock('@/queries/chats.queries', () => ({
  useChatsQuery: () => ({ data: [] }),
  useAddGroupMembersMutation: () => ({
    mutate: addMembersMutate,
    isPending: false,
  }),
  useUpdateGroupChatMutation: () => ({
    mutate: updateGroupMutate,
    isPending: false,
  }),
  isMissingEndpoint: () => false,
  useGroupSettingsQuery: (chatId: string) => ({
    data: defaultGroupSettings(chatId || 'chat-1'),
    error: null,
    isError: false,
    isLoading: false,
  }),
  useGroupInviteLinkQuery: () => ({
    data: { invite_token: 'demo-token', invite_link: 'chatus://join/demo-token' },
    error: null,
    isError: false,
    isLoading: false,
  }),
  useUpdateGroupSettingsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateGroupAdminMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRegenerateGroupInviteMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeGroupInviteMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveGroupMemberMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useLeaveGroupMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChatMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const messages = [
  makeMessage({
    id: 'img-1',
    msg_type: 'image',
    media: [makeMedia({ remote_url: '/uploads/a.jpg', thumbnail_url: '/uploads/a-thumb.jpg' })],
  }),
  makeMessage({
    id: 'vid-1',
    msg_type: 'video',
    media: [makeMedia({ remote_url: '/uploads/v.mp4', media_type: 'video' })],
  }),
  makeMessage({
    id: 'file-1',
    msg_type: 'file',
    media: [makeMedia({ remote_url: '/uploads/doc.pdf', file_name: 'doc.pdf', file_size: 2048 })],
  }),
  makeMessage({
    id: 'link-1',
    content: 'Смотри https://example.com/page',
    msg_type: 'text',
  }),
  makeMessage({
    id: 'voice-1',
    msg_type: 'voice',
    media: [makeMedia({ remote_url: '/uploads/v.webm', duration_ms: 65000, media_type: 'voice' })],
  }),
];

vi.mock('@/queries/messages.queries', () => ({
  useMessagesQuery: () => ({ data: messages }),
}));

function makeGroupChat() {
  return makeChat({
    chat_type: 'group',
    name: 'Команда',
    peer_display_name: null,
    members: [
      {
        chat_id: 'chat-1',
        user_id: 'me-1',
        role: 'owner',
        access_status: 'active',
        subscription_expires_at: null,
        tag: null,
        tag_color: null,
        joined_at: Date.now(),
        user: {
          id: 'me-1',
          username: 'artem',
          handle: 'artem',
          display_name: 'Артем',
          avatar_url: null,
          phone: null,
          is_online: true,
          last_seen: null,
        },
      },
      {
        chat_id: 'chat-1',
        user_id: 'user-2',
        role: 'member',
        access_status: 'active',
        subscription_expires_at: null,
        tag: null,
        tag_color: null,
        joined_at: Date.now(),
        user: {
          id: 'user-2',
          username: 'papuas',
          handle: 'papuas',
          display_name: 'papuas',
          avatar_url: null,
          phone: null,
          is_online: false,
          last_seen: null,
        },
      },
    ],
  });
}

describe('ChatInfoSidebar', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    addMembersMutate.mockReset();
    updateGroupMutate.mockReset();
    upsertPeerContactMutate.mockReset();
  });

  it('renders media tab by default with grid items', () => {
    const chat = makeChat({ peer_display_name: 'Анна' });
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    expect(screen.getByText('Информация')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Медиа' })).toHaveClass('chat-info-sidebar__tab-btn--active');
    const grid = document.querySelector('.chat-info-sidebar__media-grid');
    expect(grid).toBeTruthy();
    expect(within(grid as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });

  it('shows personal note field and edit name for private chats with peer', async () => {
    const user = userEvent.setup();
    const chat = makeChat({
      peer_display_name: 'Анна',
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
          user: {
            id: 'peer-1',
            username: 'anna',
            handle: 'anna',
            display_name: 'Анна',
            avatar_url: null,
            phone: null,
            is_online: false,
            last_seen: null,
          },
        },
      ],
    });
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    const note = screen.getByLabelText('Заметка');
    expect(note).toBeInTheDocument();
    await user.type(note, 'коллега');
    await user.tab();
    expect(upsertPeerContactMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        peerUserId: 'peer-1',
        payload: { note: 'коллега' },
      }),
      expect.anything(),
    );

    upsertPeerContactMutate.mockClear();
    await user.click(screen.getByRole('button', { name: 'Изменить имя' }));
    const firstName = screen.getByLabelText('Имя');
    const lastName = screen.getByLabelText('Фамилия');
    await user.clear(firstName);
    await user.type(firstName, 'Мария');
    await user.clear(lastName);
    await user.type(lastName, 'П');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(upsertPeerContactMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        peerUserId: 'peer-1',
        payload: { first_name: 'Мария', last_name: 'П' },
      }),
      expect.anything(),
    );
  });

  it('opens lightbox when image thumbnail is clicked', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    const grid = document.querySelector('.chat-info-sidebar__media-grid') as HTMLElement;
    await user.click(within(grid).getAllByRole('button')[0]);

    expect(screen.getByRole('dialog', { name: 'Просмотр изображения' })).toBeInTheDocument();
  });

  it('switches to files tab and lists file rows', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.click(screen.getByRole('tab', { name: 'Файлы' }));
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('switches to links tab and shows extracted urls', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.click(screen.getByRole('tab', { name: 'Ссылки' }));
    expect(screen.getByText('https://example.com/page')).toBeInTheDocument();
  });

  it('switches to voice tab with Russian labels', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.click(screen.getByRole('tab', { name: 'Голосовые' }));
    expect(screen.getByText('Голосовое сообщение')).toBeInTheDocument();
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });

  it('closes on Escape when lightbox is not open', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows settings and add-member for group owners; no Favorites', () => {
    render(<ChatInfoSidebar chat={makeGroupChat()} onClose={onClose} />);

    const settingsBtn = screen.getByRole('button', { name: 'Настройки группы' });
    const addBtn = screen.getByRole('button', { name: 'Добавить участника' });
    const notifications = screen.getByText('Уведомления');
    const participants = screen.getByText(/Участники \(2\)/i);

    expect(screen.queryByText('Избранное')).not.toBeInTheDocument();
    expect(
      notifications.compareDocumentPosition(settingsBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      settingsBtn.compareDocumentPosition(addBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      addBtn.compareDocumentPosition(participants) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('opens group settings panel for owners', async () => {
    const user = userEvent.setup();
    render(<ChatInfoSidebar chat={makeGroupChat()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Настройки группы' }));

    expect(screen.getByRole('heading', { name: 'Настройки группы' })).toBeInTheDocument();
    expect(screen.getByText('Права участников')).toBeInTheDocument();
    expect(screen.getByText('Администраторы')).toBeInTheDocument();
    expect(screen.queryByText('Создавать опросы')).not.toBeInTheDocument();
  });

  it('opens member permissions with poll toggle', async () => {
    const user = userEvent.setup();
    render(<ChatInfoSidebar chat={makeGroupChat()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Настройки группы' }));
    await user.click(screen.getByRole('button', { name: /Права участников/i }));

    expect(screen.getByText('Создавать опросы')).toBeInTheDocument();
    expect(screen.queryByText('Запретить сохранение контента')).not.toBeInTheDocument();
  });

  it('shows group settings for admins but not add-member', () => {
    const chat = makeGroupChat();
    chat.members = chat.members?.map((member) =>
      member.user_id === 'me-1' ? { ...member, role: 'admin' } : member,
    );
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    expect(screen.getByRole('button', { name: 'Настройки группы' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить участника' })).not.toBeInTheDocument();
  });

  it('opens group edit mode from pencil instead of profile settings', async () => {
    const user = userEvent.setup();
    render(<ChatInfoSidebar chat={makeGroupChat()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Редактировать группу' }));

    expect(screen.getByText('Редактирование')).toBeInTheDocument();
    expect(screen.getByLabelText('Название группы')).toHaveValue('Команда');
    expect(screen.queryByRole('link', { name: 'Редактировать' })).not.toBeInTheDocument();
  });

  it('saves group name and description from edit mode', async () => {
    const user = userEvent.setup();
    const chat = makeGroupChat();
    chat.description = 'Старое описание';
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);

    expect(screen.getByText('Старое описание')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Редактировать группу' }));
    await user.clear(screen.getByLabelText('Название группы'));
    await user.type(screen.getByLabelText('Название группы'), 'Новая команда');
    await user.clear(screen.getByLabelText('Описание группы'));
    await user.type(screen.getByLabelText('Описание группы'), 'Новое описание');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(updateGroupMutate).toHaveBeenCalledWith(
      {
        chatId: 'chat-1',
        name: 'Новая команда',
        description: 'Новое описание',
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('shows validation error when saving empty group name', async () => {
    const user = userEvent.setup();
    render(<ChatInfoSidebar chat={makeGroupChat()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Редактировать группу' }));
    await user.clear(screen.getByLabelText('Название группы'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Введите название группы');
    expect(updateGroupMutate).not.toHaveBeenCalled();
  });

  it('cancels group edit on Escape without closing sidebar', async () => {
    const user = userEvent.setup();
    render(<ChatInfoSidebar chat={makeGroupChat()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Редактировать группу' }));
    await user.keyboard('{Escape}');

    expect(screen.getByText('Информация')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides group edit pencil for private chats', () => {
    render(<ChatInfoSidebar chat={makeChat()} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Редактировать группу' })).not.toBeInTheDocument();
  });

  it('hides group edit pencil for non-owner members', () => {
    const chat = makeGroupChat();
    chat.members = chat.members?.map((member) =>
      member.user_id === 'me-1' ? { ...member, role: 'member' } : member,
    );
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Редактировать группу' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Настройки группы' })).not.toBeInTheDocument();
  });

  it('opens add-member picker from group profile', async () => {
    const user = userEvent.setup();
    render(<ChatInfoSidebar chat={makeGroupChat()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Добавить участника' }));

    expect(screen.getByRole('dialog', { name: 'Добавить участника' })).toBeInTheDocument();
    expect(screen.getByLabelText('Поиск по имени или @username')).toBeInTheDocument();
  });

  it('does not show add-member control for private chats', () => {
    render(<ChatInfoSidebar chat={makeChat()} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Добавить участника' })).not.toBeInTheDocument();
  });

  it('does not show add-member control for non-owner group members', () => {
    const chat = makeGroupChat();
    chat.members = chat.members?.map((member) =>
      member.user_id === 'me-1' ? { ...member, role: 'member' } : member,
    );
    render(<ChatInfoSidebar chat={chat} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Добавить участника' })).not.toBeInTheDocument();
    expect(screen.getByText(/Участники \(2\)/i)).toBeInTheDocument();
  });
});
