import { TelegramMessageDao } from '../../db/dao/TelegramMessageDao';
import type { TelegramMessageCacheRow } from '../../db/types';
import { initDatabase } from '../../services/DatabaseService';
import type { TelegramMessageRow } from './types';

const CACHE_READ_LIMIT = 100;
const CACHE_KEEP_PER_THREAD = 400;

function isTelegramMessageRow(value: unknown): value is TelegramMessageRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as TelegramMessageRow;
  return (
    typeof row.id === 'string' &&
    typeof row.messageId === 'number' &&
    typeof row.kind === 'string' &&
    typeof row.text === 'string' &&
    typeof row.outgoing === 'boolean' &&
    typeof row.dateMs === 'number' &&
    typeof row.status === 'string'
  );
}

function rowToCacheRecord(
  row: TelegramMessageRow,
  telegramChatId: number,
  messageThreadId: number,
): TelegramMessageCacheRow {
  const now = Date.now();
  return {
    id: row.id,
    telegram_chat_id: telegramChatId,
    message_thread_id: messageThreadId,
    message_id: row.messageId,
    date_ms: row.dateMs,
    outgoing: row.outgoing ? 1 : 0,
    kind: row.kind,
    status: row.status,
    payload_json: JSON.stringify(row),
    updated_at: now,
  };
}

function cacheRecordToRow(record: TelegramMessageCacheRow): TelegramMessageRow | null {
  try {
    const parsed: unknown = JSON.parse(record.payload_json);
    if (!isTelegramMessageRow(parsed)) return null;
    return {
      ...parsed,
      id: record.id,
      messageId: record.message_id,
      dateMs: record.date_ms,
      outgoing: record.outgoing === 1,
      status: parsed.status ?? (record.status as TelegramMessageRow['status']),
      kind: parsed.kind ?? (record.kind as TelegramMessageRow['kind']),
    };
  } catch {
    return null;
  }
}

export async function loadTelegramMessagesFromCache(
  telegramChatId: number,
  messageThreadId = 0,
  limit = CACHE_READ_LIMIT,
): Promise<TelegramMessageRow[]> {
  await initDatabase();
  const dao = new TelegramMessageDao();
  const records = await dao.getByChatThread(telegramChatId, messageThreadId, limit);
  const rows: TelegramMessageRow[] = [];
  for (const record of records) {
    const row = cacheRecordToRow(record);
    if (row) rows.push(row);
  }
  return rows;
}

export async function persistTelegramMessages(
  telegramChatId: number,
  messageThreadId: number,
  messages: TelegramMessageRow[],
): Promise<void> {
  if (messages.length === 0) return;
  await initDatabase();
  const dao = new TelegramMessageDao();
  const records = messages.map((row) => rowToCacheRecord(row, telegramChatId, messageThreadId));
  await dao.upsertBatch(records);
  await dao.pruneToLimit(telegramChatId, messageThreadId, CACHE_KEEP_PER_THREAD);
}

export async function deleteTelegramMessagesFromCache(
  telegramChatId: number,
  messageThreadId: number,
  messageIds: number[],
): Promise<void> {
  if (messageIds.length === 0) return;
  await initDatabase();
  const dao = new TelegramMessageDao();
  await dao.deleteByMessageIds(telegramChatId, messageThreadId, messageIds);
}
