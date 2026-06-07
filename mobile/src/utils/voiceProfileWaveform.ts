/** Waveform bars for voice rows in chat/group profile media tabs. */

export const PROFILE_VOICE_BAR_COUNT = 28;
export const PROFILE_VOICE_TRACK_HEIGHT = 28;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createDeterministicSeed(uri: string, durationMs: number): number {
  let hash = durationMs || 1;
  for (let i = 0; i < uri.length; i += 1) {
    hash = (hash * 31 + uri.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function seededUnitNoise(seed: number, index: number): number {
  const x = Math.sin(seed * 0.00013 + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildDecorativeFallback(
  uri: string,
  durationMs: number,
  targetCount: number,
): number[] {
  const seed = createDeterministicSeed(uri, durationMs);
  return Array.from({ length: targetCount }, (_, index) => {
    const t = targetCount <= 1 ? 0 : index / (targetCount - 1);
    const phraseEnvelope = 0.28 + Math.sin(t * Math.PI) * 0.34;
    const phrasePulse =
      Math.sin(t * Math.PI * 4.1 + seededUnitNoise(seed, index) * 1.2) * 0.18;
    const localNoise = (seededUnitNoise(seed, index + 17) - 0.5) * 0.2;
    const gapDip = index % 6 === 0 ? -0.2 : index % 4 === 0 ? -0.08 : 0;
    return clamp01(phraseEnvelope + phrasePulse + localNoise + gapDip);
  });
}

function buildTelegramLikeBars(
  uri: string,
  waveform: number[],
  durationMs: number,
  targetCount: number,
): number[] {
  if (waveform.length === 0) {
    return buildDecorativeFallback(uri, durationMs, targetCount);
  }

  const clamped = waveform.map(clamp01);
  const bucketSize = clamped.length / targetCount;
  const bars = Array.from({ length: targetCount }, (_, i) => {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(clamped.length, Math.ceil((i + 1) * bucketSize));
    const bucket = clamped.slice(start, Math.max(end, start + 1));
    if (bucket.length === 0) return 0;
    const peak = Math.max(...bucket);
    const avg = bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
    return peak * 0.6 + avg * 0.4;
  });

  const min = Math.min(...bars);
  const max = Math.max(...bars);
  const spread = max - min;

  if (spread < 0.005) {
    return buildDecorativeFallback(uri, durationMs, targetCount);
  }

  return bars.map((value, index) => {
    const normalized = (value - min) / spread;
    const t = targetCount <= 1 ? 0.5 : index / (targetCount - 1);
    const edgeTaper = 0.88 + Math.sin(t * Math.PI) * 0.12;
    return clamp01(normalized * edgeTaper);
  });
}

/** Pixel heights for profile voice preview bars (aligned with in-chat VoiceBubble). */
export function buildVoiceProfileBarHeights(
  waveform: number[],
  uri?: string | null,
  durationMs = 0,
): number[] {
  const seedUri = uri?.trim() || 'voice-profile';
  const bars = buildTelegramLikeBars(
    seedUri,
    waveform,
    durationMs,
    PROFILE_VOICE_BAR_COUNT,
  );
  return bars.map((value) => {
    const v = clamp01(value);
    return 2 + Math.pow(v, 1.4) * 22;
  });
}
