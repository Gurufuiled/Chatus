/**
 * Дорожка голосового как в Telegram: тонкие скруглённые столбики одинаковой ширины, число столбиков зависит от
 * ширины дорожки, высота — линейная амплитуда относительно самого громкого места, тишина — короткие точки.
 * Чистая логика без RN: покрыта тестами в `voiceWaveform.test.ts`.
 *
 * Что было не так: `peak*0.6 + avg*0.4` с растяжкой «минимум…максимум» поднимало фоновый шум до полной высоты
 * («в тишине дорожка строилась, будто кричишь»), а 74 плотных столбика выглядели кашей.
 */

export const VOICE_BAR_WIDTH = 2;
export const VOICE_BAR_GAP = 2;
export const VOICE_BAR_MIN_HEIGHT = 2;
export const VOICE_BAR_MAX_HEIGHT = 22;
/** Сколько столбиков рисовать, пока ширина дорожки ещё не измерена. */
export const VOICE_BAR_FALLBACK_COUNT = 40;
const VOICE_BAR_COUNT_MIN = 16;
const VOICE_BAR_COUNT_MAX = 90;

/** Ниже этого пика запись считается тишиной: рисуем ровные точки, а не растягиваем шум. */
const SILENCE_PEAK = 0.015;
/** Высота «точки» тишины (доля от максимума). */
const SILENCE_LEVEL = 0.03;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Сколько столбиков помещается в дорожку шириной `width` (с шагом `barWidth + gap`). */
export function voiceBarCountForWidth(
  width: number,
  barWidth: number = VOICE_BAR_WIDTH,
  gap: number = VOICE_BAR_GAP,
): number {
  if (!Number.isFinite(width) || width <= 0) return VOICE_BAR_FALLBACK_COUNT;
  const count = Math.floor((width + gap) / (barWidth + gap));
  return Math.max(VOICE_BAR_COUNT_MIN, Math.min(VOICE_BAR_COUNT_MAX, count));
}

function hashSeed(seed: string, durationMs: number): number {
  let hash = durationMs || 1;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function unitNoise(seed: number, index: number): number {
  const x = Math.sin(seed * 0.00013 + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Условная «речь» для голосовых без данных о громкости (грузится или у сообщения нет дорожки). */
export function buildDecorativeBars(count: number, seed: string, durationMs = 0): number[] {
  const s = hashSeed(seed, durationMs);
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0 : index / (count - 1);
    const envelope = 0.3 + Math.sin(t * Math.PI) * 0.3;
    const pulse = Math.sin(t * Math.PI * 5 + unitNoise(s, index) * 1.4) * 0.2;
    const noise = (unitNoise(s, index + 17) - 0.5) * 0.25;
    const dip = index % 7 === 0 ? -0.18 : 0;
    return clamp01(envelope + pulse + noise + dip);
  });
}

/** Приводит дорожку (любой длины) к `targetCount` значениям: пик-сэмплирование вниз, интерполяция вверх. */
export function resampleToBars(samples: readonly number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];
  const n = samples.length;
  if (n === 0) return Array(targetCount).fill(0);
  if (n === 1) return Array(targetCount).fill(samples[0]);

  if (n < targetCount) {
    // растяжка: линейная интерполяция между соседними значениями
    return Array.from({ length: targetCount }, (_, i) => {
      const pos = (i * (n - 1)) / Math.max(targetCount - 1, 1);
      const lo = Math.floor(pos);
      const hi = Math.min(n - 1, lo + 1);
      const frac = pos - lo;
      return samples[lo] * (1 - frac) + samples[hi] * frac;
    });
  }

  const bucket = n / targetCount;
  return Array.from({ length: targetCount }, (_, i) => {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.min(n, Math.ceil((i + 1) * bucket)));
    let peak = 0;
    let sum = 0;
    for (let j = start; j < end; j += 1) {
      peak = Math.max(peak, samples[j]);
      sum += samples[j];
    }
    const avg = sum / (end - start);
    // ближе к пику (как у Telegram): речь читается, но отдельный выброс не съедает соседей
    return peak * 0.65 + avg * 0.35;
  });
}

function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(sortedAsc.length * p)));
  return sortedAsc[index];
}

/**
 * Нормализованные столбики 0..1 для показа.
 * - тишина (все значения почти нулевые) → ровные точки, шум не растягивается;
 * - паузы в речи → низ шкалы, речь → верх: «пол» берётся по низким значениям, но не выше трети максимума;
 * - почти ровная запись (всё примерно одинаково громко) → средние ровные столбики, без искусственных перепадов.
 */
export function buildVoiceBars(
  waveform: readonly number[] | null | undefined,
  targetCount: number,
  seed = 'voice',
  durationMs = 0,
): number[] {
  if (targetCount <= 0) return [];
  const samples = (waveform ?? []).filter((v) => Number.isFinite(v)).map(clamp01);
  if (samples.length === 0) return buildDecorativeBars(targetCount, seed, durationMs);

  const raw = resampleToBars(samples, targetCount).map(clamp01);
  const max = Math.max(...raw);
  if (max < SILENCE_PEAK) return raw.map(() => SILENCE_LEVEL);

  const sorted = [...raw].sort((a, b) => a - b);
  const low = percentile(sorted, 0.12);
  // почти ровная запись: тихие и громкие места почти не отличаются — рисуем ровные средние столбики
  if (max - low < max * 0.2) {
    return raw.map((v) => clamp01((v / max) * 0.5));
  }
  const floor = Math.min(low, max * 0.35);
  const range = max - floor;
  return raw.map((v) => clamp01((v - floor) / range));
}

/** Высота столбика в px по нормализованному значению. */
export function voiceBarHeight(
  normalized: number,
  minHeight: number = VOICE_BAR_MIN_HEIGHT,
  maxHeight: number = VOICE_BAR_MAX_HEIGHT,
): number {
  return minHeight + clamp01(normalized) * (maxHeight - minHeight);
}

/** Доля 0..1 по координате пальца на дорожке. */
export function waveformRatioFromX(x: number, width: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return 0;
  return clamp01(x / width);
}

/** Позиция воспроизведения в мс по доле дорожки. */
export function positionMsForRatio(ratio: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.round(clamp01(ratio) * durationMs);
}

/** Сколько столбиков закрашено при прогрессе 0..1 (0 — ни одного). */
export function filledBarCount(progress: number, barCount: number): number {
  if (barCount <= 0 || !(progress > 0)) return 0;
  return Math.min(barCount, Math.ceil(clamp01(progress) * barCount));
}
