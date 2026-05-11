/**
 * Unit tests for VoiceRecorderService.
 * Focus: dbToNormalized maps -55..0 dB to 0..1 (see waveformUtils); below -55 → 0.
 * Run: npx tsx src/services/VoiceRecorderService.test.ts
 * Native recording (expo-av) requires device; not tested here.
 */

import {
  buildUiWaveform,
  dbToNormalized,
  resampleWaveform,
  smoothWaveform,
} from './waveformUtils';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg}: expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}

function runTests(): void {
  // Silence / below effective range (maps to clamp at METERING_MIN_DB → 0)
  assert(dbToNormalized(-160) === 0, 'dbToNormalized(-160) should be 0');
  assert(dbToNormalized(-80) === 0, 'dbToNormalized(-80) should be 0 (below -55 dB floor)');
  assert(dbToNormalized(-56) === 0, 'dbToNormalized(-56) should be 0');

  // 1 at 0 dB (maximum)
  assert(dbToNormalized(0) === 1, 'dbToNormalized(0) should be 1');

  // Midpoint of -55..0 is -27.5 dB → 0.5
  assertClose(dbToNormalized(-27.5), 0.5, 1e-10, 'dbToNormalized(-27.5) should be ~0.5');

  // Clamp below metering range (treated as silence)
  assert(dbToNormalized(-200) === 0, 'dbToNormalized(-200) should clamp to 0');

  // Clamp above 0
  assert(dbToNormalized(10) === 1, 'dbToNormalized(10) should clamp to 1');
  assert(dbToNormalized(1) === 1, 'dbToNormalized(1) should clamp to 1');

  // undefined
  assert(dbToNormalized(undefined) === 0, 'dbToNormalized(undefined) should be 0');

  // NaN and non-finite
  assert(dbToNormalized(NaN) === 0, 'dbToNormalized(NaN) should be 0');
  assert(dbToNormalized(Infinity) === 0, 'dbToNormalized(Infinity) should be 0');
  assert(dbToNormalized(-Infinity) === 0, 'dbToNormalized(-Infinity) should be 0');

  // Linear interpolation within -55..0
  assertClose(dbToNormalized(-40), (15 / 55), 1e-10, 'dbToNormalized(-40)');
  assertClose(dbToNormalized(-15), (40 / 55), 1e-10, 'dbToNormalized(-15)');

  // Resample keeps requested size
  const resampled = resampleWaveform([0, 0.2, 0.4, 0.6, 0.8, 1], 3);
  assert(resampled.length === 3, 'resampleWaveform should return target length');
  assert(resampled.every((v) => v >= 0 && v <= 1), 'resampleWaveform values should stay in 0..1');

  // Smooth reduces harsh central spike
  const smoothed = smoothWaveform([0, 0, 1, 0, 0], 1);
  assert(smoothed[2] < 1, 'smoothWaveform should soften a peak');
  assert(smoothed[2] > smoothed[1], 'smoothed center should remain higher than neighbors');

  // Full UI waveform pipeline returns visible bars
  const uiWaveform = buildUiWaveform([0, 0.1, 0.4, 0.8, 0.3, 0.05], 8);
  assert(uiWaveform.length === 8, 'buildUiWaveform should return target length');
  assert(uiWaveform.every((v) => v >= 0.04 && v <= 1), 'buildUiWaveform should clamp to visible floor');

  console.log('VoiceRecorderService dbToNormalized: all tests passed');
}

runTests();
