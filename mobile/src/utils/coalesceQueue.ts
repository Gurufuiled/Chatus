/**
 * Очередь с объединением: события, пришедшие в течение `delayMs`, обрабатываются одной пачкой.
 * Без импортов react-native — покрыто тестами в `coalesceQueue.test.ts`.
 *
 * Зачем: TDLib присылает `updateFile` по одному на каждый скачанный файл. Раньше на каждое такое событие
 * делался отдельный `setMessages`, и чат из 50 фото перерисовывался 50 раз подряд. Теперь пачка
 * применяется одним обновлением.
 */

export type CoalesceQueue<T> = {
  /** Добавить событие; обработчик вызовется один раз через `delayMs` после первого события пачки. */
  push: (item: T) => void;
  /** Немедленно обработать накопленное (например, перед закрытием экрана). */
  flush: () => void;
  /** Отбросить накопленное без обработки. */
  cancel: () => void;
  /** Сколько событий ждёт обработки. */
  size: () => number;
};

export type CoalesceQueueOptions = {
  /** Подмена таймеров для тестов. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Предел размера пачки: при достижении обрабатываем сразу, не дожидаясь таймера. */
  maxBatchSize?: number;
};

export function createCoalesceQueue<T>(
  handler: (items: T[]) => void,
  delayMs: number,
  options: CoalesceQueueOptions = {},
): CoalesceQueue<T> {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as never));
  const maxBatchSize = options.maxBatchSize ?? Infinity;

  let items: T[] = [];
  let timer: unknown = null;

  const run = () => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    if (items.length === 0) return;
    const batch = items;
    items = [];
    handler(batch);
  };

  return {
    push(item) {
      items.push(item);
      if (items.length >= maxBatchSize) {
        run();
        return;
      }
      if (timer == null) {
        timer = setTimer(() => {
          timer = null;
          run();
        }, delayMs);
      }
    },
    flush: run,
    cancel() {
      if (timer != null) {
        clearTimer(timer);
        timer = null;
      }
      items = [];
    },
    size: () => items.length,
  };
}
