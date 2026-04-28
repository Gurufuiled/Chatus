/**
 * Persist and apply "hide only on this device" for others' messages (no server delete).
 */

import { getDatabase } from './DatabaseService';
import { chatStore } from '../stores/chatStore';
import { locallyHiddenMessageStore } from '../stores/locallyHiddenMessageStore';
import { messageStore } from '../stores/messageStore';
import type { Chat, Message } from '../stores/types';

export async function persistLocallyHiddenMessage(chatId: string, messageId: string): Promise<void> {
  try {
    const db = getDatabase();
    await db.runAsync(
      `INSERT OR IGNORE INTO locally_hidden_messages (chat_id, message_id, created_at) VALUES (?, ?, ?)`,
      [chatId, messageId, Date.now()]
    );
  } catch {
    // ignore persistence errors — UI already hid the row
  }
}

/** Remove someone else's message only from this device; optional local unpin without calling the server. */
export async function hideOthersMessageOnlyOnDevice(options: {
  chatId: string;
  message: Message;
  currentChat: Chat | null;
  pinnedMessageId: string | null;
}): Promise<void> {
  const { chatId, message, currentChat, pinnedMessageId } = options;
  locallyHiddenMessageStore.getState().markHidden(chatId, message.id);
  await persistLocallyHiddenMessage(chatId, message.id);
  messageStore.getState().removeMessage(chatId, message.id);
  if (pinnedMessageId === message.id && currentChat) {
    chatStore.getState().updateChat({
      ...currentChat,
      pinned_message_id: null,
    });
  }
}
