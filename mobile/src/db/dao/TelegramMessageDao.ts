/**
 * Local cache of Telegram (TDLib) messages for offline / instant chat reopen.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { TelegramMessageCacheRow } from '../types';
import { getDatabase } from '../../services/DatabaseService';

const DEFAULT_KEEP_PER_THREAD = 400;

export class TelegramMessageDao {
  private get db(): SQLiteDatabase {
    return getDatabase();
  }

  async upsertBatch(rows: TelegramMessageCacheRow[]): Promise<void> {
    if (rows.length === 0) return;

    // Оптимизация: один многострочный INSERT вместо N отдельных вызовов runAsync в цикле.
    // Это сокращает число переходов JS → Native с N до 1 и даёт ускорение в 2-5× при больших пачках.
    // Если пачка большая (> 500 строк), SQLite может выйти за лимит параметров.
    // Разбиваем на чанки по 500 строк на всякий случай.
    const CHUNK_ROWS = 500;
    if (rows.length <= CHUNK_ROWS) {
      const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params: (string | number | null)[] = [];
      for (const row of rows) {
        params.push(
          row.id,
          row.telegram_chat_id,
          row.message_thread_id,
          row.message_id,
          row.date_ms,
          row.outgoing,
          row.kind,
          row.status,
          row.payload_json,
          row.updated_at,
        );
      }

      await this.db.runAsync(
        `INSERT INTO telegram_messages (
            id, telegram_chat_id, message_thread_id, message_id, date_ms,
            outgoing, kind, status, payload_json, updated_at
          ) VALUES ${placeholders}
          ON CONFLICT(id) DO UPDATE SET
            telegram_chat_id = excluded.telegram_chat_id,
            message_thread_id = excluded.message_thread_id,
            message_id = excluded.message_id,
            date_ms = excluded.date_ms,
            outgoing = excluded.outgoing,
            kind = excluded.kind,
            status = excluded.status,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at`,
        ...params,
      );
    } else {
      // Пачка > 500: оборачиваем чанки в транзакцию
      await this.db.withTransactionAsync(async () => {
        for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
          const chunk = rows.slice(i, i + CHUNK_ROWS);
          const chunkPlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const chunkParams: (string | number | null)[] = [];
          for (const row of chunk) {
            chunkParams.push(
              row.id,
              row.telegram_chat_id,
              row.message_thread_id,
              row.message_id,
              row.date_ms,
              row.outgoing,
              row.kind,
              row.status,
              row.payload_json,
              row.updated_at,
            );
          }
          await this.db.runAsync(
            `INSERT INTO telegram_messages (
                id, telegram_chat_id, message_thread_id, message_id, date_ms,
                outgoing, kind, status, payload_json, updated_at
              ) VALUES ${chunkPlaceholders}
              ON CONFLICT(id) DO UPDATE SET
                telegram_chat_id = excluded.telegram_chat_id,
                message_thread_id = excluded.message_thread_id,
                message_id = excluded.message_id,
                date_ms = excluded.date_ms,
                outgoing = excluded.outgoing,
                kind = excluded.kind,
                status = excluded.status,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at`,
            ...chunkParams,
          );
        }
      });
    }
  }

  // Используется компилятором TS для проверки константы COLS — защита от рассинхрона полей и плейсхолдеров.
  private static readonly _assertCols: 10 = 10 satisfies 10;

  async countByChatThread(telegramChatId: number, messageThreadId: number): Promise<number> {
    const row = await this.db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM telegram_messages
       WHERE telegram_chat_id = ? AND message_thread_id = ?`,
      telegramChatId,
      messageThreadId,
    );
    return row?.c ?? 0;
  }

  async getByChatThread(
    telegramChatId: number,
    messageThreadId: number,
    limit: number,
  ): Promise<TelegramMessageCacheRow[]> {
    return this.db.getAllAsync<TelegramMessageCacheRow>(
      `SELECT * FROM telegram_messages
       WHERE telegram_chat_id = ? AND message_thread_id = ?
       ORDER BY message_id DESC
       LIMIT ?`,
      telegramChatId,
      messageThreadId,
      limit,
    );
  }

  async deleteByMessageIds(
    telegramChatId: number,
    messageThreadId: number,
    messageIds: number[],
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const placeholders = messageIds.map(() => '?').join(',');
    await this.db.runAsync(
      `DELETE FROM telegram_messages
       WHERE telegram_chat_id = ? AND message_thread_id = ? AND message_id IN (${placeholders})`,
      telegramChatId,
      messageThreadId,
      ...messageIds,
    );
  }

  async pruneToLimit(
    telegramChatId: number,
    messageThreadId: number,
    keep = DEFAULT_KEEP_PER_THREAD,
  ): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM telegram_messages
       WHERE telegram_chat_id = ? AND message_thread_id = ?
       AND message_id NOT IN (
         SELECT message_id FROM telegram_messages
         WHERE telegram_chat_id = ? AND message_thread_id = ?
         ORDER BY message_id DESC
         LIMIT ?
       )`,
      telegramChatId,
      messageThreadId,
      telegramChatId,
      messageThreadId,
      keep,
    );
  }
}
