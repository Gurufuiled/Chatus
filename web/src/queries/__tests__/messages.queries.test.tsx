import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  messagesQueryKey,
  removeTempMessages,
  useSendMessageMutation,
} from '@/queries/messages.queries';
import { meQueryKey } from '@/queries/auth.queries';
import { createTestQueryClient } from '@/test/render';
import { makeMessage } from '@/test/fixtures';
import { useComposerStore } from '@/stores/composerStore';

vi.mock('@/services/messageService', () => ({
  sendTextMessage: vi.fn(),
}));

import { sendTextMessage } from '@/services/messageService';

function wrapper(queryClient = createTestQueryClient()) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('messages.queries', () => {
  beforeEach(() => {
    useComposerStore.setState({ composerErrors: {} });
    vi.mocked(sendTextMessage).mockReset();
  });

  it('removeTempMessages filters optimistic ids', () => {
    const messages = [
      makeMessage({ id: 'temp-abc' }),
      makeMessage({ id: 'real-1' }),
      makeMessage({ id: 'temp-def' }),
    ];
    expect(removeTempMessages(messages).map((m) => m.id)).toEqual(['real-1']);
  });

  it('optimistically adds sending message then replaces on success', async () => {
    const queryClient = createTestQueryClient();
    const chatId = 'chat-1';
    const serverMessage = makeMessage({ id: 'server-1', content: 'Отправлено', status: 'sent' });
    queryClient.setQueryData(meQueryKey, { id: 'me-1', username: 'me' });
    queryClient.setQueryData(messagesQueryKey(chatId), []);

    let resolveSend!: (value: typeof serverMessage) => void;
    const sendPromise = new Promise<typeof serverMessage>((resolve) => {
      resolveSend = resolve;
    });
    vi.mocked(sendTextMessage).mockReturnValue(sendPromise);

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ chatId, text: 'Привет', clientTempId: 'tmp-1' });

    await waitFor(() => {
      const cached = queryClient.getQueryData<ReturnType<typeof makeMessage>[]>(
        messagesQueryKey(chatId),
      );
      expect(cached?.some((m) => m.id === 'temp-tmp-1' && m.status === 'sending')).toBe(true);
    });

    resolveSend(serverMessage);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const final = queryClient.getQueryData<ReturnType<typeof makeMessage>[]>(
      messagesQueryKey(chatId),
    );
    expect(final).toHaveLength(1);
    expect(final![0].id).toBe('server-1');
    expect(final![0].content).toBe('Отправлено');
  });

  it('marks optimistic message as error on failure', async () => {
    const queryClient = createTestQueryClient();
    const chatId = 'chat-err';
    queryClient.setQueryData(messagesQueryKey(chatId), []);

    vi.mocked(sendTextMessage).mockRejectedValue(new Error('Сеть недоступна'));

    const { result } = renderHook(() => useSendMessageMutation(), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ chatId, text: 'fail', clientTempId: 'tmp-err' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<ReturnType<typeof makeMessage>[]>(
      messagesQueryKey(chatId),
    );
    expect(cached?.[0].status).toBe('error');
    expect(useComposerStore.getState().composerErrors[chatId]).toBe('Сеть недоступна');
  });
});
