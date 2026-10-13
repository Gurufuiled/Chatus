/**
 * Защита загрузки истории Telegram-чата: «поколение» (при смене чата прежние загрузки устаревают) и флаг
 * «идёт подгрузка старых сообщений». Чистая логика — покрыта тестами в `historyLoadGuard.test.ts`.
 *
 * Было: флаг подгрузки сбрасывался только у НЕ устаревшей загрузки. Если пользователь переключал чат, пока
 * шла подгрузка страницы старых сообщений, флаг оставался взведённым навсегда, и в новом чате скролл вверх
 * больше ничего не подгружал.
 */

export type HistoryLoadGuard = {
  /** Текущее поколение: запоминаем в начале загрузки. */
  generation: () => number;
  /** Устарела ли загрузка, начатая в поколении `generation`. */
  isStale: (generation: number) => boolean;
  /** Начать подгрузку старых сообщений: `false`, если она уже идёт. */
  tryBeginOlder: () => boolean;
  /** Закончить подгрузку, начатую в поколении `generation`. Устаревшая загрузка чужой флаг не трогает. */
  endOlder: (generation: number) => void;
  /** Подгрузка старых сейчас идёт. */
  isLoadingOlder: () => boolean;
  /** Смена чата/треда: все идущие загрузки устаревают, флаг подгрузки сбрасывается. */
  reset: () => void;
};

export function createHistoryLoadGuard(): HistoryLoadGuard {
  let generation = 0;
  let loadingOlder = false;

  return {
    generation: () => generation,
    isStale: (g) => g !== generation,
    tryBeginOlder() {
      if (loadingOlder) return false;
      loadingOlder = true;
      return true;
    },
    endOlder(g) {
      if (g === generation) loadingOlder = false;
    },
    isLoadingOlder: () => loadingOlder,
    reset() {
      generation += 1;
      loadingOlder = false;
    },
  };
}
