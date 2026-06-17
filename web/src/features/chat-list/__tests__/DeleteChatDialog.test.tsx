import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteChatDialog } from '@/features/chat-list/DeleteChatDialog';
import { makeChat } from '@/test/fixtures';

describe('DeleteChatDialog', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onConfirm.mockReset();
  });

  it('shows private chat copy with peer name', () => {
    const chat = makeChat({ peer_display_name: 'Мария', chat_type: 'private' });
    render(<DeleteChatDialog chat={chat} onClose={onClose} onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog', { name: 'Удалить чат' })).toBeInTheDocument();
    expect(screen.getByText(/Удалить чат с Мария/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /УДАЛИТЬ У СЕБЯ И У МАРИЯ/ })).toBeInTheDocument();
  });

  it('shows group delete-for-all label', () => {
    const chat = makeChat({ name: 'Команда', chat_type: 'group', peer_display_name: null });
    render(<DeleteChatDialog chat={chat} onClose={onClose} onConfirm={onConfirm} />);

    expect(screen.getByRole('button', { name: 'УДАЛИТЬ ДЛЯ ВСЕХ' })).toBeInTheDocument();
    expect(screen.getByText(/Удалить чат Команда/)).toBeInTheDocument();
  });

  it('calls onConfirm with scope and blocks close while pending', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(
      <DeleteChatDialog chat={chat} onClose={onClose} onConfirm={onConfirm} isPending />,
    );

    const dangerButtons = screen.getAllByRole('button', { name: 'УДАЛЕНИЕ...' });
    expect(dangerButtons).toHaveLength(2);
    dangerButtons.forEach((btn) => expect(btn).toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'ОТМЕНА' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('confirms delete for me only', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<DeleteChatDialog chat={chat} onClose={onClose} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'УДАЛИТЬ ТОЛЬКО У СЕБЯ' }));
    expect(onConfirm).toHaveBeenCalledWith('me');
  });

  it('closes on Escape when not pending', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    render(<DeleteChatDialog chat={chat} onClose={onClose} onConfirm={onConfirm} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
