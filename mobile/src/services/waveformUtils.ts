/**
 * Pure waveform utilities. No RN/expo deps - safe for unit tests in Node.
 */

import { resampleToBars } from '../utils/voiceWaveform';

const METERING_MIN_DB = -55;
const METERING_MAX_DB = 0;

/**
 * Maps dB metering to 0..1. Anything below -55 dB is silence (0),
 * 0 dB is max (1). The -55..0 range covers actual speech dynamics,
 * giving much wider spread than the full -160..0 range.
 */
export function dbToNormalized(metering: number | undefined): number {
  if (metering == null || !Number.isFinite(metering)) return 0;
  const clamped = Math.max(METERING_MIN_DB, Math.min(METERING_MAX_DB, metering));
  return (clamped - METERING_MIN_DB) / (METERING_MAX_DB - METERING_MIN_DB);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Downsamples/upsamples raw waveform values into a fixed-size array using windowed averaging.
 * Uses a slight exponent boost so low-mid speech energy reads more clearly in UI.
 */
export function resampleWaveform(samples: number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];

  const normalized = samples
    .map((sample) => clamp01(sample))
    .filter((sample) => Number.isFinite(sample));

  if (normalized.length === 0) {
    return Array(targetCount).fill(0);
  }

  if (normalized.length === 1) {
    return Array(targetCount).fill(normalized[0]);
  }

  const bucketSize = normalized.length / targetCount;
  const result: number[] = [];

  for (let i = 0; i < targetCount; i++) {
    const start = i * bucketSize;
    const end = (i + 1) * bucketSize;
    const startIndex = Math.floor(start);
    const endIndex = Math.min(normalized.length, Math.ceil(end));

    let sum = 0;
    let count = 0;

    for (let j = startIndex; j < endIndex; j++) {
      sum += normalized[j];
      count += 1;
    }

    result.push(count > 0 ? sum / count : normalized[Math.min(startIndex, normalized.length - 1)]);
  }

  return result.map(clamp01);
}

/**
 * Smooths neighboring bars to avoid harsh spikes while keeping overall dynamics.
 */
export function smoothWaveform(samples: number[], radius: number = 1): number[] {
  if (samples.length === 0 || radius <= 0) return samples.map(clamp01);

  return samples.map((_, index) => {
    let weightedSum = 0;
    let weightTotal = 0;

    for (let offset = -radius; offset <= radius; offset++) {
      const neighborIndex = index + offset;
      if (neighborIndex < 0 || neighborIndex >= samples.length) continue;
      const distance = Math.abs(offset);
      const weight = distance === 0 ? 1 : 1 / (distance + 0.35);
      weightedSum += clamp01(samples[neighborIndex]) * weight;
      weightTotal += weight;
    }

    return weightTotal > 0 ? clamp01(weightedSum / weightTotal) : 0;
  });
}

/** Метр expo-av ниже этого уровня (дБ) считаем тишиной / шумом комнаты. */
const SILENCE_DB = -52;
/**
 * Степень сжатия линейной амплитуды. Речь отличается от шума в десятки раз; 0.6 оставляет тишину низкой, но не
 * даёт одному громкому выбросу (кашель, хлопок) сделать всю остальную речь «точками».
 */
const AMPLITUDE_EXPONENT = 0.6;

/**
 * Метр (дБ) → уровень сэмпла 0..1 по ЛИНЕЙНОЙ амплитуде, как у Telegram.
 * Раньше шкала была линейной по дБ (-55…0): шум комнаты (~-45 дБ) получал 0.18, то есть заметную высоту, и дорожка
 * в паузах выглядела так, будто в микрофон кричат. Здесь тишина остаётся почти нулём.
 */
export function dbToAmplitudeSample(metering: number | undefined): number {
  if (metering == null || !Number.isFinite(metering) || metering <= SILENCE_DB) return 0;
  const amplitude = Math.pow(10, Math.min(0, metering) / 20);
  return clamp01(Math.pow(amplitude, AMPLITUDE_EXPONENT));
}

/** Лёгкое сглаживание соседей [0.2, 0.6, 0.2]: убирает одиночные зубцы, но не размазывает речь. */
function lightSmooth(samples: number[]): number[] {
  return samples.map((value, index) => {
    const prev = samples[index - 1] ?? value;
    const next = samples[index + 1] ?? value;
    return clamp01(prev * 0.2 + value * 0.6 + next * 0.2);
  });
}

/**
 * Итоговая дорожка записанного голосового (то, что отправляется и хранится):
 * 1. сэмплы уровня (см. `dbToAmplitudeSample`) приводятся к `targetCount` пик-сэмплированием;
 * 2. лёгкое сглаживание;
 * 3. самое громкое место масштабируется до 1 (если запись не тишина) — как у Telegram;
 * 4. минимальный пол, чтобы тишина оставалась видимыми точками.
 */
export function buildUiWaveform(samples: number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];
  const normalized = samples.map(clamp01);
  if (normalized.length === 0) return Array(targetCount).fill(WAVEFORM_FLOOR);
  const smoothed = lightSmooth(resampleToBars(normalized, targetCount));
  const peak = Math.max(...smoothed);
  const scaled = peak > SILENCE_PEAK_FOR_SCALING ? smoothed.map((value) => value / peak) : smoothed;
  return scaled.map((value) => Math.max(WAVEFORM_FLOOR, clamp01(value)));
}

/** Усиление живой дорожки (на экране записи высота ограничена, а уровень линейный). */
const LIVE_GAIN = 1.6;
/** Минимальная высота столбика готовой дорожки. */
const WAVEFORM_FLOOR = 0.04;
/** Если пик не выше этого, запись — тишина: её не растягиваем до полной высоты. */
const SILENCE_PEAK_FOR_SCALING = 0.08;

/**
 * Живая дорожка во время записи: последние ~2×targetCount сэмплов, лёгкое сглаживание, слабый шум остаётся низким.
 */
export function buildLiveWaveform(samples: number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];

  const liveWindow = samples.slice(-Math.max(targetCount * 2, targetCount));
  const resampled = resampleToBars(liveWindow.map(clamp01), targetCount);
  const smoothed = lightSmooth(resampled);

  return smoothed.map((sample, index) => {
    /** Чуть выше свежее (правый край) — столбики «набегают» справа. */
    const freshness = targetCount <= 1 ? 1 : 0.96 + (index / (targetCount - 1)) * 0.08;
    /** Слабый уровень (шум комнаты) дополнительно прижимаем вниз. */
    const gated = sample < 0.08 ? sample * 0.4 : sample;
    /** Усиление: обычная речь (-25…-10 дБ) занимает середину–верх шкалы, а не её низ. */
    return Math.max(0.045, clamp01(gated * LIVE_GAIN * freshness));
  });
}
