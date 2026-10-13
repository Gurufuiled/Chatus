/**
 * Плавная перемотка видеокружка кольцом (как в Telegram): быстрые перемотки «на лету» и точная — при отпускании.
 * Без импортов react-native / expo — покрыто тестами в `videoNoteScrub.test.ts`.
 *
 * Почему кадры шли «слайд-шоу»: `player.currentTime = …` по умолчанию перематывает точно в запрошенный кадр, то есть
 * декодер каждый раз идёт от ближайшего ключевого кадра, а перемотки слали не чаще раза в 90 мс. Теперь на время
 * перетаскивания включается режим скраббинга плеера и небольшой допуск точности, перемотки идут чаще (с «хвостом»,
 * чтобы последняя позиция не терялась), а при отпускании выполняется одна точная перемотка.
 */

/** Допуск перемотки во время перетаскивания, секунды: можно показать ближайший кадр рядом, это намного быстрее. */
export const SCRUB_SEEK_TOLERANCE_S = 0.12;
/** Минимальный интервал между перемотками во время перетаскивания, мс (~25 раз в секунду). */
export const SCRUB_SEEK_MIN_INTERVAL_MS = 40;
/** Сдвиг меньше этого значения (мс) не перематываем: кадр всё равно не изменится. */
export const SCRUB_SEEK_MIN_DELTA_MS = 12;

/** Минимальный интерфейс плеера (`expo-video` `VideoPlayer`), нужный для режима скраббинга. */
export type ScrubbablePlayer = {
  seekTolerance?: { toleranceBefore?: number; toleranceAfter?: number };
  scrubbingModeOptions?: { scrubbingModeEnabled?: boolean };
};

/**
 * Включает/выключает «быструю» перемотку плеера. Безопасно для старых версий и платформ, где свойств нет:
 * любые ошибки глотаются, а перемотка продолжает работать в обычном режиме.
 */
export function applyScrubPlayerMode(player: ScrubbablePlayer, enabled: boolean): void {
  try {
    player.seekTolerance = enabled
      ? { toleranceBefore: SCRUB_SEEK_TOLERANCE_S, toleranceAfter: SCRUB_SEEK_TOLERANCE_S }
      : { toleranceBefore: 0, toleranceAfter: 0 };
  } catch {
    // старый плеер без допуска перемотки
  }
  try {
    // На Android в режиме скраббинга воспроизведение подавлено: после перетаскивания его надо выключить.
    player.scrubbingModeOptions = { scrubbingModeEnabled: enabled };
  } catch {
    // старый плеер без режима скраббинга
  }
}

/** Позиция (мс) для доли кольца 0…1 с учётом длительности; всегда в пределах ролика. */
export function scrubPositionMs(progress: number, durationMs: number): number {
  if (!(durationMs > 0) || !Number.isFinite(progress)) return 0;
  return Math.round(Math.min(1, Math.max(0, progress)) * durationMs);
}

export type ScrubSeekSchedulerOptions = {
  /** Выполнить перемотку плеера в позицию (мс). */
  seek: (positionMs: number) => void;
  minIntervalMs?: number;
  minDeltaMs?: number;
  /** Подмена времени и таймеров для тестов. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type ScrubSeekScheduler = {
  /** Новая желаемая позиция: перематывает сразу или (если рано) отложит на «хвост». */
  push: (positionMs: number) => void;
  /** Сбросить отложенное без перемотки (например, перед точной перемоткой при отпускании). */
  cancel: () => void;
};

/**
 * Ограничитель частоты перемоток с «хвостом»: не чаще одного раза в `minIntervalMs`, но последняя позиция
 * гарантированно будет выполнена, даже если палец остановился сразу после очередной перемотки.
 */
export function createScrubSeekScheduler(options: ScrubSeekSchedulerOptions): ScrubSeekScheduler {
  const minIntervalMs = options.minIntervalMs ?? SCRUB_SEEK_MIN_INTERVAL_MS;
  const minDeltaMs = options.minDeltaMs ?? SCRUB_SEEK_MIN_DELTA_MS;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as never));

  let lastSeekAt = -Infinity;
  let lastSeekMs: number | null = null;
  let pendingMs: number | null = null;
  let timer: unknown = null;

  const run = (positionMs: number) => {
    if (lastSeekMs != null && Math.abs(positionMs - lastSeekMs) < minDeltaMs) return;
    lastSeekAt = now();
    lastSeekMs = positionMs;
    options.seek(positionMs);
  };

  const flushPending = () => {
    timer = null;
    if (pendingMs == null) return;
    const next = pendingMs;
    pendingMs = null;
    run(next);
  };

  return {
    push(positionMs) {
      const elapsed = now() - lastSeekAt;
      if (elapsed >= minIntervalMs) {
        if (timer != null) {
          clearTimer(timer);
          timer = null;
        }
        pendingMs = null;
        run(positionMs);
        return;
      }
      pendingMs = positionMs;
      if (timer == null) {
        timer = setTimer(flushPending, Math.max(0, minIntervalMs - elapsed));
      }
    },
    cancel() {
      if (timer != null) {
        clearTimer(timer);
        timer = null;
      }
      pendingMs = null;
      lastSeekMs = null;
      lastSeekAt = -Infinity;
    },
  };
}
