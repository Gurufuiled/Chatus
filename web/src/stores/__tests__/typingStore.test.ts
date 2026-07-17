import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TYPING_TTL_MS, useTypingStore } from '@/stores/typingStore';

describe('typingStore', () => {
  beforeEach(() => {
    useTypingStore.setState({ typingUsersByChatId: {} });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds and refreshes typing users', () => {
    const { setTypingUser } = useTypingStore.getState();
    setTypingUser('chat-1', 'u1', true);
    expect(useTypingStore.getState().typingUsersByChatId['chat-1']).toEqual([
      { userId: 'u1', at: Date.now() },
    ]);

    vi.advanceTimersByTime(1000);
    setTypingUser('chat-1', 'u1', true);
    expect(useTypingStore.getState().typingUsersByChatId['chat-1']).toEqual([
      { userId: 'u1', at: Date.now() },
    ]);
  });

  it('removes user on isTyping false and clearUserTyping', () => {
    const { setTypingUser, clearUserTyping } = useTypingStore.getState();
    setTypingUser('chat-1', 'u1', true);
    setTypingUser('chat-1', 'u2', true);
    setTypingUser('chat-1', 'u1', false);
    expect(useTypingStore.getState().typingUsersByChatId['chat-1']).toEqual([
      { userId: 'u2', at: Date.now() },
    ]);

    clearUserTyping('chat-1', 'u2');
    expect(useTypingStore.getState().typingUsersByChatId['chat-1']).toBeUndefined();
  });

  it('clearChatTyping removes one chat only', () => {
    const { setTypingUser, clearChatTyping } = useTypingStore.getState();
    setTypingUser('chat-1', 'u1', true);
    setTypingUser('chat-2', 'u2', true);
    clearChatTyping('chat-1');
    expect(useTypingStore.getState().typingUsersByChatId['chat-1']).toBeUndefined();
    expect(useTypingStore.getState().typingUsersByChatId['chat-2']).toHaveLength(1);
  });

  it('clearStaleTyping drops expired entries', () => {
    const { setTypingUser, clearStaleTyping } = useTypingStore.getState();
    setTypingUser('chat-1', 'u1', true);
    vi.advanceTimersByTime(TYPING_TTL_MS + 1);
    clearStaleTyping();
    expect(useTypingStore.getState().typingUsersByChatId).toEqual({});
  });
});
