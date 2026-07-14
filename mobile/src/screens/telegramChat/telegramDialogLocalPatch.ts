import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import { telegramAccountStore } from '../../stores/telegramAccountStore';

export function clearTelegramDialogUnreadLocal(chatId: number | string): void {
  telegramAccountStore.getState().patchDialog(String(chatId), { unreadCount: 0 });
}

export function patchTelegramDialogOutgoingPreview(
  chatId: number | string,
  preview: string,
  atMs = Date.now(),
): void {
  telegramAccountStore.getState().patchDialog(String(chatId), {
    unreadCount: 0,
    lastMessagePreview: preview,
    lastMessagePreviewAccent: false,
    lastMessageAt: atMs,
  });
}

/** Marks visible messages as read in TDLib (complements openChat for dialog list sync). */
export async function markTelegramChatMessagesRead(
  chatId: number,
  messageIds: number[],
): Promise<void> {
  if (!Number.isFinite(chatId) || messageIds.length === 0) return;
  const ids = [...new Set(messageIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return;
  try {
    const response = (await tdlibClient.send({
      '@type': 'viewMessages',
      chat_id: chatId,
      message_ids: ids,
      source: { '@type': 'messageSourceChatHistory' },
      force_read: true,
    })) as Record<string, unknown>;
    throwIfTdError(response);
  } catch {
    /* best-effort */
  }
}
