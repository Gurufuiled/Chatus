import type { Message } from '../stores/types';
import { buildChatusDialogPreviewFromMessage } from './chatusDialogPreview';

/** Текст превью последнего сообщения в списке чатов (RU). */
export function buildMessageListPreviewText(msg: Message): string {
  return buildChatusDialogPreviewFromMessage(msg).text;
}
