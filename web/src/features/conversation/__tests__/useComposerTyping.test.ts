import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useComposerTyping } from '../useComposerTyping';

const sendTyping = vi.fn();

vi.mock('@/ws/wsClient', () => ({
  wsClient: {
    sendTyping: (...args: unknown[]) => sendTyping(...args),
  },
}));

describe('useComposerTyping', () => {
  beforeEach(() => {
    sendTyping.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits typing from persisted draft on mount', () => {
    renderHook(() => useComposerTyping('chat-1', true, 'hello'));
    expect(sendTyping).toHaveBeenCalledWith('chat-1', true);
  });

  it('does not emit typing for empty draft on mount', () => {
    renderHook(() => useComposerTyping('chat-1', true, '   '));
    expect(sendTyping).not.toHaveBeenCalled();
  });

  it('stops typing when disabled (e.g. voice recording)', () => {
    const { result, rerender } = renderHook(
      ({ enabled, draft }) => useComposerTyping('chat-1', enabled, draft),
      { initialProps: { enabled: true, draft: 'hi' } },
    );
    expect(sendTyping).toHaveBeenCalledWith('chat-1', true);
    sendTyping.mockClear();

    rerender({ enabled: false, draft: 'hi' });
    expect(sendTyping).toHaveBeenCalledWith('chat-1', false);

    sendTyping.mockClear();
    result.current.onDraftChange('still typing');
    expect(sendTyping).not.toHaveBeenCalled();
  });

  it('stops typing on message sent and empty draft', () => {
    const { result } = renderHook(() => useComposerTyping('chat-1', true, 'hi'));
    sendTyping.mockClear();

    result.current.onMessageSent();
    expect(sendTyping).toHaveBeenCalledWith('chat-1', false);

    sendTyping.mockClear();
    result.current.onDraftChange('again');
    expect(sendTyping).toHaveBeenCalledWith('chat-1', true);

    sendTyping.mockClear();
    result.current.onDraftChange('');
    expect(sendTyping).toHaveBeenCalledWith('chat-1', false);
  });
});
