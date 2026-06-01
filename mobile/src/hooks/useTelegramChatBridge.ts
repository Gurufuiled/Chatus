import { useEffect, useState } from 'react';
import { tdlibClient } from '../services/tdlib/TdlibClient';
type TdlibMessage = any;
import { telegramAccountStore } from '../stores/telegramAccountStore';

export function useTelegramChatBridge(contactPhoneNumber: string) {
  const [messages, setMessages] = useState<TdlibMessage[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(telegramAccountStore.getState().authStatus === 'ready');
    useEffect(() => {
      const unsub = telegramAccountStore.subscribe((state) => {
         setIsAuthReady(state.authStatus === 'ready');
      });
      return unsub;
    }, []);

  useEffect(() => {
    if (!isAuthReady || !contactPhoneNumber) return;

    let mounted = true;
    let localChatId: number | null = null;

    async function init() {
      try {
        // Find user by phone number
        const userRes = await tdlibClient.send({
          '@type': 'searchUserByPhoneNumber',
          phone_number: contactPhoneNumber
        });

        if (userRes['@type'] !== 'user' || !(userRes as any).id) {
            return;
        }

        // Get or create private chat
        const chatRes = await tdlibClient.send({
          '@type': 'createPrivateChat',
          user_id: (userRes as any).id,
          force: false
        });

        if (chatRes['@type'] !== 'chat' || !(chatRes as any).id) {
            return;
        }

        localChatId = (chatRes as any).id;
        if (mounted) {
            setChatId(localChatId);
        }

        // Open chat to subscribe to updates
        await tdlibClient.send({
            '@type': 'openChat',
            chat_id: localChatId
        });

        // Load initial history
        const historyRes = await tdlibClient.send({
            '@type': 'getChatHistory',
            chat_id: localChatId,
            from_message_id: 0,
            offset: 0,
            limit: 50,
            only_local: false
        });

        if (historyRes['@type'] === 'messages' && mounted) {
            setMessages((historyRes as any).messages || []);
        }

      } catch (err) {
        console.error('[useTelegramChatBridge] Initialization error:', err);
      }
    }

    init();

    const unsub = tdlibClient.subscribe((event) => {
        if (!mounted || !localChatId) return;

        if (event['@type'] === 'updateNewMessage' && (event as any).message?.chat_id === localChatId) {
            setMessages(prev => [(event as any).message, ...prev]);
        }
    });

    return () => {
        mounted = false;
        unsub();
        if (localChatId) {
            tdlibClient.send({
                '@type': 'closeChat',
                chat_id: localChatId
            }).catch(() => {});
        }
    };
  }, [contactPhoneNumber, isAuthReady]);

  const sendMessage = async (text: string) => {
    if (!chatId) return;

    await tdlibClient.send({
      '@type': 'sendMessage',
      chat_id: chatId,
      input_message_content: {
        '@type': 'inputMessageText',
        text: {
          '@type': 'formattedText',
          text: text
        }
      }
    });
  };

  return { messages, chatId, sendMessage };
}
