/**
 * Pure waveform utilities. No RN/expo deps - safe for unit tests in Node.
 */

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

/**
 * Full UI waveform pipeline for recorded audio:
 * 1. normalize metering values
 * 2. resample to target number of bars
 * 3. smooth neighboring peaks
 * 4. ensure a tiny visible floor so silence still renders as subtle bars
 */
export function buildUiWaveform(samples: number[], targetCount: number): number[] {
  const resampled = resampleWaveform(samples, targetCount);
  const smoothed = smoothWaveform(resampled, 1);
  return smoothed.map((sample) => Math.max(0.04, clamp01(sample)));
}

/**
 * Live recording waveform:
 * keeps only the freshest window of samples and boosts speech dynamics
 * so the recording stage visibly reacts to the current loudness.
 */
export function buildLiveWaveform(samples: number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];

  const liveWindow = samples.slice(-Math.max(targetCount * 4, targetCount));
  const resampled = resampleWaveform(liveWindow, targetCount);
  const smoothed = smoothWaveform(resampled, 1);

  return smoothed.map((sample, index) => {
    const freshness = targetCount <= 1 ? 1 : 0.92 + (index / (targetCount - 1)) * 0.16;
    const energized = Math.pow(clamp01(sample), 0.68) * freshness;
    return Math.max(0.08, clamp01(energized));
  });
}
