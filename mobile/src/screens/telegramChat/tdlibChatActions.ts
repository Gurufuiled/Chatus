import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';

export async function tdlibPinChatMessage(chatId: number, messageId: number): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'pinChatMessage',
    chat_id: chatId,
    message_id: messageId,
    disable_notification: false,
    only_for_self: false,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibUnpinChatMessage(chatId: number, messageId: number): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'unpinChatMessage',
    chat_id: chatId,
    message_id: messageId,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibForwardMessages(
  fromChatId: number,
  destChatId: number,
  messageIds: number[],
): Promise<void> {
  if (messageIds.length === 0) return;
  const fwd = (await tdlibClient.send({
    '@type': 'forwardMessages',
    chat_id: destChatId,
    from_chat_id: fromChatId,
    message_ids: messageIds,
    options: null,
    send_copy: false,
    remove_caption: false,
  })) as Record<string, unknown>;
  throwIfTdError(fwd);
}

/** Пересылает сообщения в «Избранное» (Saved Messages). */
export async function tdlibForwardToSavedMessages(fromChatId: number, messageIds: number[]): Promise<void> {
  const me = (await tdlibClient.send({ '@type': 'getMe' })) as Record<string, unknown>;
  throwIfTdError(me);
  const userId = typeof me.id === 'number' ? me.id : null;
  if (userId == null) {
    throw new Error('getMe: нет id пользователя');
  }

  const chat = (await tdlibClient.send({
    '@type': 'createPrivateChat',
    user_id: userId,
    force: true,
  })) as Record<string, unknown>;
  throwIfTdError(chat);
  const destChatId = typeof chat.id === 'number' ? chat.id : null;
  if (destChatId == null) {
    throw new Error('createPrivateChat: нет id чата');
  }

  await tdlibForwardMessages(fromChatId, destChatId, messageIds);
}

export async function tdlibDeleteMessages(chatId: number, messageIds: number[], revoke: boolean): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'deleteMessages',
    chat_id: chatId,
    message_ids: messageIds,
    revoke,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibAddMessageReaction(
  chatId: number,
  messageId: number,
  emoji: string,
  isBig = false,
): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'addMessageReaction',
    chat_id: chatId,
    message_id: messageId,
    reaction_type: {
      '@type': 'reactionTypeEmoji',
      emoji,
    },
    is_big: isBig,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

/** Долгое отключение уведомлений (по сути «без звука» в Telegram). */
const MUTE_FOR_LONG_SEC = 2147483647;

export async function tdlibSetChatMuted(chatId: number, muted: boolean): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'setChatNotificationSettings',
    chat_id: chatId,
    notification_settings: {
      '@type': 'chatNotificationSettings',
      use_default_mute_for: false,
      mute_for: muted ? MUTE_FOR_LONG_SEC : 0,
      use_default_sound: true,
      sound_id: 0,
      use_default_show_preview: true,
      show_preview: true,
      use_default_disable_pinned_message_notifications: true,
      disable_pinned_message_notifications: false,
      use_default_disable_mention_notifications: true,
      disable_mention_notifications: false,
    },
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibBlockUser(userId: number): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'setMessageSenderBlockList',
    sender_id: {
      '@type': 'messageSenderUser',
      user_id: userId,
    },
    block_list: {
      '@type': 'blockListMain',
    },
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibUnblockUser(userId: number): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'setMessageSenderBlockList',
    sender_id: {
      '@type': 'messageSenderUser',
      user_id: userId,
    },
    block_list: null,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibDeleteChat(chatId: number): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'deleteChat',
    chat_id: chatId,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibLeaveChat(chatId: number): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'leaveChat',
    chat_id: chatId,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibToggleChatIsPinned(chatId: number, isPinned: boolean): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'toggleChatIsPinned',
    chat_list: { '@type': 'chatListMain' },
    chat_id: chatId,
    is_pinned: isPinned,
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibSendChatActionTyping(
  chatId: number,
  messageThreadId = 0,
): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'sendChatAction',
    chat_id: chatId,
    message_thread_id: messageThreadId,
    action: { '@type': 'chatActionTyping' },
  })) as Record<string, unknown>;
  throwIfTdError(res);
}

export async function tdlibSendChatActionCancel(
  chatId: number,
  messageThreadId = 0,
): Promise<void> {
  const res = (await tdlibClient.send({
    '@type': 'sendChatAction',
    chat_id: chatId,
    message_thread_id: messageThreadId,
    action: { '@type': 'chatActionCancel' },
  })) as Record<string, unknown>;
  throwIfTdError(res);
}
