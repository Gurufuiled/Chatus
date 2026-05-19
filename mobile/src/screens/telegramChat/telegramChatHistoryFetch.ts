import { tdlibClient } from '../../services/tdlib/TdlibClient';
import { applyTdlibParameters, waitForTdlibAuthorizationReady } from '../../services/tdlib/tdlibBootstrap';
import { throwIfTdError } from '../../services/tdlib/tdlibErrors';
import {
  loadLastReadOutboxMessageId,
  mapTdMessages,
} from './tdlibMapping';
import type { TelegramMessageRow } from './types';

export const TELEGRAM_HISTORY_PAGE_SIZE = 50;

const MAP_HISTORY_OPTIONS = {
  loadSenderAvatar: false,
  mediaLocalOnly: true,
} as const;

export type FetchTelegramHistoryParams = {
  chatId: number;
  messageThreadId?: number;
  fromMessageId?: number;
  onlyLocal?: boolean;
  isGroupChat?: boolean;
  lastReadOutboxMessageId?: number;
  limit?: number;
};

export async function ensureTelegramTdlibReady(): Promise<boolean> {
  await applyTdlibParameters();
  const { ready } = await waitForTdlibAuthorizationReady();
  return ready;
}

export async function fetchTelegramHistoryBatch(
  params: FetchTelegramHistoryParams,
): Promise<{ rows: TelegramMessageRow[]; lastReadOutboxMessageId: number }> {
  const threadParam =
    typeof params.messageThreadId === 'number' &&
    Number.isFinite(params.messageThreadId) &&
    params.messageThreadId !== 0
      ? params.messageThreadId
      : 0;
  const fromMessageId = params.fromMessageId ?? 0;
  const onlyLocal = params.onlyLocal === true;
  const limit = params.limit ?? TELEGRAM_HISTORY_PAGE_SIZE;

  const [lastReadOutboxMessageId, response] = await Promise.all([
    params.lastReadOutboxMessageId != null
      ? Promise.resolve(params.lastReadOutboxMessageId)
      : fromMessageId === 0
        ? loadLastReadOutboxMessageId(params.chatId)
        : Promise.resolve(0),
    tdlibClient.send({
      '@type': 'getChatHistory',
      chat_id: params.chatId,
      from_message_id: fromMessageId,
      offset: 0,
      limit,
      only_local: onlyLocal,
      message_thread_id: threadParam,
    }) as Promise<Record<string, unknown>>,
  ]);
  throwIfTdError(response);
  const rawMessages = Array.isArray(response.messages) ? response.messages : [];
  const rows = await mapTdMessages(
    rawMessages.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object'),
    lastReadOutboxMessageId,
    8,
    MAP_HISTORY_OPTIONS,
  );
  return { rows, lastReadOutboxMessageId };
}

/** Initial history page for preload / background warm-up (local TDLib cache, then network). */
export async function preloadTelegramChatHistory(
  chatId: number,
  isGroupChat: boolean,
): Promise<TelegramMessageRow[]> {
  if (!Number.isFinite(chatId)) return [];
  const ready = await ensureTelegramTdlibReady();
  if (!ready) return [];

  let lastRead = 0;
  let localRows: TelegramMessageRow[] = [];
  try {
    const local = await fetchTelegramHistoryBatch({
      chatId,
      onlyLocal: true,
      isGroupChat,
    });
    lastRead = local.lastReadOutboxMessageId;
    localRows = local.rows;
  } catch {
    /* TDLib local cache miss */
  }

  try {
    const remote = await fetchTelegramHistoryBatch({
      chatId,
      onlyLocal: false,
      isGroupChat,
      lastReadOutboxMessageId: lastRead,
    });
    return remote.rows.length > 0 ? remote.rows : localRows;
  } catch {
    return localRows;
  }
}
