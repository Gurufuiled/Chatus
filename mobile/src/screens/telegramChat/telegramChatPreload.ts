import { TelegramMessageDao } from '../../db/dao/TelegramMessageDao';
import { initDatabase } from '../../services/DatabaseService';
import type { TelegramDialogRow } from '../../stores/telegramAccountStore';
import { telegramUiStore } from '../../stores/telegramUiStore';
import { persistTelegramMessages } from './telegramMessageCache';
import { preloadTelegramChatHistory } from './telegramChatHistoryFetch';

const MIN_CACHED_MESSAGES_TO_SKIP = 45;
const PRELOAD_COOLDOWN_MS = 2 * 60_000;
const BETWEEN_CHATS_DELAY_MS = 350;
const TOP_DIALOGS_PRELOAD_COUNT = 5;
const NEIGHBOR_PRELOAD_RADIUS = 2;

type PreloadTask = {
  chatId: number;
  isGroupChat: boolean;
  priority: number;
};

const lastPreloadFinishedAt = new Map<string, number>();
const inFlight = new Set<string>();
let queue: PreloadTask[] = [];
let pumpRunning = false;

function isGroupChatType(chatType: TelegramDialogRow['chatType']): boolean {
  return chatType === 'group' || chatType === 'supergroup';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeEnqueue(tasks: PreloadTask[]): void {
  const indexByChatId = new Map(queue.map((t, i) => [t.chatId, i]));
  for (const task of tasks) {
    if (inFlight.has(String(task.chatId))) continue;
    const existingIndex = indexByChatId.get(task.chatId);
    if (existingIndex != null) {
      const existing = queue[existingIndex];
      if (existing && task.priority > existing.priority) {
        queue[existingIndex] = { ...existing, priority: task.priority };
      }
      continue;
    }
    queue.push(task);
    indexByChatId.set(task.chatId, queue.length - 1);
  }
  queue.sort((a, b) => b.priority - a.priority);
}

async function shouldSkipPreload(chatId: number): Promise<boolean> {
  const key = String(chatId);
  const last = lastPreloadFinishedAt.get(key);
  if (last != null && Date.now() - last < PRELOAD_COOLDOWN_MS) {
    return true;
  }
  try {
    await initDatabase();
    const dao = new TelegramMessageDao();
    const count = await dao.countByChatThread(chatId, 0);
    return count >= MIN_CACHED_MESSAGES_TO_SKIP;
  } catch {
    return false;
  }
}

function isActiveChat(chatId: number): boolean {
  return telegramUiStore.getState().activeTelegramChatId === String(chatId);
}

async function runPreloadTask(task: PreloadTask): Promise<void> {
  const key = String(task.chatId);
  if (isActiveChat(task.chatId)) return;

  if (await shouldSkipPreload(task.chatId)) return;
  if (isActiveChat(task.chatId)) return;

  inFlight.add(key);
  try {
    const rows = await preloadTelegramChatHistory(task.chatId, task.isGroupChat);
    if (isActiveChat(task.chatId)) return;
    if (rows.length > 0) {
      await persistTelegramMessages(task.chatId, 0, rows);
      lastPreloadFinishedAt.set(key, Date.now());
    }
  } catch {
    /* best-effort background work */
  } finally {
    inFlight.delete(key);
  }
}

async function pumpQueue(): Promise<void> {
  if (pumpRunning) return;
  pumpRunning = true;
  try {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      await runPreloadTask(task);
      if (queue.length > 0) {
        await delay(BETWEEN_CHATS_DELAY_MS);
      }
    }
  } finally {
    pumpRunning = false;
    if (queue.length > 0) {
      void pumpQueue();
    }
  }
}

function scheduleTasks(tasks: PreloadTask[]): void {
  if (tasks.length === 0) return;
  dedupeEnqueue(tasks);
  void pumpQueue();
}

export function scheduleTelegramChatsPreload(
  specs: Array<{ chatId: string; isGroupChat?: boolean; priority?: number }>,
): void {
  const tasks: PreloadTask[] = [];
  for (const spec of specs) {
    const chatId = Number.parseInt(spec.chatId, 10);
    if (!Number.isFinite(chatId)) continue;
    tasks.push({
      chatId,
      isGroupChat: spec.isGroupChat === true,
      priority: spec.priority ?? 0,
    });
  }
  scheduleTasks(tasks);
}

/** Preload chats next to the open one in the dialog list (swipe between chats). */
export function scheduleNeighborTelegramChatsPreload(
  activeChatId: string,
  dialogs: TelegramDialogRow[],
): void {
  const index = dialogs.findIndex((row) => row.chatId === activeChatId);
  if (index < 0) return;

  const tasks: PreloadTask[] = [];
  for (let offset = 1; offset <= NEIGHBOR_PRELOAD_RADIUS; offset += 1) {
    const above = dialogs[index - offset];
    const below = dialogs[index + offset];
    const priority = 100 - offset * 10;
    if (above) {
      const chatId = Number.parseInt(above.chatId, 10);
      if (Number.isFinite(chatId)) {
        tasks.push({
          chatId,
          isGroupChat: isGroupChatType(above.chatType),
          priority,
        });
      }
    }
    if (below) {
      const chatId = Number.parseInt(below.chatId, 10);
      if (Number.isFinite(chatId)) {
        tasks.push({
          chatId,
          isGroupChat: isGroupChatType(below.chatType),
          priority: priority - 1,
        });
      }
    }
  }
  scheduleTasks(tasks);
}

/** After dialog list refresh — warm SQLite for top chats (skip active + already cached). */
export function scheduleTopTelegramChatsPreload(
  dialogs: TelegramDialogRow[],
  count = TOP_DIALOGS_PRELOAD_COUNT,
): void {
  const active = telegramUiStore.getState().activeTelegramChatId;
  const sorted = [...dialogs].sort((a, b) => {
    const au = a.unreadCount ?? 0;
    const bu = b.unreadCount ?? 0;
    if (bu !== au) return bu - au;
    return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
  });

  const tasks: PreloadTask[] = [];
  for (const row of sorted) {
    if (row.chatId === active) continue;
    const chatId = Number.parseInt(row.chatId, 10);
    if (!Number.isFinite(chatId)) continue;
    const unreadBoost = (row.unreadCount ?? 0) > 0 ? 20 : 0;
    tasks.push({
      chatId,
      isGroupChat: isGroupChatType(row.chatType),
      priority: 30 + unreadBoost,
    });
    if (tasks.length >= count) break;
  }
  scheduleTasks(tasks);
}
