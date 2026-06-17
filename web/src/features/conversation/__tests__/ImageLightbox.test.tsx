import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageLightbox } from '@/features/conversation/ImageLightbox';

describe('ImageLightbox', () => {
  it('renders image in dialog and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageLightbox src="https://example.com/photo.jpg" onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Просмотр изображения' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo' })).toHaveAttribute(
      'src',
      'https://example.com/photo.jpg',
    );
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageLightbox src="/uploads/a.jpg" onClose={onClose} />);

    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });
});
