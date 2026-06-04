import { useMemo, useState, useEffect } from 'react';
import { messageStore } from '../stores/messageStore';
import { chatStore } from '../stores/chatStore';
import { useTelegramChatBridge } from './useTelegramChatBridge';
import { chatusToUnified, telegramToUnified, mergeTimeline } from '../utils/unifiedMessageMapper';
import { authStore } from '../stores/authStore';
import { telegramAccountStore } from '../stores/telegramAccountStore';
import { normalizePhoneForTdlib } from '../utils/telegramPhone';

export function useUnifiedMessages(
  chatusChatId: string,
  contactPhoneNumber?: string
) {
  const [chatusMessages, setChatusMessages] = useState(messageStore.getState().messagesByChatId[chatusChatId] || []);
  useEffect(() => {
    const unsub = messageStore.subscribe((state) => {
      setChatusMessages(state.messagesByChatId[chatusChatId] || []);
    });
    return unsub;
  }, [chatusChatId]);

  const [myUserId, setMyUserId] = useState(authStore.getState().user?.id || '');
  useEffect(() => {
    const unsub = authStore.subscribe((state) => {
      setMyUserId(state.user?.id || '');
    });
    return unsub;
  }, []);

  const [isTelegramAuthReady, setIsTelegramAuthReady] = useState(
    telegramAccountStore.getState().authStatus === 'ready',
  );
  useEffect(() => {
    return telegramAccountStore.subscribe((state) => {
      setIsTelegramAuthReady(state.authStatus === 'ready');
    });
  }, []);

  const isPrivateChat = chatStore(
    (s) => s.chats.find((c) => c.id === chatusChatId)?.chat_type === 'private',
  );

  const normalizedPeerPhone = useMemo(() => {
    if (!contactPhoneNumber?.trim()) return '';
    return normalizePhoneForTdlib(contactPhoneNumber);
  }, [contactPhoneNumber]);

  const hasPeerPhone = normalizedPeerPhone.replace(/\D/g, '').length >= 10;

  const {
    messages: telegramMessages,
    sendMessage: sendTelegramMessage,
    chatId: telegramChatId,
    isResolving: telegramBridgeResolving,
  } = useTelegramChatBridge(normalizedPeerPhone);

  const unifiedMessages = useMemo(() => {
    const unifiedChatus = chatusMessages.map((m) => chatusToUnified(m, myUserId));
    const unifiedTelegram = telegramMessages.map((m) => telegramToUnified(m, myUserId));

    return mergeTimeline(unifiedChatus, unifiedTelegram);
  }, [chatusMessages, telegramMessages, myUserId]);

  /** Telegram в меню отправки: личный чат + ваш TDLib подключён. */
  const telegramAvailable = isTelegramAuthReady && isPrivateChat;

  /** TDLib нашёл чат по номеру — можно отправить. */
  const telegramSendReady = hasPeerPhone && !!telegramChatId;

  return {
    unifiedMessages,
    telegramAvailable,
    telegramSendReady,
    telegramBridgeResolving: hasPeerPhone && telegramBridgeResolving,
    hasPeerPhone,
    sendTelegramMessage,
  };
}
