import type { Chat } from '../stores/types';

/** Заголовок в списке чатов: для групп/каналов — серверное имя, не локальное имя контакта из ЛС. */
export function getChatListTitle(chat: Chat): string {
  if (chat.chat_type === 'private') {
    return (
      chat.local_contact_name?.trim() ||
      chat.peer_display_name?.trim() ||
      chat.name?.trim() ||
      'Chat'
    );
  }
  return (
    chat.name?.trim() ||
    chat.peer_display_name?.trim() ||
    (chat.chat_type === 'channel' ? 'Канал' : 'Chat')
  );
}
