import { useEffect, useState } from 'react';
import { tdlibClient } from '../services/tdlib/TdlibClient';
import { throwIfTdError } from '../services/tdlib/tdlibErrors';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { normalizePhoneForTdlib } from '../utils/telegramPhone';
import { buildInputMessageVideoNoteContent } from '../screens/telegramChat/composer';
import { probeLocalVideoDimensionsWithRetry } from '../utils/probeLocalVideoDimensions';

type TdlibMessage = { '@type'?: string; [key: string]: unknown };

async function resolveTelegramUserIdByPhone(normalizedPhone: string): Promise<number | null> {
  const search = await tdlibClient.send({
    '@type': 'searchUserByPhoneNumber',
    phone_number: normalizedPhone,
  });

  if (search['@type'] === 'user' && typeof (search as { id?: number }).id === 'number') {
    return (search as { id: number }).id;
  }

  if (search['@type'] === 'error') {
    const message = String((search as { message?: string }).message ?? '');
    if (__DEV__) {
      console.warn('[useTelegramChatBridge] searchUserByPhoneNumber:', message);
    }
  }

  try {
    await tdlibClient.send({
      '@type': 'importContacts',
      contacts: [
        {
          '@type': 'contact',
          phone_number: normalizedPhone,
          first_name: 'Chatus',
          last_name: 'Contact',
        },
      ],
    });
  } catch (err) {
    if (__DEV__) {
      console.warn('[useTelegramChatBridge] importContacts failed', err);
    }
  }

  const retry = await tdlibClient.send({
    '@type': 'searchUserByPhoneNumber',
    phone_number: normalizedPhone,
  });

  if (retry['@type'] === 'user' && typeof (retry as { id?: number }).id === 'number') {
    return (retry as { id: number }).id;
  }

  return null;
}

export function useTelegramChatBridge(contactPhoneNumber: string) {
  const [messages, setMessages] = useState<TdlibMessage[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(telegramAccountStore.getState().authStatus === 'ready');

  useEffect(() => {
    const unsub = telegramAccountStore.subscribe((state) => {
      setIsAuthReady(state.authStatus === 'ready');
    });
    return unsub;
  }, []);

  useEffect(() => {
    const normalizedPhone = normalizePhoneForTdlib(contactPhoneNumber);
    if (!isAuthReady || !normalizedPhone) {
      setChatId(null);
      setMessages([]);
      setIsResolving(false);
      return;
    }

    let mounted = true;
    let localChatId: number | null = null;

    async function init() {
      setIsResolving(true);
      try {
        const userId = await resolveTelegramUserIdByPhone(normalizedPhone);
        if (!mounted || userId == null) {
          return;
        }

        const chatRes = await tdlibClient.send({
          '@type': 'createPrivateChat',
          user_id: userId,
          force: false,
        });

        if (chatRes['@type'] !== 'chat' || typeof (chatRes as { id?: number }).id !== 'number') {
          return;
        }

        localChatId = (chatRes as { id: number }).id;
        if (mounted) {
          setChatId(localChatId);
        }

        await tdlibClient.send({
          '@type': 'openChat',
          chat_id: localChatId,
        });

        const historyRes = await tdlibClient.send({
          '@type': 'getChatHistory',
          chat_id: localChatId,
          from_message_id: 0,
          offset: 0,
          limit: 50,
          only_local: false,
        });

        if (historyRes['@type'] === 'messages' && mounted) {
          setMessages(((historyRes as { messages?: TdlibMessage[] }).messages ?? []) as TdlibMessage[]);
        }
      } catch (err) {
        console.error('[useTelegramChatBridge] Initialization error:', err);
      } finally {
        if (mounted) {
          setIsResolving(false);
        }
      }
    }

    void init();

    const unsub = tdlibClient.subscribe((update) => {
      if (!mounted || !localChatId) return;

      if (
        update['@type'] === 'updateNewMessage' &&
        (update as { message?: { chat_id?: number } }).message?.chat_id === localChatId
      ) {
        setMessages((prev) => [(update as { message: TdlibMessage }).message, ...prev]);
      }
    });

    return () => {
      mounted = false;
      unsub();
      if (localChatId) {
        tdlibClient.send({
          '@type': 'closeChat',
          chat_id: localChatId,
        }).catch(() => {});
      }
    };
  }, [contactPhoneNumber, isAuthReady]);

  const sendMessage = async (text: string) => {
    if (!chatId) {
      throw new Error('Telegram chat is not ready');
    }

    await tdlibClient.send({
      '@type': 'sendMessage',
      chat_id: chatId,
      input_message_content: {
        '@type': 'inputMessageText',
        text: {
          '@type': 'formattedText',
          text,
        },
      },
    });
  };

  const sendVideoNote = async (result: {
    uri: string;
    durationMs: number;
    thumbnailUri?: string;
  }) => {
    if (!chatId) {
      throw new Error('Telegram chat is not ready');
    }

    const probed = await probeLocalVideoDimensionsWithRetry(result.uri);
    if (!probed) {
      throw new Error(
        'Не удалось определить размер видео. Запишите ещё раз через свайп вверх по микрофону.',
      );
    }
    const lengthPx = Math.min(
      640,
      Math.max(240, Math.round(Math.min(probed.width, probed.height))),
    );

    const inputMessageContent = buildInputMessageVideoNoteContent({
      videoUri: result.uri,
      thumbnailUri: result.thumbnailUri,
      durationMs: result.durationMs,
      lengthPx,
    });

    const response = await tdlibClient.send({
      '@type': 'sendMessage',
      chat_id: chatId,
      input_message_content: inputMessageContent,
    });
    throwIfTdError(response);
  };

  return { messages, chatId, sendMessage, sendVideoNote, isResolving };
}
