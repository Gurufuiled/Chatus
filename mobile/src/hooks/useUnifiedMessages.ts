import { useMemo } from 'react';
import { messageStore } from '../stores/messageStore';
import { useState, useEffect } from 'react';
import { useTelegramChatBridge } from './useTelegramChatBridge';
import { chatusToUnified, telegramToUnified, mergeTimeline } from '../utils/unifiedMessageMapper';
import type { Message } from '../stores/types';
import { authStore } from '../stores/authStore';

export function useUnifiedMessages(
  chatusChatId: string,
  contactPhoneNumber?: string
) {
  // 1. Get Chatus messages
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

  // 2. Get Telegram messages
  const { messages: telegramMessages, sendMessage: sendTelegramMessage, chatId: telegramChatId } = useTelegramChatBridge(contactPhoneNumber || '');

  // 3. Map and Merge
  const unifiedMessages = useMemo(() => {
    const unifiedChatus = chatusMessages.map(m => chatusToUnified(m, myUserId));
    const unifiedTelegram = telegramMessages.map(m => telegramToUnified(m, myUserId)); // Assume TDLib gives is_outgoing directly on message for simplicity here, but we check m.is_outgoing in mapper

    return mergeTimeline(unifiedChatus, unifiedTelegram);
  }, [chatusMessages, telegramMessages, myUserId]);

  return {
    unifiedMessages,
    telegramAvailable: !!telegramChatId,
    sendTelegramMessage
  };
}
